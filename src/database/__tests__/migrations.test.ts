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
    expect(versions).toEqual(expect.arrayContaining(['1.0.0', '002']));
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

    expect(runMigrations(db)).toEqual(['002']);
    expect(columnsOf(db, 'invoices')).toEqual(
      expect.arrayContaining(['is_signed', 'payment_terms_days'])
    );
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
