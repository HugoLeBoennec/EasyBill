import { describe, it, expect } from 'vitest';
import type { Invoice, InvoiceLine, Party } from '../../database/types';
import {
  computeInvoiceTotals,
  computeLineAmounts,
  eurosToCents,
  roundHalfUp,
} from '../../database/repositories/invoice-repository';
import { invoiceGenerator } from '../../services/einvoicing/formats/invoice-generator';
import { InvoiceTypeCode, VATCategory } from '../../services/einvoicing/formats/types';
import {
  COMPANY_PLACEHOLDER_NAME,
  InvoiceMappingError,
  VAT_FRANCHISE_MENTION,
  buildExportFilename,
  centsToAmount,
  mapInvoiceToEN16931,
  mapParty,
  validateInvoiceForExport,
} from '../invoice-mapper';
import type { InvoiceExportSource } from '../invoice-mapper';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const seller = (overrides: Partial<Party> = {}): Party => ({
  id: 1,
  party_type: 'company',
  legal_name: 'Dupont Conseil EURL',
  legal_form: 'EURL',
  siren: '732829320',
  siret: '73282932000074',
  vat_number: 'FR44732829320',
  address_line1: '12 rue de la Paix',
  postal_code: '75002',
  city: 'Paris',
  country_code: 'FR',
  email: 'contact@dupont-conseil.fr',
  phone: '0102030405',
  active: 1,
  ...overrides,
});

const buyer = (overrides: Partial<Party> = {}): Party => ({
  id: 2,
  party_type: 'customer',
  legal_name: 'Client & Fils SARL',
  siret: '55210055400013',
  vat_number: 'FR 40 552100554',
  address_line1: '5 avenue des Champs',
  postal_code: '69001',
  city: 'Lyon',
  country_code: 'fr',
  active: 1,
  ...overrides,
});

const line = (
  lineNumber: number,
  quantity: number,
  unitPriceCents: number,
  vatRate: number,
  overrides: Partial<InvoiceLine> = {}
): InvoiceLine => {
  const amounts = computeLineAmounts(quantity, unitPriceCents, vatRate);
  return {
    id: lineNumber,
    invoice_id: 10,
    line_number: lineNumber,
    item_name: `Prestation ${lineNumber}`,
    quantity,
    unit_code: 'C62',
    unit_price: unitPriceCents,
    line_amount: amounts.line_amount,
    discount_amount: 0,
    line_total: amounts.line_total,
    vat_category: vatRate > 0 ? 'S' : 'E',
    vat_rate: vatRate,
    vat_amount: amounts.vat_amount,
    ...overrides,
  };
};

const source = (
  lines: InvoiceLine[] = [line(1, 2, 45000, 20), line(2, 3, 1999, 5.5)],
  invoiceOverrides: Partial<Invoice> = {}
): InvoiceExportSource => {
  const totals = computeInvoiceTotals(lines);
  return {
    invoice: {
      id: 10,
      invoice_number: 'INV-2026-007',
      invoice_date: '2026-03-15',
      due_date: '2026-04-14',
      invoice_type: 'invoice',
      subtotal_amount: totals.subtotal_amount,
      tax_amount: totals.tax_amount,
      total_amount: totals.total_amount,
      paid_amount: 0,
      currency: 'EUR',
      seller_id: 1,
      buyer_id: 2,
      status: 'finalized',
      payment_status: 'unpaid',
      payment_terms_days: 30,
      notes: 'Merci de votre confiance',
      ...invoiceOverrides,
    },
    lines,
    seller: seller(),
    buyer: buyer(),
  };
};

/** Minimal well-formedness check: prolog + balanced, properly nested tags. */
function assertWellFormedXml(xml: string): void {
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  const body = xml.replace(/^<\?xml[^>]*\?>/, '');
  // No raw ampersand outside an entity
  expect(body).not.toMatch(/&(?!(amp|lt|gt|quot|apos);)/);
  const stack: string[] = [];
  let roots = 0;
  const tagPattern = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/g;
  let consumed = 0;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(body)) !== null) {
    const text = body.slice(consumed, match.index);
    expect(text).not.toContain('<');
    expect(text).not.toContain('>');
    consumed = match.index + match[0].length;
    const [, closing, name, , selfClosing] = match;
    if (closing) {
      expect(stack.pop()).toBe(name);
    } else if (!selfClosing) {
      if (stack.length === 0) roots++;
      stack.push(name);
    }
  }
  expect(body.slice(consumed).trim()).toBe('');
  expect(stack).toEqual([]);
  expect(roots).toBe(1);
}

