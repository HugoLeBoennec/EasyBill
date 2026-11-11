/**
 * Invoice Repository
 *
 * Data access layer for invoices and invoice lines
 */

import type Database from 'better-sqlite3';
import type {
  Invoice,
  InvoiceLine,
  InvoiceComplete,
  InvoiceFilter,
  InvoicePayment,
  NewRecord,
  UpdateRecord,
} from '../types';

// ============================================================================
// PURE HELPERS (no database access - shared by the form, the repository and
// the export mapper so that totals are computed the same way everywhere)
// ============================================================================

/** Prefix of the provisional number carried by drafts (never a legal number). */
export const DRAFT_NUMBER_PREFIX = 'BROUILLON-';

/** True when the number is a provisional draft number. */
export function isDraftNumber(invoiceNumber: string | undefined | null): boolean {
  return !invoiceNumber || invoiceNumber.startsWith(DRAFT_NUMBER_PREFIX);
}

/**
 * Round to the nearest integer, half away from zero, after removing binary
 * floating point noise (e.g. 2.675 * 100 = 267.49999999999994 must give 268).
 */
export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const cleaned = Number(Math.abs(value).toPrecision(12));
  return Math.sign(value) * Math.round(cleaned);
}

/** Convert an amount in euros (user input) to integer cents. */
export function eurosToCents(euros: number): number {
  return roundHalfUp(euros * 100);
}

/**
 * Amounts of one line, in cents.
 * line_amount = quantity x unit price, rounded to the cent.
 */
export function computeLineAmounts(
  quantity: number,
  unitPriceCents: number,
  vatRate: number,
  discountCents = 0
): { line_amount: number; line_total: number; vat_amount: number } {
  const line_amount = roundHalfUp(quantity * unitPriceCents);
  const line_total = line_amount - (discountCents || 0);
  const vat_amount = roundHalfUp((line_total * vatRate) / 100);
  return { line_amount, line_total, vat_amount };
}

export interface VatBreakdownEntry {
  vat_category: string;
  vat_rate: number;
  /** Sum of the line net amounts of this category/rate (cents) */
  taxable_amount: number;
  /** VAT of this category/rate (cents) */
  tax_amount: number;
}

export interface InvoiceTotals {
  subtotal_amount: number; // HT, cents
  tax_amount: number; // TVA, cents
  total_amount: number; // TTC, cents
  vat_breakdown: VatBreakdownEntry[];
}

/**
 * Invoice totals, in cents, following EN16931 rules:
 * - HT  = sum of the line net amounts (each already rounded to the cent)
 * - TVA = for each (category, rate): round(taxable base x rate), then summed
 * - TTC = HT + TVA
 */
export function computeInvoiceTotals(
  lines: ReadonlyArray<{ line_total: number; vat_rate: number; vat_category?: string }>
): InvoiceTotals {
  const groups = new Map<string, VatBreakdownEntry>();
  for (const line of lines) {
    const vat_rate = Number(line.vat_rate) || 0;
    const vat_category = line.vat_category || (vat_rate > 0 ? 'S' : 'E');
    const key = `${vat_category}|${vat_rate}`;
    const group = groups.get(key);
    if (group) {
      group.taxable_amount += line.line_total;
    } else {
      groups.set(key, { vat_category, vat_rate, taxable_amount: line.line_total, tax_amount: 0 });
    }
  }
  const vat_breakdown = Array.from(groups.values()).sort(
    (a, b) => b.vat_rate - a.vat_rate || a.vat_category.localeCompare(b.vat_category)
  );
  let subtotal_amount = 0;
  let tax_amount = 0;
  for (const group of vat_breakdown) {
    group.tax_amount = roundHalfUp((group.taxable_amount * group.vat_rate) / 100);
    subtotal_amount += group.taxable_amount;
    tax_amount += group.tax_amount;
  }
  return { subtotal_amount, tax_amount, total_amount: subtotal_amount + tax_amount, vat_breakdown };
}

/** Header of a draft as edited in the form. */
export interface InvoiceDraftInput {
  invoice_date: string; // YYYY-MM-DD
  due_date?: string | null;
  buyer_id: number;
  seller_id?: number | null;
  payment_terms_days?: number | null;
  notes?: string | null;
  buyer_reference?: string | null;
  purchase_order_ref?: string | null;
  currency?: string;
  invoice_type?: Invoice['invoice_type'];
}

