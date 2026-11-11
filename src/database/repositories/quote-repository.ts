/**
 * Quote Repository
 *
 * Data access layer for quotes and quote lines
 */

import type Database from 'better-sqlite3';
import type {
  Quote,
  QuoteLine,
  QuoteComplete,
  QuoteFilter,
  QuoteInput,
  QuoteLineInput,
  QuoteStatus,
  QuoteWithLines,
  QuoteConversionResult,
  NewRecord,
  UpdateRecord,
} from '../types';

/** Columns of `quotes` that may be changed through update() */
const QUOTE_UPDATABLE_COLUMNS = [
  'quote_number',
  'quote_date',
  'valid_until',
  'subtotal_amount',
  'tax_amount',
  'total_amount',
  'currency',
  'customer_id',
  'status',
  'converted_to_invoice_id',
  'converted_at',
  'notes',
  'customer_reference',
  'sent_at',
  'accepted_at',
] as const;

/** Columns of `quote_lines` that may be changed through updateLine() */
const QUOTE_LINE_UPDATABLE_COLUMNS = [
  'line_number',
  'item_name',
  'item_description',
  'item_code',
  'quantity',
  'unit_code',
  'unit_price',
  'line_amount',
  'discount_amount',
  'line_total',
  'vat_category',
  'vat_rate',
  'vat_amount',
] as const;

const QUOTE_STATUSES: QuoteStatus[] = [
  'draft',
  'sent',
  'accepted',
  'rejected',
  'expired',
  'converted',
];

/** Local date as YYYY-MM-DD (toISOString() would shift to UTC) */
function localDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Build a "col = @col" SET clause restricted to known columns.
 * Keys come from the renderer, so they must never be interpolated unchecked.
 */
function buildSetClause(
  updates: Record<string, unknown>,
  allowed: readonly string[]
): { clause: string; params: Record<string, unknown> } {
  const params: Record<string, unknown> = {};
  const parts: string[] = [];

  for (const key of Object.keys(updates)) {
    if (!allowed.includes(key)) {
      throw new Error(`Unknown or read-only column: ${key}`);
    }
    parts.push(`${key} = @${key}`);
    params[key] = updates[key] === undefined ? null : updates[key];
  }

  return { clause: parts.join(', '), params };
}

/** Compute the stored amounts (in cents) of a line from user input */
function computeLine(line: QuoteLineInput) {
  const quantity = Number(line.quantity);
  const unitPrice = Math.round(Number(line.unit_price));
  const vatRate = Number(line.vat_rate);
  const discount = Math.round(Number(line.discount_amount ?? 0));

  if (!line.item_name || !line.item_name.trim()) {
    throw new Error('Chaque ligne doit avoir une désignation');
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('La quantité doit être supérieure à 0');
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new Error('Le prix unitaire doit être positif');
  }
  if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
    throw new Error('Le taux de TVA est invalide');
  }

  const lineAmount = Math.round(quantity * unitPrice);
  const lineTotal = lineAmount - discount;
  if (lineTotal < 0) {
    throw new Error('La remise ne peut pas dépasser le montant de la ligne');
  }

  return {
    item_name: line.item_name.trim(),
    item_description: line.item_description?.trim() || null,
    item_code: line.item_code || null,
    quantity,
    unit_code: line.unit_code || 'C62',
    unit_price: unitPrice,
    line_amount: lineAmount,
    discount_amount: discount,
    line_total: lineTotal,
    vat_category: line.vat_category || (vatRate === 0 ? 'Z' : 'S'),
    vat_rate: vatRate,
    vat_amount: Math.round((lineTotal * vatRate) / 100),
  };
}

export class QuoteRepository {
  constructor(private db: Database.Database) {}

  // ========================================================================
  // QUOTE CRUD OPERATIONS
  // ========================================================================

  /**
   * Create a new quote
   */
  create(quote: NewRecord<Quote>): number {
    const stmt = this.db.prepare(`
      INSERT INTO quotes (
        quote_number, quote_date, valid_until,
        subtotal_amount, tax_amount, total_amount, currency,
        customer_id, status, notes, customer_reference
      ) VALUES (
        @quote_number, @quote_date, @valid_until,
        @subtotal_amount, @tax_amount, @total_amount, @currency,
        @customer_id, @status, @notes, @customer_reference
      )
    `);

    // better-sqlite3 throws on missing named parameters: default the optional ones
    const result = stmt.run({
      ...quote,
      valid_until: quote.valid_until ?? null,
      currency: quote.currency || 'EUR',
      customer_id: quote.customer_id ?? null,
      status: quote.status || 'draft',
      notes: quote.notes ?? null,
      customer_reference: quote.customer_reference ?? null,
    });
    return result.lastInsertRowid as number;
  }

