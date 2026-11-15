/**
 * Credit notes (avoirs) and payments: creation, limits, numbering, effect on
 * the original invoice and on the statistics.
 */
import type Database from 'better-sqlite3';
import { createTestDb, insertCustomer, isoDate } from './test-db';
import {
  InvoiceRepository,
  balanceDue,
  creditableAmount,
  overpaidAmount,
} from '../repositories/invoice-repository';
import type { InvoiceDraftLineInput } from '../repositories/invoice-repository';

let db: Database.Database;
let repo: InvoiceRepository;
let customerId: number;

const YEAR = isoDate().slice(0, 4);

// 2 x 100,00 @ 20 % + 1 x 50,00 @ 10 %  ->  HT 250,00 / TVA 45,00 / TTC 295,00
const LINES: InvoiceDraftLineInput[] = [
  { item_name: 'Conseil', quantity: 2, unit_price: 10000, vat_rate: 20 },
  { item_name: 'Livre', quantity: 1, unit_price: 5000, vat_rate: 10 },
];
const TOTAL = 29500;

/** Issue an invoice dated `offsetDays` from today and return its id. */
function issueInvoice(offsetDays = -10, lines = LINES, sent = false): number {
  const date = isoDate(offsetDays);
  const id = repo.saveDraft(
    null,
    { invoice_date: date, due_date: isoDate(offsetDays + 30), buyer_id: customerId },
    lines
  );
  expect(repo.finalize(id)).toBe(true);
  if (sent) expect(repo.markAsSent(id)).toBe(true);
  return id;
}

/** Lines of a draft credit note, as the form sends them back. */
function draftLines(creditNoteId: number): InvoiceDraftLineInput[] {
  return repo.findLinesByInvoiceId(creditNoteId).map((line) => ({
    id: line.id,
    item_name: line.item_name,
    quantity: line.quantity,
    unit_price: line.unit_price,
    vat_rate: line.vat_rate,
  }));
}

function saveCreditNote(creditNoteId: number, lines: InvoiceDraftLineInput[]): number {
  const draft = repo.findById(creditNoteId)!;
  return repo.saveDraft(
    creditNoteId,
    { invoice_date: draft.invoice_date, buyer_id: draft.buyer_id as number },
    lines
  );
}

const pay = (invoiceId: number, amount: number, extra: Record<string, unknown> = {}) =>
  repo.recordPayment(invoiceId, {
    payment_date: isoDate(),
    amount,
    payment_method: 'transfer',
    ...extra,
  });

beforeEach(() => {
  db = createTestDb();
  repo = new InvoiceRepository(db);
  customerId = insertCustomer(db);
});

describe('migration 004', () => {
  it('adds the credit note columns and the extended view', () => {
    const columns = (
      db.prepare("SELECT name FROM pragma_table_info('invoices')").all() as { name: string }[]
    ).map((c) => c.name);
    expect(columns).toEqual(expect.arrayContaining(['credited_invoice_id', 'credited_amount']));

    const versions = (
      db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as {
        version: string;
      }[]
    ).map((m) => m.version);
    expect(versions).toContain('004');
    // Applied after the earlier migrations
    expect(versions.indexOf('004')).toBeGreaterThan(versions.indexOf('002'));
  });
});