/** Line of a draft as edited in the form (amounts are computed by the repository). */
export interface InvoiceDraftLineInput {
  /** Existing line id (update) - omit for a new line */
  id?: number;
  item_name: string;
  item_description?: string | null;
  item_code?: string | null;
  quantity: number;
  unit_code?: string;
  /** Unit price excluding VAT, in cents */
  unit_price: number;
  vat_rate: number;
  vat_category?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Fields that can no longer change once the invoice has been issued. */
const LOCKED_AFTER_ISSUE = new Set([
  'invoice_number',
  'invoice_date',
  'due_date',
  'invoice_type',
  'subtotal_amount',
  'tax_amount',
  'total_amount',
  'currency',
  'seller_id',
  'buyer_id',
  'notes',
  'buyer_reference',
  'purchase_order_ref',
  'payment_terms_days',
]);

const ISSUED_INVOICE_ERROR =
  'Une facture émise ne peut plus être modifiée ni supprimée. Pour la corriger, émettez une facture d\'avoir.';

export class InvoiceRepository {
  constructor(private db: Database.Database) {}

  private columnCache = new Map<string, Set<string>>();

  /** Columns really present in a table (the schema may or may not have optional columns). */
  private columnsOf(table: 'invoices' | 'invoice_lines'): Set<string> {
    let columns = this.columnCache.get(table);
    if (!columns) {
      const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      columns = new Set(rows.map((row) => row.name));
      this.columnCache.set(table, columns);
    }
    return columns;
  }

  /** Keep only real, updatable columns (also prevents SQL injection through keys). */
  private updatableFields(table: 'invoices' | 'invoice_lines', updates: object): string[] {
    const columns = this.columnsOf(table);
    return Object.keys(updates).filter(
      (field) =>
        columns.has(field) &&
        field !== 'id' &&
        field !== 'created_at' &&
        field !== 'updated_at' &&
        (updates as Record<string, unknown>)[field] !== undefined
    );
  }

  private assertDraft(invoiceId: number): void {
    const invoice = this.findById(invoiceId);
    if (!invoice) {
      throw new Error('Facture introuvable.');
    }
    if (invoice.status !== 'draft') {
      throw new Error(ISSUED_INVOICE_ERROR);
    }
  }

  // ========================================================================
  // INVOICE CRUD OPERATIONS
  // ========================================================================

  /**
   * Create a new invoice
   *
   * A draft never consumes a number of the legal sequence: whatever
   * invoice_number is passed, a draft is stored with a provisional number
   * (BROUILLON-<id>). The definitive number is assigned by finalize().
   */
  create(invoice: NewRecord<Invoice>): number {
    const hasPaymentTerms = this.columnsOf('invoices').has('payment_terms_days');
    const stmt = this.db.prepare(`
      INSERT INTO invoices (
        invoice_number, invoice_date, due_date, invoice_type,
        subtotal_amount, tax_amount, total_amount, paid_amount, currency,
        seller_id, buyer_id, status, payment_status,
        notes, buyer_reference, purchase_order_ref
        ${hasPaymentTerms ? ', payment_terms_days' : ''}
      ) VALUES (
        @invoice_number, @invoice_date, @due_date, @invoice_type,
        @subtotal_amount, @tax_amount, @total_amount, @paid_amount, @currency,
        @seller_id, @buyer_id, @status, @payment_status,
        @notes, @buyer_reference, @purchase_order_ref
        ${hasPaymentTerms ? ', @payment_terms_days' : ''}
      )
    `);

    const isDraft = (invoice.status || 'draft') === 'draft';
    const row = {
      invoice_number: isDraft
        ? `${DRAFT_NUMBER_PREFIX}TMP-${Date.now()}-${Math.random().toString(36).slice(2)}`
        : invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date ?? null,
      invoice_type: invoice.invoice_type || 'invoice',
      subtotal_amount: invoice.subtotal_amount ?? 0,
      tax_amount: invoice.tax_amount ?? 0,
      total_amount: invoice.total_amount ?? 0,
      paid_amount: invoice.paid_amount ?? 0,
      currency: invoice.currency || 'EUR',
      seller_id: invoice.seller_id ?? null,
      buyer_id: invoice.buyer_id ?? null,
      status: invoice.status || 'draft',
      payment_status: invoice.payment_status || 'unpaid',
      notes: invoice.notes ?? null,
      buyer_reference: invoice.buyer_reference ?? null,
      purchase_order_ref: invoice.purchase_order_ref ?? null,
      payment_terms_days: invoice.payment_terms_days ?? 30,
    };

    const insert = this.db.transaction(() => {
      const id = stmt.run(row).lastInsertRowid as number;
      if (isDraft) {
        this.db
          .prepare('UPDATE invoices SET invoice_number = ? WHERE id = ?')
          .run(`${DRAFT_NUMBER_PREFIX}${id}`, id);
      }
      return id;
    });
    return insert();
  }

