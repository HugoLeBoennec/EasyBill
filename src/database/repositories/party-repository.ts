/**
 * Party Repository
 *
 * Data access layer for parties (company, customers, suppliers)
 */

import type Database from 'better-sqlite3';
import type { Party, PartyFilter, NewRecord, UpdateRecord } from '../types';
import { bindColumns, buildSetClause } from './sql-helpers';

const PARTY_COLUMNS = [
  'party_type',
  'legal_name',
  'trading_name',
  'legal_form',
  'siren',
  'siret',
  'vat_number',
  'address_line1',
  'address_line2',
  'postal_code',
  'city',
  'state_region',
  'country_code',
  'contact_name',
  'phone',
  'email',
  'website',
  'electronic_address',
  'electronic_address_scheme',
  'active',
  // Seller legal mentions, bank details and payment conditions (migration 003)
  'share_capital',
  'registration_type',
  'registration_city',
  'ape_code',
  'vat_franchise',
  'iban',
  'bic',
  'default_payment_terms_days',
  'late_penalty_text',
  'recovery_fee_enabled',
  'early_payment_discount_text',
] as const;

export class PartyRepository {
  constructor(private db: Database.Database) {}

  /**
   * Create a new party
   */
  create(party: NewRecord<Party>): number {
    const stmt = this.db.prepare(`
      INSERT INTO parties (${PARTY_COLUMNS.join(', ')})
      VALUES (${PARTY_COLUMNS.map((column) => `@${column}`).join(', ')})
    `);
    // Optional fields may be omitted: bind them as NULL / schema defaults
    const result = stmt.run(
      bindColumns(party, PARTY_COLUMNS, {
        country_code: 'FR',
        active: 1,
        vat_franchise: 0,
        recovery_fee_enabled: 1,
      })
    );
    return result.lastInsertRowid as number;
  }

  /**
   * Find party by ID
   */
  findById(id: number): Party | undefined {
    const stmt = this.db.prepare('SELECT * FROM parties WHERE id = ?');
    return stmt.get(id) as Party | undefined;
  }

  /**
   * Find party by SIRET
   */
  findBySiret(siret: string): Party | undefined {
    const stmt = this.db.prepare('SELECT * FROM parties WHERE siret = ?');
    return stmt.get(siret) as Party | undefined;
  }

  /**
   * Find all parties with filtering
   */
  findAll(filter?: PartyFilter): Party[] {
    let sql = 'SELECT * FROM parties WHERE 1=1';
    const params: any[] = [];

    if (filter) {
      if (filter.party_type) {
        sql += ' AND party_type = ?';
        params.push(filter.party_type);
      }
      if (filter.active !== undefined) {
        sql += ' AND active = ?';
        params.push(filter.active ? 1 : 0);
      }
      if (filter.search) {
        sql += ' AND (legal_name LIKE ? OR siret LIKE ? OR vat_number LIKE ?)';
        const searchTerm = `%${filter.search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }
    }

    sql += ' ORDER BY legal_name';

    if (filter?.limit) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
      if (filter.offset) {
        sql += ' OFFSET ?';
        params.push(filter.offset);
      }
    }

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as Party[];
  }

  /**
   * Find company party (should only be one)
   */
  findCompany(): Party | undefined {
    const stmt = this.db.prepare(
      'SELECT * FROM parties WHERE party_type = ? ORDER BY id LIMIT 1'
    );
    return stmt.get('company') as Party | undefined;
  }

  /**
   * Find all customers
   */
  findCustomers(activeOnly: boolean = true): Party[] {
    let sql = "SELECT * FROM parties WHERE party_type = 'customer'";
    if (activeOnly) {
      sql += ' AND active = 1';
    }
    sql += ' ORDER BY legal_name';

    const stmt = this.db.prepare(sql);
    return stmt.all() as Party[];
  }

  /**
   * Update party
   */
  update(id: number, updates: UpdateRecord<Party>): boolean {
    // Only real columns may be written (names end up in the SQL statement)
    for (const key of Object.keys(updates)) {
      if (!(PARTY_COLUMNS as readonly string[]).includes(key)) {
        throw new Error(`Unknown or read-only column: ${key}`);
      }
    }
    const { clause: setClause, params } = buildSetClause(updates);
    if (!setClause) return false;

    const stmt = this.db.prepare(`UPDATE parties SET ${setClause} WHERE id = @id`);
    const result = stmt.run({ ...params, id });
    return result.changes > 0;
  }

  /**
   * Deactivate party
   */
  deactivate(id: number): boolean {
    const stmt = this.db.prepare('UPDATE parties SET active = 0 WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Delete party
   */
  delete(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM parties WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Count parties
   */
  count(filter?: PartyFilter): number {
    let sql = 'SELECT COUNT(*) as count FROM parties WHERE 1=1';
    const params: any[] = [];

    if (filter) {
      if (filter.party_type) {
        sql += ' AND party_type = ?';
        params.push(filter.party_type);
      }
      if (filter.active !== undefined) {
        sql += ' AND active = ?';
        params.push(filter.active ? 1 : 0);
      }
    }

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }

  /**
   * Check if SIRET already exists
   */
  existsBySiret(siret: string, excludeId?: number): boolean {
    let sql = 'SELECT COUNT(*) as count FROM parties WHERE siret = ?';
    const params: any[] = [siret];

    if (excludeId) {
      sql += ' AND id != ?';
      params.push(excludeId);
    }

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as { count: number };
    return result.count > 0;
  }
}