describe('credit note creation', () => {
  it('creates a linked draft copying the lines of the original, amounts positive', () => {
    const invoiceId = issueInvoice();
    const original = repo.findById(invoiceId)!;

    const creditNoteId = repo.createCreditNote(invoiceId);
    const creditNote = repo.findById(creditNoteId)!;

    expect(creditNote).toMatchObject({
      invoice_type: 'credit_note',
      status: 'draft',
      credited_invoice_id: invoiceId,
      buyer_id: customerId,
      seller_id: original.seller_id,
      invoice_date: isoDate(),
      subtotal_amount: 25000,
      tax_amount: 4500,
      total_amount: TOTAL,
      paid_amount: 0,
    });
    expect(creditNote.invoice_number).toBe(`BROUILLON-${creditNoteId}`);
    expect(creditNote.notes).toContain(original.invoice_number);
    expect(repo.findLinesByInvoiceId(creditNoteId)).toMatchObject([
      { line_number: 1, item_name: 'Conseil', quantity: 2, unit_price: 10000, line_total: 20000 },
      { line_number: 2, item_name: 'Livre', quantity: 1, unit_price: 5000, line_total: 5000 },
    ]);

    // A draft credit note has no effect on the original
    expect(repo.findById(invoiceId)).toMatchObject({ status: 'finalized', credited_amount: 0 });
    expect(repo.findCreditNotes(invoiceId).map((c) => c.id)).toEqual([creditNoteId]);
    expect(repo.findCompleteById(creditNoteId)).toMatchObject({
      credited_invoice_number: original.invoice_number,
      balance_due: 0,
    });
  });

  it('reuses the pending draft instead of creating a second one', () => {
    const invoiceId = issueInvoice();
    const first = repo.createCreditNote(invoiceId);
    expect(repo.createCreditNote(invoiceId)).toBe(first);
    expect(repo.findCreditNotes(invoiceId)).toHaveLength(1);
  });

  it('refuses to credit a draft, a credit note or an unknown invoice', () => {
    const draft = repo.saveDraft(null, { invoice_date: isoDate(), buyer_id: customerId }, LINES);
    expect(() => repo.createCreditNote(draft)).toThrow(/brouillon/i);

    const invoiceId = issueInvoice();
    const creditNoteId = repo.createCreditNote(invoiceId);
    expect(() => repo.createCreditNote(creditNoteId)).toThrow(/avoir/i);
    repo.finalize(creditNoteId);
    expect(() => repo.createCreditNote(creditNoteId)).toThrow(/avoir/i);

    expect(() => repo.createCreditNote(9999)).toThrow(/introuvable/i);
  });

  it('cannot be created or retyped through saveDraft / update', () => {
    expect(() =>
      repo.saveDraft(
        null,
        { invoice_date: isoDate(), buyer_id: customerId, invoice_type: 'credit_note' },
        LINES
      )
    ).toThrow(/avoir/i);

    const draft = repo.saveDraft(null, { invoice_date: isoDate(), buyer_id: customerId }, LINES);
    expect(() => repo.update(draft, { invoice_type: 'credit_note' })).toThrow();

    const creditNoteId = repo.createCreditNote(issueInvoice());
    expect(() => repo.update(creditNoteId, { invoice_type: 'invoice' })).toThrow();
    // The link is not writable from outside
    repo.update(creditNoteId, { credited_invoice_id: 9999, credited_amount: 5, notes: 'x' });
    expect(repo.findById(creditNoteId)).toMatchObject({ credited_amount: 0, notes: 'x' });
    expect(repo.findById(creditNoteId)?.credited_invoice_id).not.toBe(9999);
  });

  it('keeps type, link and customer when the draft is edited', () => {
    const other = insertCustomer(db, 'Autre client');
    const invoiceId = issueInvoice();
    const creditNoteId = repo.createCreditNote(invoiceId);

    repo.saveDraft(
      creditNoteId,
      { invoice_date: isoDate(), buyer_id: other, invoice_type: 'invoice', due_date: isoDate(30) },
      [{ ...draftLines(creditNoteId)[0], quantity: 1 }]
    );

    expect(repo.findById(creditNoteId)).toMatchObject({
      invoice_type: 'credit_note',
      credited_invoice_id: invoiceId,
      buyer_id: customerId,
      due_date: null,
      total_amount: 12000,
    });
    expect(repo.findLinesByInvoiceId(creditNoteId)).toHaveLength(1);
  });

  it('can be deleted while it is a draft', () => {
    const invoiceId = issueInvoice();
    const creditNoteId = repo.createCreditNote(invoiceId);
    expect(repo.delete(creditNoteId)).toBe(true);
    expect(repo.findCreditNotes(invoiceId)).toEqual([]);
    expect(repo.findById(invoiceId)).toMatchObject({ status: 'finalized', credited_amount: 0 });
  });
});