// ---------------------------------------------------------------------------
// Rounding / totals helpers shared by the form, the repository and the mapper
// ---------------------------------------------------------------------------

describe('amount helpers', () => {
  it('rounds half up without floating point artefacts', () => {
    expect(roundHalfUp(267.49999999999994)).toBe(268); // 2.675 * 100
    expect(roundHalfUp(114.99999999999999)).toBe(115); // 1.15 * 100
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(0.4999)).toBe(0);
    expect(roundHalfUp(-0.5)).toBe(-1);
    expect(eurosToCents(2.675)).toBe(268);
    expect(eurosToCents(19.99)).toBe(1999);
    expect(eurosToCents(0.07)).toBe(7);
  });

  it('computes line amounts in integer cents', () => {
    expect(computeLineAmounts(3, 1999, 20)).toEqual({
      line_amount: 5997,
      line_total: 5997,
      vat_amount: 1199, // 1199.4
    });
    expect(computeLineAmounts(2.5, 1999, 5.5)).toEqual({
      line_amount: 4998, // 4997.5 rounded half up
      line_total: 4998,
      vat_amount: 275, // 274.89
    });
  });

  it('computes VAT per rate on the summed base, not per line', () => {
    // 3 lines of 0.33 EUR at 20 %: per line VAT would be 3 x 0.07 = 0.21,
    // the legal computation is 20 % of 0.99 = 0.198 -> 0.20
    const lines = [1, 2, 3].map((n) => line(n, 1, 33, 20));
    const totals = computeInvoiceTotals(lines);
    expect(totals.subtotal_amount).toBe(99);
    expect(totals.tax_amount).toBe(20);
    expect(totals.total_amount).toBe(119);
    expect(totals.vat_breakdown).toEqual([
      { vat_category: 'S', vat_rate: 20, taxable_amount: 99, tax_amount: 20 },
    ]);
  });

  it('keeps HT + TVA = TTC with several rates', () => {
    const totals = computeInvoiceTotals([
      line(1, 2, 45000, 20),
      line(2, 3, 1999, 5.5),
      line(3, 1, 12345, 10),
      line(4, 7, 333, 0),
    ]);
    expect(totals.subtotal_amount).toBe(90000 + 5997 + 12345 + 2331);
    expect(totals.tax_amount).toBe(18000 + 330 + 1235); // 329.835 -> 330, 1234.5 -> 1235
    expect(totals.total_amount).toBe(totals.subtotal_amount + totals.tax_amount);
    expect(totals.vat_breakdown.map((b) => b.vat_rate)).toEqual([20, 10, 5.5, 0]);
  });
});

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

