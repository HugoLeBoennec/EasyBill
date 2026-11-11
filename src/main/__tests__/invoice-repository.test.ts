import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, insertCustomer, insertInvoice } from '../../database/__tests__/test-db';
import {
  InvoiceRepository,
  computeInvoiceTotals,
} from '../../database/repositories/invoice-repository';
import type {
  InvoiceDraftInput,
  InvoiceDraftLineInput,
} from '../../database/repositories/invoice-repository';

let db: Database.Database;
let repo: InvoiceRepository;
let customerId: number;

const header = (overrides: Partial<InvoiceDraftInput> = {}): InvoiceDraftInput => ({
  invoice_date: '2026-03-10',
  due_date: '2026-04-09',
  buyer_id: customerId,
  payment_terms_days: 30,
  notes: 'Note',
  ...overrides,
});

const lines = (): InvoiceDraftLineInput[] => [
  { item_name: 'Conseil', quantity: 2, unit_price: 45000, vat_rate: 20 },
  { item_name: 'Livre', quantity: 3, unit_price: 1999, vat_rate: 5.5 },
];

const issuedNumbers = (): string[] =>
  (
    db
      .prepare("SELECT invoice_number FROM invoices WHERE status != 'draft' ORDER BY id")
      .all() as { invoice_number: string }[]
  ).map((row) => row.invoice_number);

beforeEach(() => {
  db = createTestDb();
  repo = new InvoiceRepository(db);
  customerId = insertCustomer(db);
});

describe('saveDraft', () => {
  it('creates a draft with a provisional number and computed amounts', () => {
    const id = repo.saveDraft(null, header(), lines());
    const invoice = repo.findById(id)!;

    expect(invoice.status).toBe('draft');
    expect(invoice.invoice_number).toBe(`BROUILLON-${id}`);
    expect(invoice.seller_id).toBe(1); // company party
    expect(invoice.buyer_id).toBe(customerId);
    expect(invoice.payment_terms_days).toBe(30);
    expect(invoice.subtotal_amount).toBe(95997);
    expect(invoice.tax_amount).toBe(18330);
    expect(invoice.total_amount).toBe(114327);

    const saved = repo.findLinesByInvoiceId(id);
    expect(saved.map((l) => [l.line_number, l.item_name, l.line_total, l.vat_amount])).toEqual([
      [1, 'Conseil', 90000, 18000],
      [2, 'Livre', 5997, 330],
    ]);
    // Header totals always equal the totals derived from the stored lines
    const totals = computeInvoiceTotals(saved);
    expect(totals.total_amount).toBe(invoice.total_amount);
  });

  it('updates, adds and deletes lines when a draft is edited', () => {
    const id = repo.saveDraft(null, header(), [
      { item_name: 'A', quantity: 1, unit_price: 1000, vat_rate: 20 },
      { item_name: 'B', quantity: 1, unit_price: 2000, vat_rate: 20 },
      { item_name: 'C', quantity: 1, unit_price: 3000, vat_rate: 20 },
    ]);
    const [a, b, c] = repo.findLinesByInvoiceId(id);

    // delete A, move C first (modified), keep B, add D
    repo.saveDraft(id, header({ notes: '', invoice_date: '2026-03-12', due_date: null }), [
      { id: c.id, item_name: 'C2', quantity: 2, unit_price: 3000, vat_rate: 10 },
      { id: b.id, item_name: 'B', quantity: 1, unit_price: 2000, vat_rate: 20 },
      { item_name: 'D', quantity: 1, unit_price: 500, vat_rate: 0 },
    ]);

    const saved = repo.findLinesByInvoiceId(id);
    expect(saved.map((l) => [l.line_number, l.item_name, l.line_total])).toEqual([
      [1, 'C2', 6000],
      [2, 'B', 2000],
      [3, 'D', 500],
    ]);
    expect(saved[0].id).toBe(c.id); // updated in place
    expect(saved[1].id).toBe(b.id);
    expect(saved.some((l) => l.id === a.id)).toBe(false); // deleted
    expect(saved[2].vat_category).toBe('E');

    const invoice = repo.findById(id)!;
    expect(invoice.invoice_date).toBe('2026-03-12');
    expect(invoice.due_date).toBeNull();
    expect(invoice.notes).toBeNull();
    expect(invoice.subtotal_amount).toBe(8500);
    expect(invoice.tax_amount).toBe(600 + 400);
    expect(invoice.total_amount).toBe(9500);
  });

  it('ignores line ids that belong to another invoice', () => {
    const other = repo.saveDraft(null, header(), lines());
    const foreign = repo.findLinesByInvoiceId(other)[0];
    const id = repo.saveDraft(null, header(), [
      { id: foreign.id, item_name: 'X', quantity: 1, unit_price: 100, vat_rate: 20 },
    ]);
    expect(repo.findLinesByInvoiceId(id).map((l) => l.item_name)).toEqual(['X']);
    expect(repo.findLinesByInvoiceId(other)).toHaveLength(2);
    expect(repo.findLinesByInvoiceId(other)[0].item_name).toBe('Conseil');
  });

  it('rejects invalid data with French messages and saves nothing', () => {
    expect(() => repo.saveDraft(null, header({ buyer_id: 0 }), lines())).toThrow(
      /sélectionner un client/
    );
    expect(() => repo.saveDraft(null, header({ invoice_date: '' }), lines())).toThrow(
      /date de facture/
    );
    expect(() =>
      repo.saveDraft(null, header(), [{ item_name: ' ', quantity: 1, unit_price: 1, vat_rate: 20 }])
    ).toThrow(/Ligne 1 : la désignation/);
    expect(() =>
      repo.saveDraft(null, header(), [{ item_name: 'A', quantity: 0, unit_price: 1, vat_rate: 20 }])
    ).toThrow(/quantité/);
    expect(repo.count()).toBe(0);
  });

  it('refuses to modify an issued invoice', () => {
    const id = repo.saveDraft(null, header(), lines());
    expect(repo.finalize(id)).toBe(true);
    expect(() => repo.saveDraft(id, header(), lines())).toThrow(/ne peut plus être modifiée/);
  });
});

