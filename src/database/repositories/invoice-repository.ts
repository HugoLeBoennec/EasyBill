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
  NewRecord,
  UpdateRecord,
} from '../types';

export class InvoiceRepository {
  constructor(private db: Database.Database) {}

  // ========================================================================
  // INVOICE CRUD OPERATIONS
  // ========================================================================

  /**
   * Create a new invoice
   */
  create(invoice: NewRecord<Invoice>): number {
    const stmt = this.db.prepare(`
      INSERT INTO invoices (
        invoice_number, invoice_date, due_date, invoice_type,
        subtotal_amount, tax_amount, total_amount, paid_amount, currency,
        seller_id, buyer_id, status, payment_status,
        notes, buyer_reference, purchase_order_ref
      ) VALUES (
        @invoice_number, @invoice_date, @due_date, @invoice_type,
        @subtotal_amount, @tax_amount, @total_amount, @paid_amount, @currency,
        @seller_id, @buyer_id, @status, @payment_status,
        @notes, @buyer_reference, @purchase_order_ref
      )
    `);

    const result = stmt.run(invoice);
    return result.lastInsertRowid as number;
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
    const fields = Object.keys(updates);
    if (fields.length === 0) return false;

    const setClause = fields.map((field) => `${field} = @${field}`).join(', ');
    const sql = `UPDATE invoices SET ${setClause} WHERE id = @id`;

    const stmt = this.db.prepare(sql);
    const result = stmt.run({ ...updates, id });

    return result.changes > 0;
  }

  /**
   * Delete invoice
   */
  delete(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM invoices WHERE id = ?');
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

    const result = stmt.run(line);
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
    const fields = Object.keys(updates);
    if (fields.length === 0) return false;

    const setClause = fields.map((field) => `${field} = @${field}`).join(', ');
    const sql = `UPDATE invoice_lines SET ${setClause} WHERE id = @id`;

    const stmt = this.db.prepare(sql);
    const result = stmt.run({ ...updates, id });

    return result.changes > 0;
  }

  /**
   * Delete invoice line
   */
  deleteLine(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM invoice_lines WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Delete all lines for an invoice
   */
  deleteAllLines(invoiceId: number): number {
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
   * Finalize invoice (change status from draft to finalized)
   */
  finalize(id: number): boolean {
    const stmt = this.db.prepare(`
      UPDATE invoices
      SET status = 'finalized',
          finalized_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'draft'
    `);
    const result = stmt.run(id);
    return result.changes > 0;
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
   */
  markAsPaid(id: number): boolean {
    const stmt = this.db.prepare(`
      UPDATE invoices
      SET payment_status = 'paid',
          status = 'paid'
      WHERE id = ?
    `);
    const result = stmt.run(id);
    return result.changes > 0;
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
   * Get next invoice number
   */
  getNextInvoiceNumber(prefix: string = 'INV'): string {
    const year = new Date().getFullYear();
    const stmt = this.db.prepare(`
      SELECT invoice_number FROM invoices
      WHERE invoice_number LIKE ?
      ORDER BY invoice_number DESC
      LIMIT 1
    `);

    const lastInvoice = stmt.get(`${prefix}-${year}-%`) as
      | { invoice_number: string }
      | undefined;

    if (!lastInvoice) {
      return `${prefix}-${year}-001`;
    }

    // Extract number and increment
    const match = lastInvoice.invoice_number.match(/-(\d+)$/);
    if (match) {
      const nextNum = parseInt(match[1], 10) + 1;
      return `${prefix}-${year}-${nextNum.toString().padStart(3, '0')}`;
    }

    return `${prefix}-${year}-001`;
  }
}