  /**
   * Find invoice by ID
   */
  findById(id: number): Invoice | undefined {
    const stmt = this.db.prepare('SELECT * FROM invoices WHERE id = ?');
    return stmt.get(id) as Invoice | undefined;
  }

  /**
   * Find invoice by invoice number
   */
  findByNumber(invoiceNumber: string): Invoice | undefined {
    const stmt = this.db.prepare(
      'SELECT * FROM invoices WHERE invoice_number = ?'
    );
    return stmt.get(invoiceNumber) as Invoice | undefined;
  }

  /**
   * Find all invoices with optional filtering
   */
  findAll(filter?: InvoiceFilter): Invoice[] {
    let sql = 'SELECT * FROM invoices WHERE 1=1';
    const params: any[] = [];

    if (filter) {
      if (filter.status) {
        sql += ' AND status = ?';
        params.push(filter.status);
      }
      if (filter.payment_status) {
        sql += ' AND payment_status = ?';
        params.push(filter.payment_status);
      }
      if (filter.seller_id) {
        sql += ' AND seller_id = ?';
        params.push(filter.seller_id);
      }
      if (filter.buyer_id) {
        sql += ' AND buyer_id = ?';
        params.push(filter.buyer_id);
      }
      if (filter.from_date) {
        sql += ' AND invoice_date >= ?';
        params.push(filter.from_date);
      }
      if (filter.to_date) {
        sql += ' AND invoice_date <= ?';
        params.push(filter.to_date);
      }
      if (filter.search) {
        sql += ' AND (invoice_number LIKE ? OR notes LIKE ?)';
        const searchTerm = `%${filter.search}%`;
        params.push(searchTerm, searchTerm);
      }
    }

    sql += ' ORDER BY invoice_date DESC, id DESC';

    if (filter?.limit) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
      if (filter.offset) {
        sql += ' OFFSET ?';
        params.push(filter.offset);
      }
    }

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as Invoice[];
  }

  /**
   * Find complete invoice with party information
   */
  findCompleteById(id: number): InvoiceComplete | undefined {
    const stmt = this.db.prepare(
      'SELECT * FROM v_invoices_complete WHERE id = ?'
    );
    return stmt.get(id) as InvoiceComplete | undefined;
  }

  /**
   * Update invoice
   */
  update(id: number, updates: UpdateRecord<Invoice>): boolean {
    const fields = this.updatableFields('invoices', updates);
    if (fields.length === 0) return false;

    const current = this.findById(id);
    if (!current) return false;

    const values = updates as Record<string, unknown>;
    if (current.status !== 'draft') {
      // An issued invoice is immutable (only status / payment / signature data may evolve)
      const locked = fields.filter(
        (field) =>
          LOCKED_AFTER_ISSUE.has(field) &&
          (values[field] ?? null) !== ((current as unknown as Record<string, unknown>)[field] ?? null)
      );
      if (locked.length > 0 || values.status === 'draft') {
        throw new Error(ISSUED_INVOICE_ERROR);
      }
    } else {
      if (fields.includes('invoice_number') && values.invoice_number !== current.invoice_number) {
        throw new Error(
          'Le numéro de facture est attribué automatiquement lors de la finalisation.'
        );
      }
      if (fields.includes('status') && values.status !== 'draft') {
        throw new Error(
          'Utilisez la finalisation pour émettre une facture (attribution du numéro).'
        );
      }
    }

    const setClause = fields.map((field) => `${field} = @${field}`).join(', ');
    const sql = `UPDATE invoices SET ${setClause} WHERE id = @id`;

    const params: Record<string, unknown> = { id };
    for (const field of fields) params[field] = values[field];

    const stmt = this.db.prepare(sql);
    const result = stmt.run(params);

    return result.changes > 0;
  }

