import Database from 'better-sqlite3';
import { createTestDb, runMigrations, schemaSql } from './test-db';

function columnsOf(db: Database.Database, table: string): string[] {
  return (
    db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all() as {
      name: string;
    }[]
  ).map((c) => c.name);
}

describe('database initialisation', () => {
  it('creates the base schema and applies the migrations on a fresh database', () => {
    const db = createTestDb();

    const tables = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as { name: string }[]
    ).map((t) => t.name);

    expect(tables).toEqual(
      expect.arrayContaining([
        'invoices',
        'invoice_lines',
        'invoice_payments',
        'parties',
        'quotes',
        'quote_lines',
        'einvoice_metadata',
        'einvoice_queue',
        'pa_transmission_log',
        'compliance_tracking',
        'audit_log',
        'schema_migrations',
      ])
    );

    expect(columnsOf(db, 'invoices')).toEqual(
      expect.arrayContaining([
        'signature_type',
        'is_signed',
        'signed_at',
        'payment_terms_days',
      ])
    );

    const versions = (
      db.prepare('SELECT version FROM schema_migrations').all() as {
        version: string;
      }[]
    ).map((m) => m.version);
    expect(versions).toEqual(expect.arrayContaining(['1.0.0', '002', '003']));
  });

  it('seeds a placeholder company party', () => {
    const db = createTestDb();
    const company = db
      .prepare("SELECT * FROM parties WHERE party_type = 'company'")
      .all();
    expect(company).toHaveLength(1);
  });

  it('is idempotent: re-applying schema and migrations changes nothing', () => {
    const db = createTestDb();

    expect(() => db.exec(schemaSql)).not.toThrow();
    expect(runMigrations(db)).toEqual([]);

    const { n } = db
      .prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE version = '002'")
      .get() as { n: number };
    expect(n).toBe(1);
    const { parties } = db
      .prepare('SELECT COUNT(*) AS parties FROM parties')
      .get() as { parties: number };
    expect(parties).toBe(1);
  });

  it('upgrades a database where some migration columns already exist', () => {
    const db = new Database(':memory:');
    db.exec(schemaSql);
    db.exec('ALTER TABLE invoices ADD COLUMN is_signed INTEGER DEFAULT 0');

    expect(runMigrations(db)).toEqual(expect.arrayContaining(['002', '003']));
    expect(columnsOf(db, 'invoices')).toEqual(
      expect.arrayContaining(['is_signed', 'payment_terms_days'])
    );
  });

  describe('migration 003 (seller legal mentions)', () => {
    const NEW_COLUMNS = [
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
    ];

    /** A database as left by the previous application version (schema + 002). */
    function createPre003Db(): Database.Database {
      const db = new Database(':memory:');
      db.exec(schemaSql);
      runMigrations(db, [
        { version: '002', sql: 'CREATE TABLE IF NOT EXISTS quotes (id INTEGER PRIMARY KEY)' },
      ]);
      return db;
    }

    it('adds the columns on a fresh database, with safe defaults', () => {
      const db = createTestDb();
      expect(columnsOf(db, 'parties')).toEqual(expect.arrayContaining(NEW_COLUMNS));

      const versions = (
        db.prepare('SELECT version FROM schema_migrations').all() as { version: string }[]
      ).map((m) => m.version);
      expect(versions).toContain('003');

      // The seeded placeholder company is not put under the franchise
      const company = db
        .prepare("SELECT * FROM parties WHERE party_type = 'company'")
        .get() as Record<string, unknown>;
      expect(company.vat_franchise).toBe(0);
      expect(company.recovery_fee_enabled).toBe(1);
      expect(company.share_capital).toBeNull();
      expect(company.late_penalty_text).toBeNull();
    });

    it('upgrades an existing database and keeps its data', () => {
      const db = createPre003Db();
      expect(columnsOf(db, 'parties')).not.toContain('vat_franchise');
      db.prepare(
        `UPDATE parties SET legal_name = 'Dupont Conseil', siret = '73282932000074',
           vat_number = 'FR44732829320', city = 'Paris' WHERE party_type = 'company'`
      ).run();
      db.prepare(
        "INSERT INTO parties (party_type, legal_name) VALUES ('customer', 'Client sans TVA')"
      ).run();

      expect(runMigrations(db)).toContain('003');
      expect(columnsOf(db, 'parties')).toEqual(expect.arrayContaining(NEW_COLUMNS));

      const company = db
        .prepare("SELECT * FROM parties WHERE party_type = 'company'")
        .get() as Record<string, unknown>;
      expect(company).toMatchObject({
        legal_name: 'Dupont Conseil',
        siret: '73282932000074',
        vat_number: 'FR44732829320',
        city: 'Paris',
        vat_franchise: 0, // has a VAT number: subject to VAT
        recovery_fee_enabled: 1,
      });
      const customer = db
        .prepare("SELECT * FROM parties WHERE party_type = 'customer'")
        .get() as Record<string, unknown>;
      expect(customer.vat_franchise).toBe(0);

      // Second run: nothing left to do
      expect(runMigrations(db)).toEqual([]);
    });

    it('flags a configured company without VAT number as VAT franchise', () => {
      const db = createPre003Db();
      db.prepare(
        `UPDATE parties SET legal_name = 'Jean Dupont', siret = '73282932000074'
         WHERE party_type = 'company'`
      ).run();

      runMigrations(db);

      const company = db
        .prepare("SELECT vat_franchise FROM parties WHERE party_type = 'company'")
        .get() as { vat_franchise: number };
      expect(company.vat_franchise).toBe(1);
    });

    it('completes a database where some of the columns already exist', () => {
      const db = createPre003Db();
      db.exec('ALTER TABLE parties ADD COLUMN iban TEXT');
      db.exec('ALTER TABLE parties ADD COLUMN vat_franchise INTEGER NOT NULL DEFAULT 0');

      expect(runMigrations(db)).toContain('003');
      expect(columnsOf(db, 'parties')).toEqual(expect.arrayContaining(NEW_COLUMNS));
    });
  });

  it('rolls back a failing migration entirely and does not record it', () => {
    const db = createTestDb();
    const broken = [
      {
        version: '999',
        sql: 'CREATE TABLE half_done (id INTEGER); INSERT INTO no_such_table VALUES (1);',
      },
    ];

    expect(() => runMigrations(db, broken)).toThrow();

    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE name = 'half_done'")
      .get();
    expect(table).toBeUndefined();
    const recorded = db
      .prepare("SELECT 1 FROM schema_migrations WHERE version = '999'")
      .get();
    expect(recorded).toBeUndefined();
  });

  it('enforces foreign keys (cascade from invoices to their lines)', () => {
    const db = createTestDb();
    db.exec(`
      INSERT INTO invoices (id, invoice_number, invoice_date, subtotal_amount, tax_amount, total_amount)
      VALUES (10, 'X-1', '2026-01-01', 100, 20, 120);
      INSERT INTO invoice_lines (invoice_id, line_number, item_name, quantity, unit_price, line_amount, line_total, vat_rate, vat_amount)
      VALUES (10, 1, 'Item', 1, 100, 100, 100, 20, 20);
    `);
    db.exec('DELETE FROM invoices WHERE id = 10');
    const { n } = db
      .prepare('SELECT COUNT(*) AS n FROM invoice_lines')
      .get() as { n: number };
    expect(n).toBe(0);
  });
});