  /**
   * Find quote by ID
   */
  findById(id: number): Quote | undefined {
    const stmt = this.db.prepare('SELECT * FROM quotes WHERE id = ?');
    return stmt.get(id) as Quote | undefined;
  }

  /**
   * Find quote by quote number
   */
  findByNumber(quoteNumber: string): Quote | undefined {
    const stmt = this.db.prepare(
      'SELECT * FROM quotes WHERE quote_number = ?'
    );
    return stmt.get(quoteNumber) as Quote | undefined;
  }

  /**
   * Find all quotes with optional filtering
   */
  findAll(filter?: QuoteFilter): Quote[] {
    let sql = 'SELECT * FROM quotes WHERE 1=1';
    const params: any[] = [];

    if (filter) {
      if (filter.status) {
        sql += ' AND status = ?';
        params.push(filter.status);
      }
      if (filter.customer_id) {
        sql += ' AND customer_id = ?';
        params.push(filter.customer_id);
      }
      if (filter.from_date) {
        sql += ' AND quote_date >= ?';
        params.push(filter.from_date);
      }
      if (filter.to_date) {
        sql += ' AND quote_date <= ?';
        params.push(filter.to_date);
      }
      if (filter.search) {
        sql += ' AND (quote_number LIKE ? OR notes LIKE ?)';
        const searchTerm = `%${filter.search}%`;
        params.push(searchTerm, searchTerm);
      }
    }

    sql += ' ORDER BY quote_date DESC, id DESC';

    // LIMIT/OFFSET must come after ORDER BY (OFFSET is only valid with LIMIT)
    if (filter?.limit) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
      if (filter.offset) {
        sql += ' OFFSET ?';
        params.push(filter.offset);
      }
    }

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as Quote[];
  }

  /**
   * Get complete quote with customer information
   */
  getComplete(id: number): QuoteComplete | undefined {
    const stmt = this.db.prepare('SELECT * FROM v_quotes_complete WHERE id = ?');
    return stmt.get(id) as QuoteComplete | undefined;
  }

  /**
   * Get all complete quotes
   */
  getAllComplete(filter?: QuoteFilter): QuoteComplete[] {
    let sql = 'SELECT * FROM v_quotes_complete WHERE 1=1';
    const params: any[] = [];

    if (filter) {
      if (filter.status) {
        sql += ' AND status = ?';
        params.push(filter.status);
      }
      if (filter.customer_id) {
        sql += ' AND customer_id = ?';
        params.push(filter.customer_id);
      }
      if (filter.from_date) {
        sql += ' AND quote_date >= ?';
        params.push(filter.from_date);
      }
      if (filter.to_date) {
        sql += ' AND quote_date <= ?';
        params.push(filter.to_date);
      }
      if (filter.search) {
        sql +=
          ' AND (quote_number LIKE ? OR notes LIKE ? OR customer_name LIKE ?)';
        const searchTerm = `%${filter.search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }
    }

    sql += ' ORDER BY quote_date DESC, id DESC';

    if (filter?.limit) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
      if (filter.offset) {
        sql += ' OFFSET ?';
        params.push(filter.offset);
      }
    }

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as QuoteComplete[];
  }

  /**
   * Update quote
   */
  update(id: number, updates: UpdateRecord<Quote>): boolean {
    const { clause, params } = buildSetClause(
      updates as Record<string, unknown>,
      QUOTE_UPDATABLE_COLUMNS
    );

    if (!clause) return false;

    const stmt = this.db.prepare(`UPDATE quotes SET ${clause} WHERE id = @id`);
    const result = stmt.run({ ...params, id });
    return result.changes > 0;
  }

  /**
   * Delete quote
   */
  delete(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM quotes WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Get next quote number
   */
  getNextNumber(prefix: string = 'QT'): string {
    const year = new Date().getFullYear();
    const pattern = `${prefix}-${year}-%`;

    // Take the numeric maximum: a text sort would put "999" after "1000"
    const stmt = this.db.prepare(`
      SELECT quote_number
      FROM quotes
      WHERE quote_number LIKE ?
    `);

    const rows = stmt.all(pattern) as { quote_number: string }[];
    const lastNumber = rows.reduce((max, row) => {
      const match = row.quote_number.match(/-(\d+)$/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0);
    const nextNumber = lastNumber + 1;

    return `${prefix}-${year}-${nextNumber.toString().padStart(3, '0')}`;
  }

  /**
   * Get recent quotes
   */
  getRecent(limit: number = 10): Quote[] {
    const stmt = this.db.prepare(`
      SELECT * FROM quotes
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `);

    return stmt.all(limit) as Quote[];
  }

  /**
   * Count quotes
   */
  count(filter?: QuoteFilter): number {
    let sql = 'SELECT COUNT(*) as count FROM v_quotes_complete WHERE 1=1';
    const params: any[] = [];

    if (filter) {
      if (filter.status) {
        sql += ' AND status = ?';
        params.push(filter.status);
      }
      if (filter.customer_id) {
        sql += ' AND customer_id = ?';
        params.push(filter.customer_id);
      }
      if (filter.from_date) {
        sql += ' AND quote_date >= ?';
        params.push(filter.from_date);
      }
      if (filter.to_date) {
        sql += ' AND quote_date <= ?';
        params.push(filter.to_date);
      }
      // Same search criteria as getAllComplete so the count matches the list
      if (filter.search) {
        sql +=
          ' AND (quote_number LIKE ? OR notes LIKE ? OR customer_name LIKE ?)';
        const searchTerm = `%${filter.search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }
    }

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }

  // ========================================================================
  // QUOTE LINE OPERATIONS
  // ========================================================================

  /**
   * Create quote line
   */
  createLine(line: NewRecord<QuoteLine>): number {
    const stmt = this.db.prepare(`
      INSERT INTO quote_lines (
        quote_id, line_number, item_name, item_description, item_code,
        quantity, unit_code, unit_price, line_amount,
        discount_amount, line_total, vat_category, vat_rate, vat_amount
      ) VALUES (
        @quote_id, @line_number, @item_name, @item_description, @item_code,
        @quantity, @unit_code, @unit_price, @line_amount,
        @discount_amount, @line_total, @vat_category, @vat_rate, @vat_amount
      )
    `);

    const result = stmt.run({
      ...line,
      item_description: line.item_description ?? null,
      item_code: line.item_code ?? null,
      unit_code: line.unit_code || 'C62',
      discount_amount: line.discount_amount ?? 0,
      vat_category: line.vat_category || 'S',
    });
    return result.lastInsertRowid as number;
  }

  /**
   * Get quote lines
   */
  getLines(quoteId: number): QuoteLine[] {
    const stmt = this.db.prepare(`
      SELECT * FROM quote_lines
      WHERE quote_id = ?
      ORDER BY line_number
    `);

    return stmt.all(quoteId) as QuoteLine[];
  }

  /**
   * Update quote line
   */
  updateLine(id: number, updates: UpdateRecord<QuoteLine>): boolean {
    const { clause, params } = buildSetClause(
      updates as Record<string, unknown>,
      QUOTE_LINE_UPDATABLE_COLUMNS
    );

    if (!clause) return false;

    const stmt = this.db.prepare(
      `UPDATE quote_lines SET ${clause} WHERE id = @id`
    );
    const result = stmt.run({ ...params, id });
    return result.changes > 0;
  }

  /**
   * Delete quote line
   */
  deleteLine(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM quote_lines WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Delete all lines for a quote
   */
  deleteAllLines(quoteId: number): boolean {
    const stmt = this.db.prepare('DELETE FROM quote_lines WHERE quote_id = ?');
    const result = stmt.run(quoteId);
    return result.changes > 0;
  }

  // ========================================================================
  // QUOTE + LINES (TRANSACTIONAL)
  // ========================================================================

  /**
   * Get a quote (with customer info) and its lines
   */
  getWithLines(id: number): QuoteWithLines | undefined {
    const quote = this.getComplete(id);
    if (!quote) return undefined;
    return { quote, lines: this.getLines(id) };
  }

  /**
   * Create a quote and its lines atomically.
   * Amounts and totals are computed here from the lines.
   */
  createWithLines(input: QuoteInput, lines: QuoteLineInput[]): number {
    this.validateInput(input, lines);

    return this.db.transaction(() => {
      const computed = lines.map(computeLine);
      const totals = this.sumTotals(computed);

      const quoteId = this.create({
        quote_number: input.quote_number || this.getNextNumber(),
        quote_date: input.quote_date,
        valid_until: input.valid_until || undefined,
        ...totals,
        currency: input.currency || 'EUR',
        customer_id: input.customer_id,
        status: 'draft',
        notes: input.notes?.trim() || undefined,
        customer_reference: input.customer_reference?.trim() || undefined,
      });

      computed.forEach((line, index) => {
        this.insertComputedLine(quoteId, index + 1, line);
      });

      return quoteId;
    })();
  }

  /**
   * Update a quote and replace its lines atomically.
   * A quote already converted to an invoice can no longer be modified.
   */
  updateWithLines(
    id: number,
    input: QuoteInput,
    lines: QuoteLineInput[]
  ): boolean {
    this.validateInput(input, lines);

    return this.db.transaction(() => {
      const existing = this.findById(id);
      if (!existing) {
        throw new Error('Devis introuvable');
      }
      if (existing.status === 'converted') {
        throw new Error(
          'Ce devis a été converti en facture et ne peut plus être modifié'
        );
      }

      const computed = lines.map(computeLine);
      const totals = this.sumTotals(computed);

      this.update(id, {
        quote_date: input.quote_date,
        valid_until: input.valid_until || undefined,
        ...totals,
        customer_id: input.customer_id,
        notes: input.notes?.trim() || undefined,
        customer_reference: input.customer_reference?.trim() || undefined,
      });

      this.deleteAllLines(id);
      computed.forEach((line, index) => {
        this.insertComputedLine(id, index + 1, line);
      });

      return true;
    })();
  }

  /**
   * Change the status of a quote, maintaining sent_at / accepted_at.
   * 'converted' can only be reached through convertToInvoice().
   */
  setStatus(id: number, status: QuoteStatus): boolean {
    if (!QUOTE_STATUSES.includes(status)) {
      throw new Error(`Statut de devis invalide : ${status}`);
    }
    if (status === 'converted') {
      throw new Error(
        'Utilisez la conversion en facture pour passer un devis à « converti »'
      );
    }

    return this.db.transaction(() => {
      const existing = this.findById(id);
      if (!existing) {
        throw new Error('Devis introuvable');
      }
      if (existing.status === 'converted') {
        throw new Error(
          'Ce devis a été converti en facture : son statut ne peut plus changer'
        );
      }

      const now = new Date().toISOString();
      const updates: UpdateRecord<Quote> = { status };
      if (status === 'sent' && !existing.sent_at) updates.sent_at = now;
      if (status === 'accepted') updates.accepted_at = now;
      if (status === 'draft') {
        updates.sent_at = undefined;
        updates.accepted_at = undefined;
      }

      return this.update(id, updates);
    })();
  }

  /**
   * Convert a quote into a draft invoice (header + lines) in one transaction
   * and mark the quote as converted, linked to the new invoice.
   */
  convertToInvoice(
    id: number,
    options: { seller_id?: number; payment_terms_days?: number } = {}
  ): QuoteConversionResult {
    return this.db.transaction(() => {
      const quote = this.findById(id);
      if (!quote) {
        throw new Error('Devis introuvable');
      }
      if (quote.status === 'converted' || quote.converted_to_invoice_id) {
        throw new Error('Ce devis a déjà été converti en facture');
      }
      if (quote.status === 'rejected') {
        throw new Error('Un devis refusé ne peut pas être converti en facture');
      }
      if (!quote.customer_id) {
        throw new Error('Le devis doit avoir un client pour être converti');
      }

      const lines = this.getLines(id);
      if (lines.length === 0) {
        throw new Error('Le devis ne contient aucune ligne');
      }

      const paymentTerms = options.payment_terms_days ?? 30;
      const today = new Date();
      const due = new Date(today);
      due.setDate(due.getDate() + paymentTerms);

      const invoiceNumber = this.getNextInvoiceNumber();
      const notes = [`Selon devis ${quote.quote_number}`, quote.notes]
        .filter(Boolean)
        .join('\n');

      const invoiceResult = this.db
        .prepare(
          `
        INSERT INTO invoices (
          invoice_number, invoice_date, due_date, invoice_type,
          subtotal_amount, tax_amount, total_amount, paid_amount, currency,
          seller_id, buyer_id, status, payment_status, payment_terms_days,
          notes, buyer_reference
        ) VALUES (
          @invoice_number, @invoice_date, @due_date, 'invoice',
          @subtotal_amount, @tax_amount, @total_amount, 0, @currency,
          @seller_id, @buyer_id, 'draft', 'unpaid', @payment_terms_days,
          @notes, @buyer_reference
        )
      `
        )
        .run({
          invoice_number: invoiceNumber,
          invoice_date: localDate(today),
          due_date: localDate(due),
          subtotal_amount: quote.subtotal_amount,
          tax_amount: quote.tax_amount,
          total_amount: quote.total_amount,
          currency: quote.currency,
          seller_id: options.seller_id ?? 1,
          buyer_id: quote.customer_id,
          payment_terms_days: paymentTerms,
          notes,
          buyer_reference: quote.customer_reference ?? null,
        });
      const invoiceId = invoiceResult.lastInsertRowid as number;

      const insertLine = this.db.prepare(`
        INSERT INTO invoice_lines (
          invoice_id, line_number, item_name, item_description, item_code,
          quantity, unit_code, unit_price, line_amount,
          discount_amount, line_total, vat_category, vat_rate, vat_amount
        ) VALUES (
          @invoice_id, @line_number, @item_name, @item_description, @item_code,
          @quantity, @unit_code, @unit_price, @line_amount,
          @discount_amount, @line_total, @vat_category, @vat_rate, @vat_amount
        )
      `);
      for (const line of lines) {
        insertLine.run({
          invoice_id: invoiceId,
          line_number: line.line_number,
          item_name: line.item_name,
          item_description: line.item_description ?? null,
          item_code: line.item_code ?? null,
          quantity: line.quantity,
          unit_code: line.unit_code,
          unit_price: line.unit_price,
          line_amount: line.line_amount,
          discount_amount: line.discount_amount ?? 0,
          line_total: line.line_total,
          vat_category: line.vat_category,
          vat_rate: line.vat_rate,
          vat_amount: line.vat_amount,
        });
      }

      const now = new Date().toISOString();
      this.update(id, {
        status: 'converted',
        converted_to_invoice_id: invoiceId,
        converted_at: now,
        accepted_at: quote.accepted_at || now,
      });

      return { invoice_id: invoiceId, invoice_number: invoiceNumber };
    })();
  }

  // ========================================================================
  // INTERNAL HELPERS
  // ========================================================================

  private validateInput(input: QuoteInput, lines: QuoteLineInput[]): void {
    if (!input.customer_id) {
      throw new Error('Veuillez sélectionner un client');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.quote_date || '')) {
      throw new Error("La date d'émission est invalide");
    }
    if (input.valid_until) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.valid_until)) {
        throw new Error('La date de validité est invalide');
      }
      if (input.valid_until < input.quote_date) {
        throw new Error(
          "La date de validité doit être postérieure à la date d'émission"
        );
      }
    }
    if (!lines || lines.length === 0) {
      throw new Error('Le devis doit contenir au moins une ligne');
    }
  }

  private sumTotals(lines: ReturnType<typeof computeLine>[]) {
    const subtotal = lines.reduce((sum, l) => sum + l.line_total, 0);
    const tax = lines.reduce((sum, l) => sum + l.vat_amount, 0);
    return {
      subtotal_amount: subtotal,
      tax_amount: tax,
      total_amount: subtotal + tax,
    };
  }

  private insertComputedLine(
    quoteId: number,
    lineNumber: number,
    line: ReturnType<typeof computeLine>
  ): number {
    return this.createLine({
      quote_id: quoteId,
      line_number: lineNumber,
      ...line,
      item_description: line.item_description ?? undefined,
      item_code: line.item_code ?? undefined,
    });
  }

  /**
   * Next invoice number, same INV-YYYY-NNN scheme as InvoiceRepository
   */
  private getNextInvoiceNumber(prefix: string = 'INV'): string {
    const year = new Date().getFullYear();
    const rows = this.db
      .prepare('SELECT invoice_number FROM invoices WHERE invoice_number LIKE ?')
      .all(`${prefix}-${year}-%`) as { invoice_number: string }[];

    const last = rows.reduce((max, row) => {
      const match = row.invoice_number.match(/-(\d+)$/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0);

    return `${prefix}-${year}-${(last + 1).toString().padStart(3, '0')}`;
  }
}