describe('mapInvoiceToEN16931', () => {
  it('maps the header', () => {
    const mapped = mapInvoiceToEN16931(source());
    expect(mapped.id).toBe('INV-2026-007');
    expect(mapped.issueDate).toBe('2026-03-15');
    expect(mapped.dueDate).toBe('2026-04-14');
    expect(mapped.typeCode).toBe(InvoiceTypeCode.INVOICE);
    expect(mapped.documentCurrencyCode).toBe('EUR');
    expect(mapped.note).toBe('Merci de votre confiance');
    expect(mapped.customizationId).toContain('en16931');
    expect(mapped.paymentTerms?.note).toBe('Paiement à 30 jours, échéance le 14/04/2026');
    expect(mapped.paymentMeans?.[0].paymentId).toBe('INV-2026-007');
  });

  it('maps credit notes to type code 381', () => {
    const mapped = mapInvoiceToEN16931(source(undefined, { invoice_type: 'credit_note' }));
    expect(mapped.typeCode).toBe(InvoiceTypeCode.CREDIT_NOTE);
  });

  it('maps seller and buyer parties', () => {
    const mapped = mapInvoiceToEN16931(source());
    const s = mapped.accountingSupplierParty;
    expect(s.partyLegalEntity.registrationName).toBe('Dupont Conseil EURL');
    expect(s.partyLegalEntity.companyId).toBe('73282932000074');
    expect(s.partyLegalEntity.companyIdScheme).toBe('0009');
    expect(s.partyLegalEntity.companyLegalForm).toBe('EURL');
    expect(s.partyTaxScheme).toEqual([
      { companyId: 'FR44732829320', taxScheme: { id: 'VAT' } },
    ]);
    expect(s.postalAddress).toMatchObject({
      streetName: '12 rue de la Paix',
      postalZone: '75002',
      cityName: 'Paris',
      countryCode: 'FR',
    });
    expect(s.endpointId).toBe('contact@dupont-conseil.fr');
    expect(s.endpointScheme).toBe('EM');
    expect(s.contact).toEqual({ telephone: '0102030405', email: 'contact@dupont-conseil.fr' });

    const b = mapped.accountingCustomerParty;
    expect(b.partyLegalEntity.registrationName).toBe('Client & Fils SARL');
    expect(b.postalAddress.countryCode).toBe('FR'); // upper-cased
    expect(b.partyTaxScheme?.[0].companyId).toBe('FR40552100554'); // spaces removed
    expect(b.contact).toBeUndefined();
    expect(b.endpointId).toBeUndefined();
  });

  it('falls back to the SIREN when there is no SIRET', () => {
    const party = mapParty(seller({ siret: undefined }));
    expect(party.partyLegalEntity.companyId).toBe('732829320');
    expect(party.partyLegalEntity.companyIdScheme).toBe('0002');
  });

  it('converts cents to currency units on lines', () => {
    const mapped = mapInvoiceToEN16931(source());
    expect(mapped.invoiceLines).toHaveLength(2);
    const [first, second] = mapped.invoiceLines;
    expect(first.id).toBe('1');
    expect(first.invoicedQuantity).toBe(2);
    expect(first.unitCode).toBe('C62');
    expect(first.price.priceAmount).toBe(450);
    expect(first.lineExtensionAmount).toBe(900);
    expect(first.item.name).toBe('Prestation 1');
    expect(first.item.classifiedTaxCategory).toMatchObject({ id: 'S', percent: 20 });
    expect(second.price.priceAmount).toBe(19.99);
    expect(second.lineExtensionAmount).toBe(59.97);
    expect(second.item.classifiedTaxCategory).toMatchObject({ id: 'S', percent: 5.5 });
  });

  it('orders lines by line number and renumbers them from 1', () => {
    const mapped = mapInvoiceToEN16931(
      source([line(5, 1, 1000, 20, { item_name: 'B' }), line(2, 1, 2000, 20, { item_name: 'A' })])
    );
    expect(mapped.invoiceLines.map((l) => [l.id, l.item.name])).toEqual([
      ['1', 'A'],
      ['2', 'B'],
    ]);
  });

  it('produces totals consistent with the database (HT / TVA / TTC)', () => {
    const src = source();
    const mapped = mapInvoiceToEN16931(src);
    const totals = mapped.legalMonetaryTotal;

    expect(totals.lineExtensionAmount).toBe(centsToAmount(src.invoice.subtotal_amount));
    expect(totals.taxExclusiveAmount).toBe(centsToAmount(src.invoice.subtotal_amount));
    expect(mapped.taxTotal[0].taxAmount).toBe(centsToAmount(src.invoice.tax_amount));
    expect(totals.taxInclusiveAmount).toBe(centsToAmount(src.invoice.total_amount));
    expect(totals.payableAmount).toBe(centsToAmount(src.invoice.total_amount));
    expect(totals.prepaidAmount).toBeUndefined();

    // 900.00 + 59.97 = 959.97 ; VAT 180.00 + 3.30 = 183.30 ; TTC 1143.27
    expect(totals.lineExtensionAmount).toBe(959.97);
    expect(mapped.taxTotal[0].taxAmount).toBe(183.3);
    expect(totals.taxInclusiveAmount).toBe(1143.27);

    // EN16931 arithmetic, checked in integer cents
    const cents = (n: number) => Math.round(n * 100);
    const sumLines = mapped.invoiceLines.reduce((s, l) => s + cents(l.lineExtensionAmount), 0);
    expect(sumLines).toBe(cents(totals.lineExtensionAmount));
    const subtotals = mapped.taxTotal[0].taxSubtotals;
    expect(subtotals.reduce((s, t) => s + cents(t.taxableAmount), 0)).toBe(
      cents(totals.taxExclusiveAmount)
    );
    expect(subtotals.reduce((s, t) => s + cents(t.taxAmount), 0)).toBe(
      cents(mapped.taxTotal[0].taxAmount)
    );
    expect(cents(totals.taxExclusiveAmount) + cents(mapped.taxTotal[0].taxAmount)).toBe(
      cents(totals.taxInclusiveAmount)
    );
  });

  it('groups the VAT breakdown by rate', () => {
    const mapped = mapInvoiceToEN16931(
      source([line(1, 1, 10000, 20), line(2, 1, 5000, 20), line(3, 1, 2000, 10)])
    );
    expect(mapped.taxTotal[0].taxSubtotals).toEqual([
      {
        taxableAmount: 150,
        taxAmount: 30,
        taxCategory: { id: 'S', percent: 20, taxScheme: { id: 'VAT' } },
      },
      {
        taxableAmount: 20,
        taxAmount: 2,
        taxCategory: { id: 'S', percent: 10, taxScheme: { id: 'VAT' } },
      },
    ]);
  });

  it('reports the amount already paid', () => {
    const src = source([line(1, 1, 10000, 20)], { paid_amount: 5000 });
    const totals = mapInvoiceToEN16931(src).legalMonetaryTotal;
    expect(totals.taxInclusiveAmount).toBe(120);
    expect(totals.prepaidAmount).toBe(50);
    expect(totals.payableAmount).toBe(70);
  });

  it('treats 0 % lines of a seller without VAT number as VAT franchise', () => {
    const src = source([line(1, 4, 5000, 0, { vat_category: 'S' })]);
    src.seller = seller({ vat_number: undefined });
    const mapped = mapInvoiceToEN16931(src);

    const category = mapped.invoiceLines[0].item.classifiedTaxCategory;
    expect(category.id).toBe(VATCategory.EXEMPT);
    expect(category.percent).toBe(0);
    expect(category.taxExemptionReason).toBe(VAT_FRANCHISE_MENTION);
    expect(mapped.taxTotal[0].taxAmount).toBe(0);
    expect(mapped.taxTotal[0].taxSubtotals[0].taxCategory.taxExemptionReason).toBe(
      VAT_FRANCHISE_MENTION
    );
    expect(mapped.legalMonetaryTotal.taxInclusiveAmount).toBe(200);
    // The legal mention must be printed on the invoice
    expect(mapped.note).toBe(`Merci de votre confiance\n${VAT_FRANCHISE_MENTION}`);
    expect(mapped.accountingSupplierParty.partyTaxScheme).toBeUndefined();
  });

  it('keeps an explicit zero-rate category (reverse charge)', () => {
    const mapped = mapInvoiceToEN16931(source([line(1, 1, 5000, 0, { vat_category: 'AE' })]));
    const category = mapped.invoiceLines[0].item.classifiedTaxCategory;
    expect(category.id).toBe(VATCategory.REVERSE_CHARGE);
    expect(category.taxExemptionReason).toMatch(/Autoliquidation/);
    expect(mapped.note).toBe('Merci de votre confiance');
  });

  it('does not mutate its input', () => {
    const src = source();
    const snapshot = JSON.stringify(src);
    mapInvoiceToEN16931(src);
    expect(JSON.stringify(src)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// Validation (French messages)
// ---------------------------------------------------------------------------

describe('validateInvoiceForExport', () => {
  it('accepts a complete invoice', () => {
    expect(validateInvoiceForExport(source())).toEqual([]);
  });

  it('rejects a missing or placeholder company', () => {
    const missing = source();
    missing.seller = undefined;
    expect(validateInvoiceForExport(missing)[0]).toMatch(/votre entreprise ne sont pas configurées/);

    const placeholder = source();
    placeholder.seller = {
      id: 1,
      party_type: 'company',
      legal_name: COMPANY_PLACEHOLDER_NAME,
      country_code: 'FR',
      active: 1,
    };
    expect(validateInvoiceForExport(placeholder)[0]).toMatch(
      /votre entreprise ne sont pas configurées/
    );
  });

  it('lists what is missing in the company profile', () => {
    const src = source();
    src.seller = seller({ postal_code: '', city: undefined, siret: undefined, siren: undefined });
    const errors = validateInvoiceForExport(src);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('code postal, ville, SIRET ou SIREN');
  });

  it('rejects a missing or incomplete customer', () => {
    const missing = source();
    missing.buyer = null;
    expect(validateInvoiceForExport(missing)).toEqual([
      "Aucun client n'est associé à cette facture.",
    ]);

    const incomplete = source();
    incomplete.buyer = buyer({ city: '' });
    expect(validateInvoiceForExport(incomplete)[0]).toMatch(
      /client « Client & Fils SARL » est incomplète \(ville\)/
    );
  });

  it('rejects an invoice without lines', () => {
    expect(validateInvoiceForExport(source([]))).toEqual([
      'La facture ne contient aucune ligne.',
    ]);
  });

  it('makes the mapper throw an InvoiceMappingError carrying every message', () => {
    const src = source([]);
    src.buyer = undefined;
    let thrown: unknown;
    try {
      mapInvoiceToEN16931(src);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(InvoiceMappingError);
    expect((thrown as InvoiceMappingError).errors).toHaveLength(2);
  });
});

describe('buildExportFilename', () => {
  it('builds a file name per format', () => {
    expect(buildExportFilename('INV-2026-007', 'facturx-pdf')).toBe('Facture-INV-2026-007.pdf');
    expect(buildExportFilename('INV-2026-007', 'facturx-xml')).toBe(
      'Facture-INV-2026-007-facturx.xml'
    );
    expect(buildExportFilename('INV-2026-007', 'ubl')).toBe('Facture-INV-2026-007-ubl.xml');
  });

  it('removes characters that are unsafe in file names', () => {
    expect(buildExportFilename('FA/2026\\001: x', 'facturx-pdf')).toBe('Facture-FA-2026-001-x.pdf');
    expect(buildExportFilename('', 'ubl')).toBe('Facture-sans-numero-ubl.xml');
  });
});

// ---------------------------------------------------------------------------
// The mapped model is accepted by the real generators
// ---------------------------------------------------------------------------

describe('generators accept the mapped invoice', () => {
  const mapped = mapInvoiceToEN16931(source());

  it('passes the generators validation', () => {
    expect(invoiceGenerator.validate(mapped)).toMatchObject({ valid: true, errors: [] });
  });

  it('generates a Factur-X PDF', async () => {
    const result = await invoiceGenerator.generate(mapped, { format: 'facturx-pdf' });
    expect(result.errors).toBeUndefined();
    expect(result.success).toBe(true);
    const bytes = result.data as Uint8Array;
    expect(bytes.length).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-');
  });

  it('generates well-formed Factur-X (CII) XML with consistent totals', async () => {
    const result = await invoiceGenerator.generate(mapped, { format: 'facturx-xml' });
    expect(result.success).toBe(true);
    const xml = result.data as string;
    assertWellFormedXml(xml);
    expect(xml).toContain('<ram:ID>INV-2026-007</ram:ID>');
    expect(xml).toContain('<udt:DateTimeString format="102">20260315</udt:DateTimeString>');
    expect(xml).toContain('<ram:Name>Client &amp; Fils SARL</ram:Name>');
    expect(xml).toContain('<ram:LineTotalAmount>959.97</ram:LineTotalAmount>');
    expect(xml).toContain('<ram:TaxBasisTotalAmount>959.97</ram:TaxBasisTotalAmount>');
    expect(xml).toContain('<ram:TaxTotalAmount currencyID="EUR">183.30</ram:TaxTotalAmount>');
    expect(xml).toContain('<ram:GrandTotalAmount>1143.27</ram:GrandTotalAmount>');
    expect(xml).toContain('<ram:DuePayableAmount>1143.27</ram:DuePayableAmount>');
  });

  it('generates well-formed UBL XML with consistent totals', async () => {
    const result = await invoiceGenerator.generate(mapped, { format: 'ubl' });
    expect(result.success).toBe(true);
    const xml = result.data as string;
    assertWellFormedXml(xml);
    expect(xml).toContain('<cbc:ID>INV-2026-007</cbc:ID>');
    expect(xml).toContain('<cbc:IssueDate>2026-03-15</cbc:IssueDate>');
    expect(xml).toContain('<cbc:TaxExclusiveAmount currencyID="EUR">959.97</cbc:TaxExclusiveAmount>');
    expect(xml).toContain('<cbc:TaxInclusiveAmount currencyID="EUR">1143.27</cbc:TaxInclusiveAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">1143.27</cbc:PayableAmount>');
  });
});