describe('numbering', () => {
  it('assigns the number at finalization: continuous even when drafts are deleted', () => {
    const first = repo.saveDraft(null, header(), lines());
    const deleted = repo.saveDraft(null, header(), lines());
    const second = repo.saveDraft(null, header(), lines());
    const third = repo.saveDraft(null, header(), lines());

    expect(repo.delete(deleted)).toBe(true);
    // finalized in a different order than created
    expect(repo.finalize(second)).toBe(true);
    expect(repo.finalize(first)).toBe(true);
    expect(repo.finalize(third)).toBe(true);

    expect(issuedNumbers().sort()).toEqual(['INV-2026-001', 'INV-2026-002', 'INV-2026-003']);
    expect(repo.findById(second)!.invoice_number).toBe('INV-2026-001');
    expect(repo.findById(first)!.invoice_number).toBe('INV-2026-002');
    expect(repo.findById(first)!.finalized_at).toBeTruthy();
    expect(repo.getNextInvoiceNumber('INV', 2026)).toBe('INV-2026-004');
  });

  it('does not finalize twice', () => {
    const id = repo.saveDraft(null, header(), lines());
    expect(repo.finalize(id)).toBe(true);
    expect(repo.finalize(id)).toBe(false);
    expect(repo.finalize(9999)).toBe(false);
    expect(issuedNumbers()).toEqual(['INV-2026-001']);
  });

  it('compares sequence numbers numerically (past 999)', () => {
    insertInvoice(db, { invoice_number: 'INV-2026-999', invoice_date: '2026-01-01', status: 'sent' });
    insertInvoice(db, { invoice_number: 'INV-2026-1000', invoice_date: '2026-01-02', status: 'sent' });
    expect(repo.getNextInvoiceNumber('INV', 2026)).toBe('INV-2026-1001');

    const id = repo.saveDraft(null, header(), lines());
    repo.finalize(id);
    expect(repo.findById(id)!.invoice_number).toBe('INV-2026-1001');
  });

  it('uses one sequence per year, based on the invoice date', () => {
    insertInvoice(db, { invoice_number: 'INV-2025-041', invoice_date: '2025-12-30', status: 'paid' });
    const id = repo.saveDraft(null, header({ invoice_date: '2026-01-05', due_date: null }), lines());
    repo.finalize(id);
    expect(repo.findById(id)!.invoice_number).toBe('INV-2026-001');
    expect(repo.getNextInvoiceNumber('INV', 2025)).toBe('INV-2025-042');
  });

  it('keeps the sequence chronological', () => {
    const march = repo.saveDraft(null, header({ invoice_date: '2026-03-20', due_date: null }), lines());
    const earlier = repo.saveDraft(null, header({ invoice_date: '2026-03-05', due_date: null }), lines());
    repo.finalize(march);

    expect(() => repo.finalize(earlier)).toThrow(/antérieure à celle de la dernière facture émise \(20\/03\/2026\)/);
    expect(repo.findById(earlier)!.status).toBe('draft');

    // same day as the last issued invoice is fine
    repo.saveDraft(earlier, header({ invoice_date: '2026-03-20', due_date: null }), lines());
    expect(repo.finalize(earlier)).toBe(true);
    expect(repo.findById(earlier)!.invoice_number).toBe('INV-2026-002');
  });

  it('ignores numbers held by drafts and frees them when needed', () => {
    // legacy draft (or draft created outside the repository) holding a real-looking number
    const legacy = insertInvoice(db, { invoice_number: 'INV-2026-001', invoice_date: '2026-03-01' });
    const id = repo.saveDraft(null, header(), lines());

    expect(repo.getNextInvoiceNumber('INV', 2026)).toBe('INV-2026-001');
    expect(repo.finalize(id)).toBe(true);
    expect(repo.findById(id)!.invoice_number).toBe('INV-2026-001');
    expect(repo.findById(legacy)!.invoice_number).toBe(`BROUILLON-${legacy}`);
  });

  it('refuses to finalize a draft without lines or customer', () => {
    const empty = repo.saveDraft(null, header(), []);
    expect(() => repo.finalize(empty)).toThrow(/sans ligne/);
    const noBuyer = insertInvoice(db, { invoice_number: 'X', invoice_date: '2026-03-01' });
    expect(() => repo.finalize(noBuyer)).toThrow(/client/);
    expect(issuedNumbers()).toEqual([]);
  });

  it('never gives a draft a number of the sequence through create()', () => {
    const id = repo.create({
      invoice_number: 'INV-2026-050',
      invoice_date: '2026-03-01',
      invoice_type: 'invoice',
      subtotal_amount: 0,
      tax_amount: 0,
      total_amount: 0,
      currency: 'EUR',
      status: 'draft',
    });
    expect(repo.findById(id)!.invoice_number).toBe(`BROUILLON-${id}`);
  });
});

