/**
 * Test helper: opens an in-memory SQLite database initialised exactly like
 * the application does (schema.sql, then the incremental migrations).
 */
import { vi } from 'vitest';
import Database from 'better-sqlite3';
import * as os from 'os';
import rawSchemaSql from '../schema.sql?raw';

// database-manager creates its singleton at import time and asks Electron for
// the userData path; there is no Electron under vitest.
vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
}));

const { runMigrations } = await import('../database-manager');

export { runMigrations };
export const schemaSql: string = rawSchemaSql;

export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(schemaSql);
  runMigrations(db);
  return db;
}

/** Local date as YYYY-MM-DD, shifted by a number of days */
export function isoDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Insert a customer directly and return its id */
export function insertCustomer(
  db: Database.Database,
  legalName = 'Client SARL'
): number {
  const result = db
    .prepare(
      "INSERT INTO parties (party_type, legal_name, country_code, active) VALUES ('customer', ?, 'FR', 1)"
    )
    .run(legalName);
  return Number(result.lastInsertRowid);
}

/**
 * Insert an invoice row directly (bypassing the repository rules) so tests
 * can set up any status / date combination.
 */
export function insertInvoice(
  db: Database.Database,
  values: {
    invoice_number: string;
    invoice_date?: string;
    due_date?: string | null;
    status?: string;
    payment_status?: string;
    total_amount?: number;
    paid_amount?: number;
    buyer_id?: number | null;
    payment_terms_days?: number | null;
  }
): number {
  const total = values.total_amount ?? 12000;
  const result = db
    .prepare(
      `INSERT INTO invoices (
         invoice_number, invoice_date, due_date, invoice_type,
         subtotal_amount, tax_amount, total_amount, paid_amount, currency,
         seller_id, buyer_id, status, payment_status, payment_terms_days
       ) VALUES (
         @invoice_number, @invoice_date, @due_date, 'invoice',
         @subtotal_amount, @tax_amount, @total_amount, @paid_amount, 'EUR',
         1, @buyer_id, @status, @payment_status, @payment_terms_days
       )`
    )
    .run({
      invoice_number: values.invoice_number,
      invoice_date: values.invoice_date ?? isoDate(),
      due_date: values.due_date ?? null,
      subtotal_amount: Math.round(total / 1.2),
      tax_amount: total - Math.round(total / 1.2),
      total_amount: total,
      paid_amount: values.paid_amount ?? 0,
      buyer_id: values.buyer_id ?? null,
      status: values.status ?? 'draft',
      payment_status: values.payment_status ?? 'unpaid',
      payment_terms_days:
        values.payment_terms_days === undefined ? 30 : values.payment_terms_days,
    });
  return Number(result.lastInsertRowid);
}
