import type Database from 'better-sqlite3';
import { createTestDb, insertCustomer, insertInvoice, isoDate } from './test-db';
import {
  InvoiceRepository,
  computeInvoiceTotals,
  computeLineAmounts,
  eurosToCents,
  isDraftNumber,
  roundHalfUp,
} from '../repositories/invoice-repository';

const YEAR = new Date().getFullYear();

describe('invoice amount helpers', () => {
  it('rounds half away from zero, ignoring floating point noise', () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(-2.5)).toBe(-3);
    expect(roundHalfUp(2.675 * 100)).toBe(268); // 267.49999999999994
    expect(roundHalfUp(Number.NaN)).toBe(0);
  });

  it('converts euros to cents', () => {
    expect(eurosToCents(19.99)).toBe(1999);
    expect(eurosToCents(1.005)).toBe(101);
    expect(eurosToCents(0)).toBe(0);
  });

  it('computes the amounts of a line', () => {
    expect(computeLineAmounts(3, 1000, 20)).toEqual({
      line_amount: 3000,
      line_total: 3000,
      vat_amount: 600,
    });
    expect(computeLineAmounts(1.5, 999, 5.5, 100)).toEqual({
      line_amount: 1499, // 1498.5 rounded up
      line_total: 1399,
      vat_amount: 77, // 76.945
    });
  });

  it('computes VAT per rate on the summed base, not per line', () => {
    // 3 lines of 0.33 EUR at 20%: per line VAT would be 3 x 7 = 21 cents,
    // on the summed base it is round(99 x 20%) = 20 cents
    const totals = computeInvoiceTotals([
      { line_total: 33, vat_rate: 20 },
      { line_total: 33, vat_rate: 20 },
      { line_total: 33, vat_rate: 20 },
      { line_total: 1000, vat_rate: 5.5 },
    ]);

    expect(totals.subtotal_amount).toBe(1099);
    expect(totals.tax_amount).toBe(20 + 55);
    expect(totals.total_amount).toBe(1099 + 75);
    expect(totals.vat_breakdown).toEqual([
      { vat_category: 'S', vat_rate: 20, taxable_amount: 99, tax_amount: 20 },
      { vat_category: 'S', vat_rate: 5.5, taxable_amount: 1000, tax_amount: 55 },
    ]);
  });

  it('recognises provisional draft numbers', () => {
    expect(isDraftNumber('BROUILLON-12')).toBe(true);
    expect(isDraftNumber(undefined)).toBe(true);
    expect(isDraftNumber('INV-2026-001')).toBe(false);
  });
});