describe('issued invoices are immutable', () => {
  let id: number;

  beforeEach(() => {
    id = repo.saveDraft(null, header(), lines());
    repo.finalize(id);
  });

  it('cannot be deleted', () => {
    expect(() => repo.delete(id)).toThrow(/ne peut plus être modifiée ni supprimée/);
    expect(repo.findById(id)).toBeDefined();
  });

  it('cannot have their content changed', () => {
    expect(() => repo.update(id, { total_amount: 1 })).toThrow();
    expect(() => repo.update(id, { invoice_number: 'INV-2026-999' })).toThrow();
    expect(() => repo.update(id, { status: 'draft' })).toThrow();
    const line = repo.findLinesByInvoiceId(id)[0];
    expect(() => repo.updateLine(line.id!, { unit_price: 1 })).toThrow();
    expect(() => repo.deleteLine(line.id!)).toThrow();
    expect(() => repo.deleteAllLines(id)).toThrow();
    expect(() =>
      repo.createLine({ ...line, id: undefined, line_number: 9 } as never)
    ).toThrow();
    expect(repo.findLinesByInvoiceId(id)).toHaveLength(2);
    expect(repo.findById(id)!.total_amount).toBe(114327);
  });

  it('can still receive non-content updates', () => {
    expect(repo.update(id, { is_signed: 1, signed_by: 'Moi' })).toBe(true);
    expect(repo.findById(id)!.is_signed).toBe(1);
  });

  it('ignores unknown columns in updates', () => {
    const draft = repo.saveDraft(null, header(), lines());
    expect(repo.update(draft, { ['notes = 1; --' as 'notes']: 'x' })).toBe(false);
    expect(repo.update(draft, { notes: 'ok' })).toBe(true);
    expect(() => repo.update(draft, { invoice_number: 'INV-2026-777' })).toThrow(/automatiquement/);
    expect(() => repo.update(draft, { status: 'sent' })).toThrow(/finalisation/);
  });
});

describe('status workflow', () => {
  it('finalized -> sent -> paid, with the payment recorded', () => {
    const id = repo.saveDraft(null, header(), lines());
    expect(repo.markAsSent(id)).toBe(false); // still a draft
    expect(repo.markAsPaid(id)).toBe(false); // a draft cannot be paid

    repo.finalize(id);
    expect(repo.markAsSent(id)).toBe(true);
    expect(repo.findById(id)!.status).toBe('sent');
    expect(repo.findById(id)!.sent_at).toBeTruthy();

    expect(repo.markAsPaid(id, '2026-04-02')).toBe(true);
    const paid = repo.findById(id)!;
    expect(paid.status).toBe('paid');
    expect(paid.payment_status).toBe('paid');
    expect(paid.paid_amount).toBe(paid.total_amount);

    const payments = repo.findPayments(id);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ payment_date: '2026-04-02', amount: 114327 });

    expect(repo.markAsPaid(id)).toBe(false); // already paid
    expect(repo.findPayments(id)).toHaveLength(1);
  });

  it('only records the remaining balance', () => {
    const id = repo.saveDraft(null, header(), lines());
    repo.finalize(id);
    repo.updatePaidAmount(id, 14327);
    repo.markAsPaid(id);
    expect(repo.findPayments(id)[0].amount).toBe(100000);
    expect(repo.findPayments(id)[0].payment_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