describe('credit note finalization and numbering', () => {
  it('uses its own continuous AV sequence and leaves the invoice sequence alone', () => {
    const first = issueInvoice(-10);
    const second = issueInvoice(-9);

    const cn1 = repo.createCreditNote(first);
    expect(repo.finalize(cn1)).toBe(true);
    const cn2 = repo.createCreditNote(second);
    // A deleted draft credit note does not consume a number
    repo.delete(cn2);
    const cn3 = repo.createCreditNote(second);
    expect(repo.finalize(cn3)).toBe(true);

    expect(repo.findById(cn1)).toMatchObject({
      invoice_number: `AV-${YEAR}-001`,
      status: 'finalized',
      invoice_type: 'credit_note',
    });
    expect(repo.findById(cn1)?.finalized_at).toBeTruthy();
    expect(repo.findById(cn3)?.invoice_number).toBe(`AV-${YEAR}-002`);

    // Invoices keep counting without a gap
    const third = issueInvoice(0);
    expect(repo.findById(first)?.invoice_number).toBe(`INV-${isoDate(-10).slice(0, 4)}-001`);
    expect(repo.findById(third)?.invoice_number).toMatch(/^INV-\d{4}-\d{3}$/);
    expect(repo.findById(third)?.invoice_number).not.toMatch(/^AV-/);
    expect(repo.getNextInvoiceNumber('AV', Number(YEAR))).toBe(`AV-${YEAR}-003`);
  });

  it('does not let a later credit note block an invoice dated before it', () => {
    const invoiceId = issueInvoice(-10);
    repo.finalize(repo.createCreditNote(invoiceId)); // credit note dated today
    // Invoice sequence: last issued invoice is 10 days old, so -5 is fine
    expect(() => issueInvoice(-5)).not.toThrow();
  });

  it('is immutable once issued', () => {
    const creditNoteId = repo.createCreditNote(issueInvoice());
    repo.finalize(creditNoteId);

    expect(repo.finalize(creditNoteId)).toBe(false);
    expect(() => repo.delete(creditNoteId)).toThrow();
    expect(() => saveCreditNote(creditNoteId, draftLines(creditNoteId))).toThrow();
    expect(() => repo.update(creditNoteId, { total_amount: 1 })).toThrow();
  });

  it('refuses a credit note without lines or dated before the original', () => {
    const invoiceId = issueInvoice(-3);
    const creditNoteId = repo.createCreditNote(invoiceId);

    expect(() =>
      repo.saveDraft(
        creditNoteId,
        { invoice_date: isoDate(-5), buyer_id: customerId },
        draftLines(creditNoteId)
      )
    ).toThrow(/facture d'origine/);

    db.prepare('UPDATE invoices SET invoice_date = ? WHERE id = ?').run(isoDate(-5), creditNoteId);
    expect(() => repo.finalize(creditNoteId)).toThrow(/facture d'origine/);
    db.prepare('UPDATE invoices SET invoice_date = ? WHERE id = ?').run(isoDate(), creditNoteId);

    repo.deleteAllLines(creditNoteId);
    expect(() => repo.finalize(creditNoteId)).toThrow(/sans ligne/);
    expect(repo.findById(creditNoteId)?.status).toBe('draft');
  });
});

describe('credit note limits and effect on the original', () => {
  it('full credit note cancels the original', () => {
    const invoiceId = issueInvoice(-10, LINES, true);
    const creditNoteId = repo.createCreditNote(invoiceId);
    repo.finalize(creditNoteId);

    const original = repo.findById(invoiceId)!;
    expect(original).toMatchObject({
      status: 'cancelled',
      payment_status: 'unpaid',
      credited_amount: TOTAL,
      // The issued document itself is untouched
      total_amount: TOTAL,
      invoice_number: `INV-${isoDate(-10).slice(0, 4)}-001`,
    });
    expect(balanceDue(original)).toBe(0);
    expect(creditableAmount(original)).toBe(0);
    expect(repo.findCompleteById(invoiceId)?.balance_due).toBe(0);

    expect(() => repo.createCreditNote(invoiceId)).toThrow(/intégralement créditée/);
    expect(() => pay(invoiceId, 100)).toThrow(/annulée par avoir/);
    expect(repo.markAsPaid(invoiceId)).toBe(false);
  });

  it('partial credit notes reduce the balance until nothing is left to credit', () => {
    const invoiceId = issueInvoice(-10, LINES, true);

    // 1st credit note: 1 x Conseil = 120,00 TTC
    const cn1 = repo.createCreditNote(invoiceId);
    saveCreditNote(cn1, [{ ...draftLines(cn1)[0], quantity: 1 }]);
    repo.finalize(cn1);

    let original = repo.findById(invoiceId)!;
    expect(original).toMatchObject({ status: 'sent', payment_status: 'unpaid', credited_amount: 12000 });
    expect(balanceDue(original)).toBe(TOTAL - 12000);
    expect(creditableAmount(original)).toBe(TOTAL - 12000);

    // 2nd: the default draft copies everything (295,00) and exceeds what is left (175,00)
    const cn2 = repo.createCreditNote(invoiceId);
    expect(repo.findById(cn2)?.total_amount).toBe(TOTAL);
    expect(() => repo.finalize(cn2)).toThrow(/dépasse le montant restant à créditer/);
    expect(() => saveCreditNote(cn2, draftLines(cn2))).toThrow(/dépasse/);
    expect(repo.findById(cn2)?.status).toBe('draft');
    expect(repo.findById(invoiceId)?.credited_amount).toBe(12000);

    // Reduced to exactly what is left: 1 x Conseil + 1 x Livre = 175,00
    const [conseil, livre] = draftLines(cn2);
    saveCreditNote(cn2, [{ ...conseil, quantity: 1 }, livre]);
    expect(repo.finalize(cn2)).toBe(true);

    original = repo.findById(invoiceId)!;
    expect(original).toMatchObject({ status: 'cancelled', credited_amount: TOTAL });
    expect(repo.findCreditNotes(invoiceId).map((c) => c.invoice_number)).toEqual([
      `AV-${YEAR}-001`,
      `AV-${YEAR}-002`,
    ]);
  });

  it('a credit note equal to the unpaid balance settles the invoice', () => {
    const invoiceId = issueInvoice(-10, LINES, true);
    pay(invoiceId, TOTAL - 12000);
    expect(repo.findById(invoiceId)).toMatchObject({ status: 'sent', payment_status: 'partial' });

    const creditNoteId = repo.createCreditNote(invoiceId);
    saveCreditNote(creditNoteId, [{ ...draftLines(creditNoteId)[0], quantity: 1 }]);
    repo.finalize(creditNoteId);

    const original = repo.findById(invoiceId)!;
    expect(original).toMatchObject({
      status: 'paid',
      payment_status: 'paid',
      paid_amount: TOTAL - 12000,
      credited_amount: 12000,
    });
    expect(balanceDue(original)).toBe(0);
    expect(overpaidAmount(original)).toBe(0);
  });

  it('crediting a paid invoice leaves an amount to refund', () => {
    const invoiceId = issueInvoice();
    repo.markAsPaid(invoiceId);
    repo.finalize(repo.createCreditNote(invoiceId));

    const original = repo.findById(invoiceId)!;
    expect(original).toMatchObject({ status: 'cancelled', payment_status: 'paid', paid_amount: TOTAL });
    expect(balanceDue(original)).toBe(0);
    expect(overpaidAmount(original)).toBe(TOTAL);
  });

  it('never accepts a payment on a credit note', () => {
    const creditNoteId = repo.createCreditNote(issueInvoice());
    repo.finalize(creditNoteId);
    expect(() => pay(creditNoteId, 100)).toThrow(/avoir/i);
    expect(repo.markAsPaid(creditNoteId)).toBe(false);
    expect(repo.findById(creditNoteId)).toMatchObject({ status: 'finalized', paid_amount: 0 });
  });
});

describe('payments', () => {
  it('records partial payments until the invoice is paid', () => {
    const invoiceId = issueInvoice(-10, LINES, true);

    const first = pay(invoiceId, 10000, {
      payment_date: isoDate(-2),
      payment_method: 'check',
      payment_reference: ' CHQ 123 ',
    });
    expect(repo.findById(invoiceId)).toMatchObject({
      status: 'sent',
      payment_status: 'partial',
      paid_amount: 10000,
    });
    expect(repo.findCompleteById(invoiceId)?.balance_due).toBe(TOTAL - 10000);

    const second = pay(invoiceId, TOTAL - 10000, { payment_method: 'card' });
    expect(repo.findById(invoiceId)).toMatchObject({
      status: 'paid',
      payment_status: 'paid',
      paid_amount: TOTAL,
    });

    expect(repo.findPayments(invoiceId)).toMatchObject([
      { id: second, amount: TOTAL - 10000, payment_method: 'card', payment_date: isoDate() },
      {
        id: first,
        amount: 10000,
        payment_method: 'check',
        payment_reference: 'CHQ 123',
        payment_date: isoDate(-2),
      },
    ]);
  });

  it('validates the payment', () => {
    const invoiceId = issueInvoice();

    expect(() => pay(invoiceId, 0)).toThrow(/supérieur à zéro/);
    expect(() => pay(invoiceId, -500)).toThrow(/supérieur à zéro/);
    expect(() => pay(invoiceId, 10.5)).toThrow(/supérieur à zéro/);
    expect(() => pay(invoiceId, TOTAL + 1)).toThrow(/dépasse le solde/);
    expect(() => pay(invoiceId, 100, { payment_date: '12/03/2026' })).toThrow(/date/);
    expect(() => pay(invoiceId, 100, { payment_date: isoDate(2) })).toThrow(/futur/);
    expect(() => pay(invoiceId, 100, { payment_method: 'bitcoin' })).toThrow(/mode de paiement/);
    expect(() => pay(9999, 100)).toThrow(/introuvable/);

    const draft = repo.saveDraft(null, { invoice_date: isoDate(), buyer_id: customerId }, LINES);
    expect(() => pay(draft, 100)).toThrow(/Finalisez/);

    expect(repo.findPayments(invoiceId)).toEqual([]);
    expect(repo.findById(invoiceId)).toMatchObject({ paid_amount: 0, payment_status: 'unpaid' });

    pay(invoiceId, TOTAL);
    expect(() => pay(invoiceId, 1)).toThrow(/déjà soldée/);
  });

  it('deleting a payment restores the balance and the status', () => {
    const sentId = issueInvoice(-10, LINES, true);
    const p1 = pay(sentId, 10000);
    const p2 = pay(sentId, TOTAL - 10000);
    expect(repo.findById(sentId)?.status).toBe('paid');

    expect(repo.deletePayment(p2)).toBe(true);
    expect(repo.findById(sentId)).toMatchObject({
      status: 'sent',
      payment_status: 'partial',
      paid_amount: 10000,
    });

    expect(repo.deletePayment(p1)).toBe(true);
    expect(repo.findById(sentId)).toMatchObject({
      status: 'sent',
      payment_status: 'unpaid',
      paid_amount: 0,
    });
    expect(repo.findPayments(sentId)).toEqual([]);
    expect(repo.deletePayment(p1)).toBe(false);

    // An invoice that was never marked as sent goes back to "finalized"
    const finalizedId = issueInvoice(-1);
    repo.markAsPaid(finalizedId);
    const [payment] = repo.findPayments(finalizedId);
    repo.deletePayment(payment.id as number);
    expect(repo.findById(finalizedId)).toMatchObject({
      status: 'finalized',
      payment_status: 'unpaid',
      paid_amount: 0,
    });
  });

  it('markAsPaid records only what is still due after payments and credit notes', () => {
    const invoiceId = issueInvoice();
    pay(invoiceId, 5000);
    const creditNoteId = repo.createCreditNote(invoiceId);
    saveCreditNote(creditNoteId, [{ ...draftLines(creditNoteId)[0], quantity: 1 }]);
    repo.finalize(creditNoteId);

    expect(repo.markAsPaid(invoiceId, isoDate(-1))).toBe(true);
    expect(repo.findPayments(invoiceId).map((p) => p.amount).sort((a, b) => a - b)).toEqual([
      5000,
      TOTAL - 12000 - 5000,
    ]);
    expect(repo.findById(invoiceId)).toMatchObject({
      status: 'paid',
      payment_status: 'paid',
      paid_amount: TOTAL - 12000,
    });
  });
});

describe('statistics with credit notes', () => {
  it('subtracts issued credit notes from the revenue', () => {
    const a = issueInvoice(-10, LINES, true); // 295,00
    issueInvoice(-9); // 295,00, finalized only
    repo.saveDraft(null, { invoice_date: isoDate(), buyer_id: customerId }, LINES); // draft

    expect(repo.getTotalRevenue()).toBe(2 * TOTAL);

    // Draft credit note: no effect yet
    const creditNoteId = repo.createCreditNote(a);
    saveCreditNote(creditNoteId, [{ ...draftLines(creditNoteId)[0], quantity: 1 }]);
    expect(repo.getTotalRevenue()).toBe(2 * TOTAL);

    repo.finalize(creditNoteId);
    expect(repo.getTotalRevenue()).toBe(2 * TOTAL - 12000);
    // The credit note counts at its own date
    expect(repo.getTotalRevenue(isoDate(-1))).toBe(-12000);
    expect(repo.getTotalRevenue(undefined, isoDate(-1))).toBe(2 * TOTAL);

    expect(repo.getFinancialMetrics(30)).toMatchObject({
      invoiced_amount: 2 * TOTAL,
      credit_notes_amount: 12000,
      net_revenue: 2 * TOTAL - 12000,
    });
  });

  it('reduces outstanding and overdue amounts', () => {
    const awaiting = issueInvoice(-10, LINES, true);
    const overdue = issueInvoice(-5, LINES, true);
    const cancelled = issueInvoice(-4, LINES, true);
    // Make the second and third ones overdue (terms of 2 days)
    db.prepare('UPDATE invoices SET payment_terms_days = 2, due_date = ? WHERE id IN (?, ?)').run(
      isoDate(-2),
      overdue,
      cancelled
    );

    expect(repo.getFinancialMetrics(30)).toMatchObject({
      amount_awaiting_payment: TOTAL,
      awaiting_count: 1,
      overdue_amount: 2 * TOTAL,
      overdue_count: 2,
    });
    expect(repo.findOverdue().map((i) => i.id)).toEqual([overdue, cancelled]);

    // Partial credit on the awaiting one, partial credit + payment on the overdue one
    for (const id of [awaiting, overdue]) {
      const cn = repo.createCreditNote(id);
      saveCreditNote(cn, [{ ...draftLines(cn)[0], quantity: 1 }]);
      repo.finalize(cn);
      repo.markAsSent(cn);
    }
    pay(overdue, 5000);
    // Full credit on the third one
    repo.finalize(repo.createCreditNote(cancelled));

    expect(repo.getFinancialMetrics(30)).toMatchObject({
      amount_awaiting_payment: TOTAL - 12000,
      awaiting_count: 1,
      overdue_amount: TOTAL - 12000 - 5000,
      overdue_count: 1,
    });
    // Neither the cancelled invoice nor the credit notes are overdue
    expect(repo.findOverdue().map((i) => i.id)).toEqual([overdue]);
    // Sent credit notes are not counted as sent invoices
    expect(repo.countSent()).toBe(2);
  });

  it('filters the list by document type', () => {
    const invoiceId = issueInvoice();
    const creditNoteId = repo.createCreditNote(invoiceId);

    expect(repo.findAll({ invoice_type: 'credit_note' }).map((i) => i.id)).toEqual([creditNoteId]);
    expect(repo.findAll({ invoice_type: 'invoice' }).map((i) => i.id)).toEqual([invoiceId]);
    expect(repo.count({ invoice_type: 'credit_note' })).toBe(1);
    expect(repo.findAll()).toHaveLength(2);
  });
});
