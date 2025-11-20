/**
 * Party Repository
 *
 * Data access layer for parties (company, customers, suppliers)
 */

import type Database from 'better-sqlite3';
import type { Party, PartyFilter, NewRecord, UpdateRecord } from '../types';

export class PartyRepository {
  constructor(private db: Database.Database) {}

  /**
   * Create a new party
   */
  create(party: NewRecord<Party>): number {
    const stmt = this.db.prepare(`
      INSERT INTO parties (
        party_type, legal_name, trading_name, legal_form,
        siren, siret, vat_number,
        address_line1, address_line2, postal_code, city, state_region, country_code,
        contact_name, phone, email, website,
        electronic_address, electronic_address_scheme,
        active
      ) VALUES (
        @party_type, @legal_name, @trading_name, @legal_form,
        @siren, @siret, @vat_number,
        @address_line1, @address_line2, @postal_code, @city, @state_region, @country_code,
        @contact_name, @phone, @email, @website,
        @electronic_address, @electronic_address_scheme,
        @active
      )
    `);
    const result = stmt.run(party);
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
      'SELECT * FROM parties WHERE party_type = ? LIMIT 1',
'company'
    );
    return stmt.get() as Party | undefined;
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
    const fields = Object.keys(updates);
    if (fields.length === 0) return false;

    const setClause = fields.map((field) => `${field} = @${field}`).join(', ');
    const stmt = this.db.prepare(`UPDATE parties SET ${setClause} WHERE id = @id`);
    const result = stmt.run({ ...updates, id });
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
