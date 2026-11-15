import { describe, it, expect } from 'vitest';
import type { Party, Quote, QuoteLine } from '../../database/types';
import { computeLineAmounts } from '../../database/repositories/invoice-repository';
import {
  QuoteMappingError,
  buildQuoteFilename,
  getQuoteExportWarnings,
  mapQuoteToDocument,
  validateQuoteForExport,
} from '../quote-mapper';
import type { QuoteExportSource } from '../quote-mapper';
import { VAT_FRANCHISE_MENTION } from '../invoice-mapper';

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
  active: 1,
  ...overrides,
});

const buyer = (overrides: Partial<Party> = {}): Party => ({
  id: 2,
  party_type: 'customer',
  legal_name: 'Client SARL',
  address_line1: '5 avenue des Champs',
  postal_code: '69001',
  city: 'Lyon',
  country_code: 'FR',
  active: 1,
  ...overrides,
});

const line = (n: number, qty: number, price: number, vat: number): QuoteLine => {
  const a = computeLineAmounts(qty, price, vat);
  return {
    id: n,
    quote_id: 5,
    line_number: n,
    item_name: `Prestation ${n}`,
    quantity: qty,
    unit_code: 'HUR',
    unit_price: price,
    line_amount: a.line_amount,
    discount_amount: 0,
    line_total: a.line_total,
    vat_category: vat > 0 ? 'S' : 'E',
    vat_rate: vat,
    vat_amount: a.vat_amount,
  };
};

const quote = (overrides: Partial<Quote> = {}): Quote => ({
  id: 5,
  quote_number: 'QT-2026-0007',
  quote_date: '2026-03-01',
  valid_until: '2026-03-31',
  subtotal_amount: 0,
  tax_amount: 0,
  total_amount: 0,
  currency: 'EUR',
  customer_id: 2,
  status: 'draft',
  notes: 'Délai : 3 semaines',
  ...overrides,
});

const source = (overrides: Partial<QuoteExportSource> = {}): QuoteExportSource => ({
  quote: quote(),
  lines: [line(1, 2, 50000, 20), line(2, 1, 20000, 10)],
  seller: seller(),
  buyer: buyer(),
  ...overrides,
});

describe('mapQuoteToDocument', () => {
  it('maps a complete quote', () => {
    const { model, validUntil } = mapQuoteToDocument(source());
    expect(validUntil).toBe('2026-03-31');
    expect(model.id).toBe('QT-2026-0007');
    expect(model.issueDate).toBe('2026-03-01');
    expect(model.dueDate).toBeUndefined();
    expect(model.note).toBe('Délai : 3 semaines');
    expect(model.invoiceLines).toHaveLength(2);
    // 2 x 500,00 at 20 % + 200,00 at 10 %
    expect(model.legalMonetaryTotal.taxExclusiveAmount).toBe(1200);
    expect(model.legalMonetaryTotal.taxInclusiveAmount).toBe(1420);
    expect(model.legalMonetaryTotal.payableAmount).toBe(1420);
    expect(model.accountingCustomerParty.partyLegalEntity.registrationName).toBe('Client SARL');
    expect(model.legalMentions?.sellerLegalLine).toContain('EURL');
    expect(model.legalMentions?.vatExemptionText).toBeUndefined();
    expect(model.legalMentions?.latePenaltyText).toBeUndefined();
  });

  it('adds the VAT franchise mention for a franchise seller', () => {
    const { model } = mapQuoteToDocument(
      source({ seller: seller({ vat_franchise: 1, vat_number: '' }), lines: [line(1, 1, 10000, 0)] })
    );
    expect(model.legalMentions?.vatExemptionText).toBe(VAT_FRANCHISE_MENTION);
    expect(model.legalMonetaryTotal.taxInclusiveAmount).toBe(100);
  });

  it('reports every missing piece of data in French', () => {
    const errors = validateQuoteForExport({ quote: quote({ quote_number: '' }), lines: [], seller: undefined, buyer: undefined });
    expect(errors.join('\n')).toMatch(/pas de numéro/);
    expect(errors.join('\n')).toMatch(/entreprise/);
    expect(errors.join('\n')).toMatch(/Aucun client/);
    expect(errors.join('\n')).toMatch(/aucune ligne/);
    expect(() => mapQuoteToDocument({ quote: quote(), lines: [], seller: seller(), buyer: buyer() })).toThrow(
      QuoteMappingError
    );
  });

  it('rejects an incomplete customer and a placeholder company', () => {
    const errors = validateQuoteForExport(
      source({ buyer: buyer({ city: '' }), seller: seller({ legal_name: 'Your Company Name' }) })
    );
    expect(errors.some((e) => e.includes('incomplète (ville)'))).toBe(true);
    expect(errors.some((e) => e.includes('ne sont pas configurées'))).toBe(true);
  });

  it('warns when there is no validity date', () => {
    expect(getQuoteExportWarnings(source({ quote: quote({ valid_until: undefined }) }))[0]).toMatch(/validité/);
    expect(getQuoteExportWarnings(source())).toEqual([]);
  });

  it('builds the default file name', () => {
    expect(buildQuoteFilename('QT-2026-0007')).toBe('Devis-QT-2026-0007.pdf');
    expect(buildQuoteFilename('A/B 1')).toBe('Devis-A-B-1.pdf');
  });
});