describe('InvoiceRepository', () => {
  let db: Database.Database;
  let repo: InvoiceRepository;
  let buyerId: number;

  const header = (overrides: Record<string, unknown> = {}) => ({
    invoice_date: isoDate(),
    buyer_id: buyerId,
    ...overrides,
  });
  const lines = () => [
    { item_name: 'Développement', quantity: 3, unit_price: 10000, vat_rate: 20 },
    { item_name: 'Livre', quantity: 1, unit_price: 999, vat_rate: 5.5 },
  ];

  /** Draft with two lines: 309.99 HT, 60.55 TVA, 370.54 TTC */
  const createDraft = (overrides: Record<string, unknown> = {}) =>
    repo.saveDraft(null, header(overrides), lines());

  beforeEach(() => {
    db = createTestDb();
    repo = new InvoiceRepository(db);
    buyerId = insertCustomer(db, 'Client SARL');
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('creates a draft with only the required fields', () => {
      const id = repo.create({
        invoice_number: 'IGNORED',
        invoice_date: '2026-01-15',
        invoice_type: 'invoice',
        subtotal_amount: 10000,
        tax_amount: 2000,
        total_amount: 12000,
        currency: 'EUR',
        status: 'draft',
      });

      expect(repo.findById(id)).toMatchObject({
        id,
        status: 'draft',
        payment_status: 'unpaid',
        paid_amount: 0,
        total_amount: 12000,
        due_date: null,
        payment_terms_days: 30,
      });
    });

    it('gives drafts a provisional number that is not part of the legal sequence', () => {
      const id = repo.create({
        invoice_number: `INV-${YEAR}-001`,
        invoice_date: isoDate(),
        invoice_type: 'invoice',
        subtotal_amount: 0,
        tax_amount: 0,
        total_amount: 0,
        currency: 'EUR',
        status: 'draft',
      });

      expect(repo.findById(id)?.invoice_number).toBe(`BROUILLON-${id}`);
      expect(repo.getNextInvoiceNumber()).toBe(`INV-${YEAR}-001`);
    });

    it('writes an audit log entry', () => {
      const id = createDraft();
      const entry = db
        .prepare(
          "SELECT * FROM audit_log WHERE entity_type = 'invoice' AND entity_id = ? AND action = 'create'"
        )
        .get(id);
      expect(entry).toBeDefined();
    });
  });

  describe('saveDraft', () => {
    it('creates the invoice and its lines with computed amounts', () => {
      const id = createDraft({ notes: '  Merci  ', payment_terms_days: 45 });

      expect(repo.findById(id)).toMatchObject({
        status: 'draft',
        buyer_id: buyerId,
        seller_id: 1, // defaults to the company party
        subtotal_amount: 30999,
        tax_amount: 6055,
        total_amount: 37054,
        notes: 'Merci',
        payment_terms_days: 45,
      });

      const saved = repo.findLinesByInvoiceId(id);
      expect(saved.map((l) => [l.line_number, l.item_name, l.line_total, l.vat_amount])).toEqual([
        [1, 'Développement', 30000, 6000],
        [2, 'Livre', 999, 55],
      ]);
    });

    it('updates a draft: keeps, inserts and removes lines', () => {
      const id = createDraft();
      const [first] = repo.findLinesByInvoiceId(id);

      repo.saveDraft(id, header(), [
        { item_name: 'Nouveau', quantity: 1, unit_price: 500, vat_rate: 20 },
        { id: first.id, item_name: 'Développement', quantity: 2, unit_price: 10000, vat_rate: 20 },
      ]);

      const saved = repo.findLinesByInvoiceId(id);
      expect(saved.map((l) => [l.line_number, l.item_name, l.line_total])).toEqual([
        [1, 'Nouveau', 500],
        [2, 'Développement', 20000],
      ]);
      expect(saved[1].id).toBe(first.id);
      expect(repo.findById(id)).toMatchObject({
        subtotal_amount: 20500,
        tax_amount: 4100,
        total_amount: 24600,
      });
    });

    it('validates the header and the lines', () => {
      expect(() => repo.saveDraft(null, header({ invoice_date: '15/01/2026' }), lines())).toThrow();
      expect(() => repo.saveDraft(null, header({ buyer_id: 0 }), lines())).toThrow();
      expect(() => repo.saveDraft(null, header({ buyer_id: 9999 }), lines())).toThrow();
      expect(() =>
        repo.saveDraft(null, header({ due_date: isoDate(-1) }), lines())
      ).toThrow();
      expect(() =>
        repo.saveDraft(null, header(), [{ item_name: ' ', quantity: 1, unit_price: 100, vat_rate: 20 }])
      ).toThrow();
      expect(() =>
        repo.saveDraft(null, header(), [{ item_name: 'A', quantity: 0, unit_price: 100, vat_rate: 20 }])
      ).toThrow();
      expect(repo.count()).toBe(0);
    });

    it('leaves the draft untouched when an update fails (transaction)', () => {
      const id = createDraft();

      expect(() =>
        repo.saveDraft(id, header(), [
          { item_name: 'OK', quantity: 1, unit_price: 100, vat_rate: 20 },
          { item_name: 'KO', quantity: -1, unit_price: 100, vat_rate: 20 },
        ])
      ).toThrow();

      expect(repo.findLinesByInvoiceId(id)).toHaveLength(2);
      expect(repo.findById(id)?.total_amount).toBe(37054);
    });
  });

  describe('finalize and numbering', () => {
    it('assigns consecutive numbers at finalization only', () => {
      const first = createDraft();
      const abandoned = createDraft();
      const second = createDraft();

      expect(repo.finalize(first)).toBe(true);
      expect(repo.delete(abandoned)).toBe(true);
      expect(repo.finalize(second)).toBe(true);

      expect(repo.findById(first)).toMatchObject({
        invoice_number: `INV-${YEAR}-001`,
        status: 'finalized',
      });
      expect(repo.findById(first)?.finalized_at).toBeTruthy();
      expect(repo.findById(second)?.invoice_number).toBe(`INV-${YEAR}-002`);
      expect(repo.findByNumber(`INV-${YEAR}-002`)?.id).toBe(second);
    });

    it('returns false for an unknown or already issued invoice', () => {
      const id = createDraft();
      repo.finalize(id);

      expect(repo.finalize(id)).toBe(false);
      expect(repo.finalize(9999)).toBe(false);
      expect(repo.findById(id)?.invoice_number).toBe(`INV-${YEAR}-001`);
    });

    it('refuses to issue an invoice without lines', () => {
      const id = repo.saveDraft(null, header(), []);
      expect(() => repo.finalize(id)).toThrow();
      expect(repo.findById(id)?.status).toBe('draft');
    });

    it('refuses an invoice dated before the last issued one', () => {
      repo.finalize(createDraft());
      const backdated = createDraft({ invoice_date: isoDate(-10) });

      expect(() => repo.finalize(backdated)).toThrow(/chronologique/);
      expect(repo.findById(backdated)?.status).toBe('draft');
    });

    it('keeps counting numerically past 999', () => {
      insertInvoice(db, { invoice_number: `INV-${YEAR}-999`, status: 'sent' });
      insertInvoice(db, { invoice_number: `INV-${YEAR}-1000`, status: 'sent' });

      expect(repo.getNextInvoiceNumber()).toBe(`INV-${YEAR}-1001`);
    });

    it('numbers each prefix and year independently', () => {
      insertInvoice(db, { invoice_number: `INV-${YEAR}-007`, status: 'sent' });
      insertInvoice(db, { invoice_number: `INV-${YEAR - 1}-042`, status: 'sent' });

      expect(repo.getNextInvoiceNumber()).toBe(`INV-${YEAR}-008`);
      expect(repo.getNextInvoiceNumber('INV', YEAR - 1)).toBe(`INV-${YEAR - 1}-043`);
      expect(repo.getNextInvoiceNumber('AV')).toBe(`AV-${YEAR}-001`);
    });
  });

  describe('issued invoices are immutable', () => {
    let id: number;

    beforeEach(() => {
      id = createDraft();
      repo.finalize(id);
    });

    it('refuses to change legal content', () => {
      expect(() => repo.update(id, { total_amount: 1 })).toThrow();
      expect(() => repo.update(id, { notes: 'changed' })).toThrow();
      expect(() => repo.update(id, { status: 'draft' })).toThrow();
      expect(() => repo.saveDraft(id, header(), lines())).toThrow();
      expect(repo.findById(id)?.total_amount).toBe(37054);
    });

    it('refuses to delete it or to touch its lines', () => {
      const [line] = repo.findLinesByInvoiceId(id);

      expect(() => repo.delete(id)).toThrow();
      expect(() => repo.deleteLine(line.id as number)).toThrow();
      expect(() => repo.deleteAllLines(id)).toThrow();
      expect(() => repo.updateLine(line.id as number, { quantity: 99 })).toThrow();
      expect(() =>
        repo.createLine({
          invoice_id: id,
          line_number: 3,
          item_name: 'Extra',
          quantity: 1,
          unit_code: 'C62',
          unit_price: 100,
          line_amount: 100,
          line_total: 100,
          vat_category: 'S',
          vat_rate: 20,
          vat_amount: 20,
        })
      ).toThrow();
      expect(repo.findLinesByInvoiceId(id)).toHaveLength(2);
    });
  });

  describe('drafts', () => {
    it('can be updated, but not numbered or issued through update()', () => {
      const id = createDraft();

      expect(repo.update(id, { notes: 'Note', buyer_reference: 'REF-1' })).toBe(true);
      expect(repo.findById(id)).toMatchObject({ notes: 'Note', buyer_reference: 'REF-1' });

      expect(() => repo.update(id, { invoice_number: 'INV-1' })).toThrow();
      expect(() => repo.update(id, { status: 'sent' })).toThrow();
      expect(repo.update(id, {})).toBe(false);
      expect(repo.update(9999, { notes: 'x' })).toBe(false);
    });

    it('ignores unknown columns instead of interpolating them into SQL', () => {
      const id = createDraft();
      const injected = { 'notes = (SELECT 1) --': 'x' } as Record<string, string>;
      expect(repo.update(id, injected)).toBe(false);
    });

    it('are deleted together with their lines', () => {
      const id = createDraft();

      expect(repo.delete(id)).toBe(true);
      expect(repo.findById(id)).toBeUndefined();
      expect(repo.findLinesByInvoiceId(id)).toEqual([]);
      expect(repo.delete(id)).toBe(false);
    });

    it('have editable lines', () => {
      const id = createDraft();
      const [line] = repo.findLinesByInvoiceId(id);

      expect(repo.updateLine(line.id as number, { item_name: 'Conseil' })).toBe(true);
      expect(repo.findLineById(line.id as number)?.item_name).toBe('Conseil');
      expect(repo.deleteLine(line.id as number)).toBe(true);
      expect(repo.deleteLine(line.id as number)).toBe(false);
      expect(repo.deleteAllLines(id)).toBe(1);
    });
  });

  describe('sending and payment', () => {
    it('follows draft -> finalized -> sent -> paid', () => {
      const id = createDraft();

      expect(repo.markAsSent(id)).toBe(false); // still a draft
      expect(repo.markAsPaid(id)).toBe(false);

      repo.finalize(id);
      expect(repo.markAsSent(id)).toBe(true);
      expect(repo.findById(id)).toMatchObject({ status: 'sent' });
      expect(repo.findById(id)?.sent_at).toBeTruthy();
      expect(repo.countSent()).toBe(1);

      expect(repo.markAsPaid(id, '2026-03-01', 'card')).toBe(true);
      expect(repo.findById(id)).toMatchObject({
        status: 'paid',
        payment_status: 'paid',
        paid_amount: 37054,
      });
      expect(repo.findPayments(id)).toMatchObject([
        { amount: 37054, payment_date: '2026-03-01', payment_method: 'card' },
      ]);
      expect(repo.findCompleteById(id)?.balance_due).toBe(0);

      expect(repo.markAsPaid(id)).toBe(false); // already paid
      expect(repo.findPayments(id)).toHaveLength(1);
    });

    it('rejects an invalid payment date', () => {
      const id = createDraft();
      repo.finalize(id);
      expect(() => repo.markAsPaid(id, '01/03/2026')).toThrow();
    });

    it('tracks partial payments', () => {
      const id = insertInvoice(db, {
        invoice_number: `INV-${YEAR}-001`,
        status: 'sent',
        total_amount: 12000,
      });

      expect(repo.updatePaidAmount(id, 5000)).toBe(true);
      expect(repo.findById(id)).toMatchObject({ paid_amount: 5000, payment_status: 'partial' });

      repo.updatePaidAmount(id, 7000);
      expect(repo.findById(id)).toMatchObject({ paid_amount: 12000, payment_status: 'paid' });
      expect(repo.updatePaidAmount(9999, 1)).toBe(false);
    });
  });

  describe('queries', () => {
    let draftId: number;
    let sentId: number;
    let paidId: number;
    let otherBuyer: number;

    beforeEach(() => {
      otherBuyer = insertCustomer(db, 'Autre Client');
      draftId = insertInvoice(db, {
        invoice_number: 'BROUILLON-1',
        invoice_date: '2026-03-10',
        buyer_id: buyerId,
      });
      sentId = insertInvoice(db, {
        invoice_number: 'INV-2026-001',
        invoice_date: '2026-01-10',
        status: 'sent',
        total_amount: 12000,
        buyer_id: buyerId,
      });
      paidId = insertInvoice(db, {
        invoice_number: 'INV-2026-002',
        invoice_date: '2026-02-10',
        status: 'paid',
        payment_status: 'paid',
        total_amount: 6000,
        paid_amount: 6000,
        buyer_id: otherBuyer,
      });
    });

    it('lists invoices, most recent first', () => {
      expect(repo.findAll().map((i) => i.id)).toEqual([draftId, paidId, sentId]);
    });

    it('filters by status, buyer, dates and text', () => {
      expect(repo.findAll({ status: 'sent' }).map((i) => i.id)).toEqual([sentId]);
      expect(repo.findAll({ payment_status: 'paid' }).map((i) => i.id)).toEqual([paidId]);
      expect(repo.findAll({ buyer_id: otherBuyer }).map((i) => i.id)).toEqual([paidId]);
      expect(
        repo.findAll({ from_date: '2026-02-01', to_date: '2026-02-28' }).map((i) => i.id)
      ).toEqual([paidId]);
      expect(repo.findAll({ search: '2026-001' }).map((i) => i.id)).toEqual([sentId]);
      expect(repo.findByStatus('draft').map((i) => i.id)).toEqual([draftId]);
    });

    it('paginates', () => {
      expect(repo.findAll({ limit: 1 }).map((i) => i.id)).toEqual([draftId]);
      expect(repo.findAll({ limit: 1, offset: 1 }).map((i) => i.id)).toEqual([paidId]);
      expect(repo.findRecent(2)).toHaveLength(2);
    });

    it('counts', () => {
      expect(repo.count()).toBe(3);
      expect(repo.count({ status: 'draft' })).toBe(1);
      expect(repo.count({ payment_status: 'unpaid' })).toBe(2);
    });

    it('joins party names in the complete view', () => {
      expect(repo.findCompleteById(sentId)).toMatchObject({
        invoice_number: 'INV-2026-001',
        buyer_name: 'Client SARL',
        seller_name: 'Your Company Name',
        balance_due: 12000,
      });
      expect(repo.findCompleteById(9999)).toBeUndefined();
    });

    it('sums revenue of issued invoices only (drafts excluded)', () => {
      expect(repo.getTotalRevenue()).toBe(18000);
      expect(repo.getTotalRevenue('2026-02-01')).toBe(6000);
      expect(repo.getTotalRevenue('2026-01-01', '2026-01-31')).toBe(12000);
      expect(repo.getTotalRevenue('2030-01-01')).toBe(0);
    });
  });

  describe('overdue and dashboard metrics', () => {
    it('lists unpaid issued invoices past their due date', () => {
      const late = insertInvoice(db, {
        invoice_number: 'INV-A',
        status: 'sent',
        due_date: isoDate(-5),
      });
      insertInvoice(db, { invoice_number: 'INV-B', status: 'sent', due_date: isoDate(5) });
      insertInvoice(db, {
        invoice_number: 'INV-C',
        status: 'paid',
        payment_status: 'paid',
        due_date: isoDate(-5),
      });
      insertInvoice(db, { invoice_number: 'BROUILLON-9', due_date: isoDate(-5) });

      expect(repo.findOverdue().map((i) => i.id)).toEqual([late]);
    });

    it('splits outstanding amounts between awaiting and overdue', () => {
      insertInvoice(db, {
        invoice_number: 'INV-A',
        status: 'sent',
        invoice_date: isoDate(-10),
        total_amount: 10000,
        paid_amount: 2500,
        payment_status: 'partial',
      });
      insertInvoice(db, {
        invoice_number: 'INV-B',
        status: 'sent',
        invoice_date: isoDate(-60),
        total_amount: 5000,
      });
      // Own payment terms override the default
      insertInvoice(db, {
        invoice_number: 'INV-C',
        status: 'sent',
        invoice_date: isoDate(-60),
        total_amount: 700,
        payment_terms_days: 90,
      });
      insertInvoice(db, {
        invoice_number: 'INV-D',
        status: 'paid',
        payment_status: 'paid',
        invoice_date: isoDate(-60),
      });

      expect(repo.getFinancialMetrics(30)).toMatchObject({
        amount_awaiting_payment: 7500 + 700,
        awaiting_count: 2,
        overdue_amount: 5000,
        overdue_count: 1,
        payment_terms_days: 30,
      });
    });

    it('counts signed invoices', () => {
      const id = insertInvoice(db, { invoice_number: 'INV-A', status: 'sent' });
      expect(repo.countSigned()).toBe(0);
      repo.update(id, { is_signed: 1, signed_by: 'Hugo' });
      expect(repo.countSigned()).toBe(1);
    });
  });
});