  /**
   * Delete invoice
   *
   * Only drafts can be deleted: an issued invoice holds a number of the
   * legal sequence and deleting it would create a gap.
   */
  delete(id: number): boolean {
    const invoice = this.findById(id);
    if (!invoice) return false;
    if (invoice.status !== 'draft') {
      throw new Error(ISSUED_INVOICE_ERROR);
    }
    const stmt = this.db.prepare("DELETE FROM invoices WHERE id = ? AND status = 'draft'");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Count invoices
   */
  count(filter?: InvoiceFilter): number {
    let sql = 'SELECT COUNT(*) as count FROM invoices WHERE 1=1';
    const params: any[] = [];

    if (filter) {
      if (filter.status) {
        sql += ' AND status = ?';
        params.push(filter.status);
      }
      if (filter.payment_status) {
        sql += ' AND payment_status = ?';
        params.push(filter.payment_status);
      }
    }

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }

  // ========================================================================
  // INVOICE LINE OPERATIONS
  // ========================================================================

  /**
   * Create invoice line
   */
  createLine(line: NewRecord<InvoiceLine>): number {
    this.assertDraft(line.invoice_id);
    const stmt = this.db.prepare(`
      INSERT INTO invoice_lines (
        invoice_id, line_number,
        item_name, item_description, item_code, item_gtin,
        quantity, unit_code,
        unit_price, line_amount, discount_amount, line_total,
        vat_category, vat_rate, vat_amount,
        period_start, period_end
      ) VALUES (
        @invoice_id, @line_number,
        @item_name, @item_description, @item_code, @item_gtin,
        @quantity, @unit_code,
        @unit_price, @line_amount, @discount_amount, @line_total,
        @vat_category, @vat_rate, @vat_amount,
        @period_start, @period_end
      )
    `);

    const result = stmt.run({
      invoice_id: line.invoice_id,
      line_number: line.line_number,
      item_name: line.item_name,
      item_description: line.item_description ?? null,
      item_code: line.item_code ?? null,
      item_gtin: line.item_gtin ?? null,
      quantity: line.quantity,
      unit_code: line.unit_code || 'C62',
      unit_price: line.unit_price,
      line_amount: line.line_amount,
      discount_amount: line.discount_amount ?? 0,
      line_total: line.line_total,
      vat_category: line.vat_category || 'S',
      vat_rate: line.vat_rate,
      vat_amount: line.vat_amount,
      period_start: line.period_start ?? null,
      period_end: line.period_end ?? null,
    });
    return result.lastInsertRowid as number;
  }

  /**
   * Find lines by invoice ID
   */
  findLinesByInvoiceId(invoiceId: number): InvoiceLine[] {
    const stmt = this.db.prepare(`
      SELECT * FROM invoice_lines
      WHERE invoice_id = ?
      ORDER BY line_number
    `);
    return stmt.all(invoiceId) as InvoiceLine[];
  }

  /**
   * Update invoice line
   */
  updateLine(id: number, updates: UpdateRecord<InvoiceLine>): boolean {
    const fields = this.updatableFields('invoice_lines', updates).filter(
      (field) => field !== 'invoice_id'
    );
    if (fields.length === 0) return false;

    const line = this.findLineById(id);
    if (!line) return false;
    this.assertDraft(line.invoice_id);

    const setClause = fields.map((field) => `${field} = @${field}`).join(', ');
    const sql = `UPDATE invoice_lines SET ${setClause} WHERE id = @id`;

    const values = updates as Record<string, unknown>;
    const params: Record<string, unknown> = { id };
    for (const field of fields) params[field] = values[field];

    const stmt = this.db.prepare(sql);
    const result = stmt.run(params);

    return result.changes > 0;
  }

  /**
   * Find a single line by ID
   */
  findLineById(id: number): InvoiceLine | undefined {
    const stmt = this.db.prepare('SELECT * FROM invoice_lines WHERE id = ?');
    return stmt.get(id) as InvoiceLine | undefined;
  }

  /**
   * Delete invoice line
   */
  deleteLine(id: number): boolean {
    const line = this.findLineById(id);
    if (!line) return false;
    this.assertDraft(line.invoice_id);
    const stmt = this.db.prepare('DELETE FROM invoice_lines WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Delete all lines for an invoice
   */
  deleteAllLines(invoiceId: number): number {
    this.assertDraft(invoiceId);
    const stmt = this.db.prepare(
      'DELETE FROM invoice_lines WHERE invoice_id = ?'
    );
    const result = stmt.run(invoiceId);
    return result.changes;
  }

  // ========================================================================
  // BUSINESS LOGIC OPERATIONS
  // ========================================================================

  /**
   * Create (id = null) or update a draft together with its lines, atomically.
   *
   * Line amounts and invoice totals are always computed here (never trusted
   * from the caller) so that the form, the database and the generated
   * documents agree to the cent.
   *
   * Lines: an input line with an id is updated, one without id is inserted,
   * and existing lines missing from the input are deleted.
   */
  saveDraft(
    id: number | null,
    header: InvoiceDraftInput,
    lines: InvoiceDraftLineInput[]
  ): number {
    if (!header || !ISO_DATE.test(header.invoice_date || '')) {
      throw new Error('La date de facture est obligatoire.');
    }
    if (header.due_date && !ISO_DATE.test(header.due_date)) {
      throw new Error("La date d'échéance est invalide.");
    }
    if (header.due_date && header.due_date < header.invoice_date) {
      throw new Error("La date d'échéance ne peut pas précéder la date de facture.");
    }
    if (!header.buyer_id) {
      throw new Error('Veuillez sélectionner un client.');
    }
    const buyer = this.db.prepare('SELECT id FROM parties WHERE id = ?').get(header.buyer_id);
    if (!buyer) {
      throw new Error("Le client sélectionné n'existe plus.");
    }

    const computedLines = (lines || []).map((line, index) => {
      const label = `Ligne ${index + 1}`;
      const item_name = (line.item_name || '').trim();
      const quantity = Number(line.quantity);
      const unit_price = Number(line.unit_price);
      const vat_rate = Number(line.vat_rate);
      if (!item_name) throw new Error(`${label} : la désignation est obligatoire.`);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(`${label} : la quantité doit être supérieure à zéro.`);
      }
      if (!Number.isInteger(unit_price) || unit_price < 0) {
        throw new Error(`${label} : le prix unitaire est invalide.`);
      }
      if (!Number.isFinite(vat_rate) || vat_rate < 0 || vat_rate > 100) {
        throw new Error(`${label} : le taux de TVA est invalide.`);
      }
      const amounts = computeLineAmounts(quantity, unit_price, vat_rate);
      return {
        id: line.id,
        line_number: index + 1,
        item_name,
        item_description: (line.item_description || '').trim() || null,
        item_code: line.item_code || null,
        quantity,
        unit_code: line.unit_code || 'C62',
        unit_price,
        line_amount: amounts.line_amount,
        discount_amount: 0,
        line_total: amounts.line_total,
        vat_category: line.vat_category || (vat_rate > 0 ? 'S' : 'E'),
        vat_rate,
        vat_amount: amounts.vat_amount,
      };
    });
    const totals = computeInvoiceTotals(computedLines);

    const save = this.db.transaction(() => {
      let sellerId = header.seller_id ?? null;
      if (!sellerId) {
        const company = this.db
          .prepare("SELECT id FROM parties WHERE party_type = 'company' ORDER BY id LIMIT 1")
          .get() as { id: number } | undefined;
        sellerId = company?.id ?? null;
      }

      const headerValues: UpdateRecord<Invoice> = {
        invoice_date: header.invoice_date,
        due_date: header.due_date || undefined,
        invoice_type: header.invoice_type || 'invoice',
        subtotal_amount: totals.subtotal_amount,
        tax_amount: totals.tax_amount,
        total_amount: totals.total_amount,
        currency: header.currency || 'EUR',
        seller_id: sellerId ?? undefined,
        buyer_id: header.buyer_id,
        payment_terms_days: header.payment_terms_days ?? 30,
        notes: (header.notes || '').trim() || undefined,
        buyer_reference: header.buyer_reference || undefined,
        purchase_order_ref: header.purchase_order_ref || undefined,
      };

      let invoiceId: number;
      if (id === null || id === undefined) {
        invoiceId = this.create({
          ...(headerValues as NewRecord<Invoice>),
          invoice_number: '',
          paid_amount: 0,
          status: 'draft',
          payment_status: 'unpaid',
        });
      } else {
        this.assertDraft(id);
        invoiceId = id;
        // Explicit NULLs so that cleared optional fields are really cleared
        const columns = this.columnsOf('invoices');
        const fields = Object.keys(headerValues).filter((field) => columns.has(field));
        const params: Record<string, unknown> = { id };
        for (const field of fields) {
          params[field] = (headerValues as Record<string, unknown>)[field] ?? null;
        }
        this.db
          .prepare(
            `UPDATE invoices SET ${fields.map((f) => `${f} = @${f}`).join(', ')} WHERE id = @id`
          )
          .run(params);
      }

      // --- lines: delete removed, then update / insert ---
      const existing = this.findLinesByInvoiceId(invoiceId);
      const existingIds = new Set(existing.map((line) => line.id as number));
      const keptIds = new Set(
        computedLines.filter((l) => l.id !== undefined && existingIds.has(l.id)).map((l) => l.id)
      );
      const deleteStmt = this.db.prepare('DELETE FROM invoice_lines WHERE id = ?');
      for (const line of existing) {
        if (!keptIds.has(line.id)) deleteStmt.run(line.id);
      }
      // Free the line numbers first (UNIQUE(invoice_id, line_number))
      this.db
        .prepare('UPDATE invoice_lines SET line_number = -line_number WHERE invoice_id = ?')
        .run(invoiceId);

      const updateStmt = this.db.prepare(`
        UPDATE invoice_lines SET
          line_number = @line_number,
          item_name = @item_name, item_description = @item_description, item_code = @item_code,
          quantity = @quantity, unit_code = @unit_code,
          unit_price = @unit_price, line_amount = @line_amount,
          discount_amount = @discount_amount, line_total = @line_total,
          vat_category = @vat_category, vat_rate = @vat_rate, vat_amount = @vat_amount,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = @id AND invoice_id = @invoice_id
      `);
      for (const line of computedLines) {
        if (line.id !== undefined && keptIds.has(line.id)) {
          updateStmt.run({ ...line, invoice_id: invoiceId });
        } else {
          this.createLine({ ...line, id: undefined, invoice_id: invoiceId } as NewRecord<InvoiceLine>);
        }
      }
      return invoiceId;
    });

    return save();
  }

  /**
   * Finalize invoice (change status from draft to finalized)
   *
   * This is where the definitive invoice number is assigned, inside a
   * transaction, so that the sequence of issued invoices is unique,
   * continuous (drafts and deleted drafts never consume a number) and
   * chronological (an invoice cannot be dated before the last issued one).
   *
   * Returns false when the invoice does not exist or is not a draft;
   * throws (French message) when the draft cannot legally be issued.
   */
  finalize(id: number, prefix: string = 'INV'): boolean {
    const run = this.db.transaction(() => {
      const invoice = this.findById(id);
      if (!invoice || invoice.status !== 'draft') return false;

      if (!ISO_DATE.test(invoice.invoice_date || '')) {
        throw new Error('La date de facture est obligatoire pour finaliser la facture.');
      }
      if (!invoice.buyer_id) {
        throw new Error('Un client doit être sélectionné pour finaliser la facture.');
      }
      const lines = this.findLinesByInvoiceId(id);
      if (lines.length === 0) {
        throw new Error('Impossible de finaliser une facture sans ligne.');
      }

      const last = this.db
        .prepare("SELECT MAX(invoice_date) AS last_date FROM invoices WHERE status != 'draft'")
        .get() as { last_date: string | null };
      if (last.last_date && invoice.invoice_date < last.last_date.slice(0, 10)) {
        const fr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
        throw new Error(
          `La date de la facture (${fr(invoice.invoice_date)}) est antérieure à celle de la dernière facture émise (${fr(last.last_date)}). ` +
            'La numérotation doit rester chronologique : modifiez la date de la facture avant de la finaliser.'
        );
      }

      const year = Number(invoice.invoice_date.slice(0, 4));
      const invoiceNumber = this.getNextInvoiceNumber(prefix, year);

      // A legacy draft may still hold this number: give it a provisional one
      this.db
        .prepare(
          `UPDATE invoices SET invoice_number = '${DRAFT_NUMBER_PREFIX}' || id
           WHERE status = 'draft' AND invoice_number = ? AND id != ?`
        )
        .run(invoiceNumber, id);

      // Totals are recomputed from the lines: the issued document is self-consistent
      const totals = computeInvoiceTotals(lines);

      const result = this.db
        .prepare(
          `UPDATE invoices
           SET invoice_number = ?,
               status = 'finalized',
               finalized_at = CURRENT_TIMESTAMP,
               subtotal_amount = ?,
               tax_amount = ?,
               total_amount = ?
           WHERE id = ? AND status = 'draft'`
        )
        .run(invoiceNumber, totals.subtotal_amount, totals.tax_amount, totals.total_amount, id);
      return result.changes > 0;
    });
    return run.immediate();
  }

  /**
   * Mark invoice as sent
   */
  markAsSent(id: number): boolean {
    const stmt = this.db.prepare(`
      UPDATE invoices
      SET status = 'sent',
          sent_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'finalized'
    `);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Mark invoice as paid
   *
   * Only an issued invoice (finalized or sent) can be paid. The remaining
   * balance is recorded as a payment (invoice_payments) dated paymentDate
   * (default: today), which is where the payment date is kept.
   */
  markAsPaid(id: number, paymentDate?: string, paymentMethod: string = 'transfer'): boolean {
    if (paymentDate && !ISO_DATE.test(paymentDate)) {
      throw new Error('La date de paiement est invalide.');
    }
    const run = this.db.transaction(() => {
      const invoice = this.findById(id);
      if (!invoice) return false;
      if (invoice.status !== 'finalized' && invoice.status !== 'sent') return false;

      const remaining = invoice.total_amount - (invoice.paid_amount || 0);
      if (remaining > 0) {
        this.db
          .prepare(
            `INSERT INTO invoice_payments (invoice_id, payment_date, amount, payment_method)
             VALUES (?, COALESCE(?, date('now', 'localtime')), ?, ?)`
          )
          .run(id, paymentDate ?? null, remaining, paymentMethod);
      }

      const result = this.db
        .prepare(
          `UPDATE invoices
           SET payment_status = 'paid',
               status = 'paid',
               paid_amount = total_amount
           WHERE id = ?`
        )
        .run(id);
      return result.changes > 0;
    });
    return run();
  }

  /**
   * Payments recorded for an invoice (most recent first)
   */
  findPayments(invoiceId: number): InvoicePayment[] {
    const stmt = this.db.prepare(
      'SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY payment_date DESC, id DESC'
    );
    return stmt.all(invoiceId) as InvoicePayment[];
  }

  /**
   * Update paid amount
   */
  updatePaidAmount(id: number, amount: number): boolean {
    const invoice = this.findById(id);
    if (!invoice) return false;

    const newPaidAmount = (invoice.paid_amount || 0) + amount;
    let paymentStatus: string;

    if (newPaidAmount >= invoice.total_amount) {
      paymentStatus = 'paid';
    } else if (newPaidAmount > 0) {
      paymentStatus = 'partial';
    } else {
      paymentStatus = 'unpaid';
    }

    const stmt = this.db.prepare(`
      UPDATE invoices
      SET paid_amount = ?,
          payment_status = ?
      WHERE id = ?
    `);
    const result = stmt.run(newPaidAmount, paymentStatus, id);
    return result.changes > 0;
  }

  /**
   * Get overdue invoices
   */
  findOverdue(): Invoice[] {
    const stmt = this.db.prepare(`
      SELECT * FROM invoices
      WHERE due_date < date('now')
        AND payment_status != 'paid'
        AND status NOT IN ('draft', 'cancelled')
      ORDER BY due_date
    `);
    return stmt.all() as Invoice[];
  }

  /**
   * Get invoices by status
   */
  findByStatus(status: string): Invoice[] {
    const stmt = this.db.prepare(
      'SELECT * FROM invoices WHERE status = ? ORDER BY invoice_date DESC'
    );
    return stmt.all(status) as Invoice[];
  }

  /**
   * Get recent invoices
   */
  findRecent(limit: number = 10): Invoice[] {
    const stmt = this.db.prepare(`
      SELECT * FROM invoices
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(limit) as Invoice[];
  }

  /**
   * Calculate total revenue for period
   */
  getTotalRevenue(fromDate?: string, toDate?: string): number {
    let sql = `
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM invoices
      WHERE status IN ('sent', 'paid')
    `;
    const params: string[] = [];

    if (fromDate) {
      sql += ' AND invoice_date >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      sql += ' AND invoice_date <= ?';
      params.push(toDate);
    }

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as { total: number };
    return result.total;
  }

  /**
   * Get next invoice number: <prefix>-<year>-<sequence>
   *
   * The sequence is max + 1 over the invoices already ISSUED for that
   * prefix/year (drafts hold provisional numbers and are ignored). The
   * comparison is numeric, so the sequence keeps working past 999.
   * The number only becomes definitive when finalize() assigns it.
   */
  getNextInvoiceNumber(prefix: string = 'INV', year: number = new Date().getFullYear()): string {
    const head = `${prefix}-${year}-`;
    const row = this.db
      .prepare(
        `SELECT MAX(CAST(substr(invoice_number, ?) AS INTEGER)) AS last_seq
         FROM invoices
         WHERE status != 'draft'
           AND substr(invoice_number, 1, ?) = ?
           AND substr(invoice_number, ?) != ''
           AND substr(invoice_number, ?) NOT GLOB '*[^0-9]*'`
      )
      .get(head.length + 1, head.length, head, head.length + 1, head.length + 1) as {
      last_seq: number | null;
    };

    const nextSeq = (row.last_seq || 0) + 1;
    return `${head}${nextSeq.toString().padStart(3, '0')}`;
  }

  // ========================================================================
  // DASHBOARD METRICS
  // ========================================================================

  /**
   * Count sent invoices
   */
  countSent(): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM invoices
      WHERE status = 'sent'
    `);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * Count signed invoices
   */
  countSigned(): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM invoices
      WHERE is_signed = 1
    `);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * Get financial metrics for dashboard
   * Returns amount awaiting payment based on payment terms
   */
  getFinancialMetrics(paymentTermsDays: number = 30): {
    amount_awaiting_payment: number;
    awaiting_count: number;
    overdue_amount: number;
    overdue_count: number;
    payment_terms_days: number;
  } {
    // Calculate awaiting payment (sent but not paid, not yet overdue)
    const awaitingStmt = this.db.prepare(`
      SELECT
        COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) as amount,
        COUNT(*) as count
      FROM invoices
      WHERE status = 'sent'
        AND payment_status != 'paid'
        AND date(invoice_date, '+' || COALESCE(payment_terms_days, ?) || ' days') >= date('now')
    `);
    const awaitingResult = awaitingStmt.get(paymentTermsDays) as {
      amount: number;
      count: number;
    };

    // Calculate overdue (past payment terms date)
    const overdueStmt = this.db.prepare(`
      SELECT
        COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) as amount,
        COUNT(*) as count
      FROM invoices
      WHERE status = 'sent'
        AND payment_status != 'paid'
        AND date(invoice_date, '+' || COALESCE(payment_terms_days, ?) || ' days') < date('now')
    `);
    const overdueResult = overdueStmt.get(paymentTermsDays) as {
      amount: number;
      count: number;
    };

    return {
      amount_awaiting_payment: awaitingResult.amount,
      awaiting_count: awaitingResult.count,
      overdue_amount: overdueResult.amount,
      overdue_count: overdueResult.count,
      payment_terms_days: paymentTermsDays,
    };
  }
}
