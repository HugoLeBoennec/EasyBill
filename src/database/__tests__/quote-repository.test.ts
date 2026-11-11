import type Database from 'better-sqlite3';
import { createTestDb, insertCustomer, isoDate } from './test-db';
import { QuoteRepository } from '../repositories/quote-repository';
import { InvoiceRepository } from '../repositories/invoice-repository';
import type { QuoteInput, QuoteLineInput, QuoteStatus } from '../types';

const YEAR = new Date().getFullYear();

describe('QuoteRepository', () => {
  let db: Database.Database;
  let repo: QuoteRepository;
  let customerId: number;

  const input = (overrides: Partial<QuoteInput> = {}): QuoteInput => ({
    quote_date: '2026-03-01',
    valid_until: '2026-03-31',
    customer_id: customerId,
    ...overrides,
  });
  const lines = (): QuoteLineInput[] => [
    { item_name: 'Audit', quantity: 2, unit_price: 50000, vat_rate: 20 },
    { item_name: 'Formation', quantity: 1, unit_price: 20000, vat_rate: 10 },
  ];
  /** 1 200,00 HT, 220,00 TVA, 1 420,00 TTC */
  const createQuote = (overrides: Partial<QuoteInput> = {}) =>
    repo.createWithLines(input(overrides), lines());

  beforeEach(() => {
    db = createTestDb();
    repo = new QuoteRepository(db);
    customerId = insertCustomer(db, 'Client SARL');
  });

  afterEach(() => {
    db.close();
  });

  describe('createWithLines', () => {
    it('creates a numbered draft with computed line amounts and totals', () => {
      const id = createQuote({ notes: '  Valable 30 jours ' });

      expect(repo.findById(id)).toMatchObject({
        quote_number: `QT-${YEAR}-001`,
        status: 'draft',
        currency: 'EUR',
        customer_id: customerId,
        subtotal_amount: 120000,
        tax_amount: 22000,
        total_amount: 142000,
        notes: 'Valable 30 jours',
      });
      expect(
        repo.getLines(id).map((l) => [l.line_number, l.item_name, l.line_amount, l.line_total, l.vat_amount])
      ).toEqual([
        [1, 'Audit', 100000, 100000, 20000],
        [2, 'Formation', 20000, 20000, 2000],
      ]);
    });

    it('numbers quotes sequentially and accepts an explicit number', () => {
      createQuote();
      const second = createQuote();
      const custom = createQuote({ quote_number: 'DEVIS-42' });

      expect(repo.findById(second)?.quote_number).toBe(`QT-${YEAR}-002`);
      expect(repo.findByNumber('DEVIS-42')?.id).toBe(custom);
      expect(repo.getNextNumber()).toBe(`QT-${YEAR}-003`);
      expect(repo.getNextNumber('DV')).toBe(`DV-${YEAR}-001`);
    });

    it('rejects a duplicate quote number', () => {
      createQuote({ quote_number: 'DEVIS-42' });
      expect(() => createQuote({ quote_number: 'DEVIS-42' })).toThrow(/UNIQUE/i);
    });

    it('validates the header', () => {
      expect(() => repo.createWithLines(input({ customer_id: 0 }), lines())).toThrow();
      expect(() => repo.createWithLines(input({ quote_date: '01/03/2026' }), lines())).toThrow();
      expect(() => repo.createWithLines(input({ valid_until: '2026-02-01' }), lines())).toThrow();
      expect(() => repo.createWithLines(input(), [])).toThrow();
      expect(repo.count()).toBe(0);
    });

    it('validates the lines and creates nothing when one is invalid', () => {
      const bad: QuoteLineInput[][] = [
        [{ item_name: '  ', quantity: 1, unit_price: 100, vat_rate: 20 }],
        [{ item_name: 'A', quantity: 0, unit_price: 100, vat_rate: 20 }],
        [{ item_name: 'A', quantity: 1, unit_price: -1, vat_rate: 20 }],
        [{ item_name: 'A', quantity: 1, unit_price: 100, vat_rate: 120 }],
        [{ item_name: 'A', quantity: 1, unit_price: 10.5, vat_rate: 20 }],
      ];
      for (const invalid of bad) {
        expect(() => repo.createWithLines(input(), [...lines(), ...invalid])).toThrow();
      }
      expect(repo.count()).toBe(0);
    });
  });

  describe('reading', () => {
    let first: number;
    let second: number;
    let third: number;

    beforeEach(() => {
      const other = insertCustomer(db, 'Autre Client');
      first = createQuote({ quote_date: '2026-01-10', valid_until: undefined });
      second = createQuote({ quote_date: '2026-02-10', valid_until: undefined, notes: 'urgent' });
      third = createQuote({ quote_date: '2026-03-10', valid_until: undefined, customer_id: other });
      repo.setStatus(second, 'sent');
    });

    it('lists quotes, most recent first', () => {
      expect(repo.findAll().map((q) => q.id)).toEqual([third, second, first]);
      expect(repo.getRecent(2)).toHaveLength(2);
    });

    it('paginates with limit and offset', () => {
      expect(repo.findAll({ limit: 2 }).map((q) => q.id)).toEqual([third, second]);
      expect(repo.findAll({ limit: 2, offset: 2 }).map((q) => q.id)).toEqual([first]);
      expect(repo.getAllComplete({ limit: 1, offset: 1 }).map((q) => q.id)).toEqual([second]);
    });

    it('filters by status, customer, dates and text', () => {
      expect(repo.findAll({ status: 'sent' }).map((q) => q.id)).toEqual([second]);
      expect(repo.findAll({ customer_id: customerId }).map((q) => q.id)).toEqual([second, first]);
      expect(
        repo.findAll({ from_date: '2026-02-01', to_date: '2026-02-28' }).map((q) => q.id)
      ).toEqual([second]);
      expect(repo.findAll({ search: 'urgent' }).map((q) => q.id)).toEqual([second]);
      expect(repo.count({ status: 'draft' })).toBe(2);
      expect(repo.count({ customer_id: customerId })).toBe(2);
    });

    it('joins the customer in the complete view', () => {
      expect(repo.getComplete(third)?.customer_name).toBe('Autre Client');
      expect(repo.getAllComplete({ status: 'sent' })[0].customer_name).toBe('Client SARL');

      const withLines = repo.getWithLines(first);
      expect(withLines?.quote.customer_name).toBe('Client SARL');
      expect(withLines?.lines).toHaveLength(2);
      expect(repo.getWithLines(9999)).toBeUndefined();
    });
  });

  describe('updating', () => {
    it('replaces the lines and recomputes the totals', () => {
      const id = createQuote();

      expect(
        repo.updateWithLines(id, input({ quote_date: '2026-03-05', notes: undefined }), [
          { item_name: 'Forfait', quantity: 1, unit_price: 10000, vat_rate: 20 },
        ])
      ).toBe(true);

      expect(repo.findById(id)).toMatchObject({
        quote_date: '2026-03-05',
        subtotal_amount: 10000,
        tax_amount: 2000,
        total_amount: 12000,
        notes: null,
        quote_number: `QT-${YEAR}-001`,
      });
      expect(repo.getLines(id).map((l) => l.item_name)).toEqual(['Forfait']);
    });

    it('keeps the previous lines when the new ones are invalid', () => {
      const id = createQuote();

      expect(() =>
        repo.updateWithLines(id, input(), [
          { item_name: 'OK', quantity: 1, unit_price: 100, vat_rate: 20 },
          { item_name: 'KO', quantity: -1, unit_price: 100, vat_rate: 20 },
        ])
      ).toThrow();
      expect(repo.getLines(id)).toHaveLength(2);
      expect(repo.findById(id)?.total_amount).toBe(142000);
    });

    it('fails for an unknown quote', () => {
      expect(() => repo.updateWithLines(9999, input(), lines())).toThrow();
    });

    it('update() only accepts known columns', () => {
      const id = createQuote();
      const injected = { 'notes = (SELECT 1) --': 'x' } as Record<string, string>;

      expect(repo.update(id, { notes: 'Note' })).toBe(true);
      expect(repo.update(id, {})).toBe(false);
      expect(() => repo.update(id, injected)).toThrow();
      expect(repo.findById(id)?.notes).toBe('Note');
    });

    it('edits single lines', () => {
      const id = createQuote();
      const [line] = repo.getLines(id);

      expect(repo.updateLine(line.id as number, { item_name: 'Audit complet' })).toBe(true);
      expect(repo.getLines(id)[0].item_name).toBe('Audit complet');
      expect(repo.deleteLine(line.id as number)).toBe(true);
      expect(repo.deleteAllLines(id)).toBe(true);
      expect(repo.deleteAllLines(id)).toBe(false);
    });

    it('deletes a quote together with its lines', () => {
      const id = createQuote();

      expect(repo.delete(id)).toBe(true);
      expect(repo.findById(id)).toBeUndefined();
      expect(repo.getLines(id)).toEqual([]);
      expect(repo.delete(id)).toBe(false);
    });
  });

  describe('setStatus', () => {
    it('records when the quote was sent and accepted', () => {
      const id = createQuote();

      expect(repo.setStatus(id, 'sent')).toBe(true);
      const sentAt = repo.findById(id)?.sent_at;
      expect(sentAt).toBeTruthy();

      repo.setStatus(id, 'accepted');
      expect(repo.findById(id)).toMatchObject({ status: 'accepted', sent_at: sentAt });
      expect(repo.findById(id)?.accepted_at).toBeTruthy();

      repo.setStatus(id, 'draft');
      expect(repo.findById(id)).toMatchObject({
        status: 'draft',
        sent_at: null,
        accepted_at: null,
      });
    });

    it('refuses invalid transitions', () => {
      const id = createQuote();

      expect(() => repo.setStatus(id, 'converted')).toThrow();
      expect(() => repo.setStatus(id, 'archived' as QuoteStatus)).toThrow();
      expect(() => repo.setStatus(9999, 'sent')).toThrow();
      expect(repo.findById(id)?.status).toBe('draft');
    });
  });

  describe('convertToInvoice', () => {
    it('creates a draft invoice with the same lines and links the quote to it', () => {
      const invoices = new InvoiceRepository(db);
      const id = createQuote({ customer_reference: 'PO-77' });

      const result = repo.convertToInvoice(id, { payment_terms_days: 45 });

      const invoice = invoices.findById(result.invoice_id);
      expect(invoice).toMatchObject({
        status: 'draft',
        payment_status: 'unpaid',
        buyer_id: customerId,
        seller_id: 1,
        subtotal_amount: 120000,
        tax_amount: 22000,
        total_amount: 142000,
        invoice_date: isoDate(),
        due_date: isoDate(45),
        payment_terms_days: 45,
        buyer_reference: 'PO-77',
      });
      expect(invoice?.notes).toContain(`QT-${YEAR}-001`);
      expect(
        invoices.findLinesByInvoiceId(result.invoice_id).map((l) => [l.item_name, l.line_total, l.vat_amount])
      ).toEqual([
        ['Audit', 100000, 20000],
        ['Formation', 20000, 2000],
      ]);

      const quote = repo.findById(id);
      expect(quote).toMatchObject({
        status: 'converted',
        converted_to_invoice_id: result.invoice_id,
      });
      expect(quote?.converted_at).toBeTruthy();
    });

    it('produces an invoice that can then be issued', () => {
      const invoices = new InvoiceRepository(db);
      const { invoice_id } = repo.convertToInvoice(createQuote());

      expect(invoices.finalize(invoice_id)).toBe(true);
      expect(invoices.findById(invoice_id)).toMatchObject({
        status: 'finalized',
        invoice_number: `INV-${YEAR}-001`,
        total_amount: 142000,
      });
    });

    it('converts a quote only once and locks it afterwards', () => {
      const id = createQuote();
      repo.convertToInvoice(id);

      expect(() => repo.convertToInvoice(id)).toThrow();
      expect(() => repo.updateWithLines(id, input(), lines())).toThrow();
      expect(() => repo.setStatus(id, 'draft')).toThrow();
      expect(new InvoiceRepository(db).count()).toBe(1);
    });

    it('refuses rejected, empty or unknown quotes', () => {
      const rejected = createQuote();
      repo.setStatus(rejected, 'rejected');
      const empty = createQuote();
      repo.deleteAllLines(empty);

      expect(() => repo.convertToInvoice(rejected)).toThrow();
      expect(() => repo.convertToInvoice(empty)).toThrow();
      expect(() => repo.convertToInvoice(9999)).toThrow();
      expect(new InvoiceRepository(db).count()).toBe(0);
    });

    it('releases the quote when the draft invoice is deleted', () => {
      const id = createQuote();
      const { invoice_id } = repo.convertToInvoice(id);

      expect(new InvoiceRepository(db).delete(invoice_id)).toBe(true);
      expect(repo.findById(id)).toMatchObject({
        status: 'accepted',
        converted_to_invoice_id: null,
        converted_at: null,
      });
      expect(() => repo.convertToInvoice(id)).not.toThrow();
    });
  });
});
