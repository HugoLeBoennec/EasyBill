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
  NewRecord,
  UpdateRecord,
} from '../types';

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

    const result = stmt.run(quote);
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
      if (filter.limit) {
        sql += ' LIMIT ?';
        params.push(filter.limit);
      }
      if (filter.offset) {
        sql += ' OFFSET ?';
        params.push(filter.offset);
      }
    }

    sql += ' ORDER BY quote_date DESC, created_at DESC';

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
        sql += ' AND (quote_number LIKE ? OR notes LIKE ?)';
        const searchTerm = `%${filter.search}%`;
        params.push(searchTerm, searchTerm);
      }
    }

    sql += ' ORDER BY quote_date DESC, created_at DESC';

    if (filter?.limit) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
    }
    if (filter?.offset) {
      sql += ' OFFSET ?';
      params.push(filter.offset);
    }

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as QuoteComplete[];
  }

  /**
   * Update quote
   */
  update(id: number, updates: UpdateRecord<Quote>): boolean {
    const fields = Object.keys(updates)
      .map((key) => `${key} = @${key}`)
      .join(', ');

    if (!fields) return false;

    const stmt = this.db.prepare(`UPDATE quotes SET ${fields} WHERE id = @id`);
    const result = stmt.run({ ...updates, id });
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

    const stmt = this.db.prepare(`
      SELECT quote_number
      FROM quotes
      WHERE quote_number LIKE ?
      ORDER BY quote_number DESC
      LIMIT 1
    `);

    const result = stmt.get(pattern) as { quote_number: string } | undefined;

    if (!result) {
      return `${prefix}-${year}-001`;
    }

    const lastNumber = parseInt(result.quote_number.split('-').pop() || '0', 10);
    const nextNumber = lastNumber + 1;

    return `${prefix}-${year}-${nextNumber.toString().padStart(3, '0')}`;
  }

  /**
   * Get recent quotes
   */
  getRecent(limit: number = 10): Quote[] {
    const stmt = this.db.prepare(`
      SELECT * FROM quotes
      ORDER BY created_at DESC
      LIMIT ?
    `);

    return stmt.all(limit) as Quote[];
  }

  /**
   * Count quotes
   */
  count(filter?: QuoteFilter): number {
    let sql = 'SELECT COUNT(*) as count FROM quotes WHERE 1=1';
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

    const result = stmt.run(line);
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
    const fields = Object.keys(updates)
      .map((key) => `${key} = @${key}`)
      .join(', ');

    if (!fields) return false;

    const stmt = this.db.prepare(
      `UPDATE quote_lines SET ${fields} WHERE id = @id`
    );
    const result = stmt.run({ ...updates, id });
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
}
