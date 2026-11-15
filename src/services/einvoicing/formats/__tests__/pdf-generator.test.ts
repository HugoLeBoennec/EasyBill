/**
 * PDF generator tests: layout, French formatting, legal mentions, PDF/A-3 structure
 */

import { PDFDocument, PDFName, PDFDict, PDFArray } from 'pdf-lib';
import { pdfGenerator } from '../pdf-generator';
import {
  describeCompanyId,
  formatAmountFR,
  formatDateFR,
  sanitizeText,
  wrapText,
} from '../pdf-text';
import { buildXmpMetadata } from '../pdfa';
import { CurrencyCode, Invoice, InvoiceTypeCode, PaymentMeansCode, UnitCode, VATCategory } from '../types';

const NBSP = ' ';
const VAT_TEXT = 'TVA non applicable, art. 293 B du CGI';

function makeInvoice(lineCount = 3, opts: { credit?: boolean; franchise?: boolean; note?: string } = {}): Invoice {
  const category = opts.franchise
    ? { id: VATCategory.NOT_SUBJECT, taxExemptionReason: VAT_TEXT, taxScheme: { id: 'VAT' } }
    : { id: VATCategory.STANDARD, percent: 20, taxScheme: { id: 'VAT' } };
  const invoiceLines = Array.from({ length: lineCount }, (_, i) => ({
    id: String(i + 1),
    invoicedQuantity: 2,
    unitCode: UnitCode.HOUR,
    lineExtensionAmount: 200,
    item: {
      name: `Prestation ${i + 1} avec un intitulé suffisamment long pour être renvoyé à la ligne dans la colonne`,
      classifiedTaxCategory: category,
    },
    price: { priceAmount: 100 },
  }));
  const ht = 200 * lineCount;
  const vat = opts.franchise ? 0 : ht * 0.2;
  return {
    customizationId: 'urn:cen.eu:en16931:2017',
    profileId: 'urn:factur-x.eu:1p0:en16931',
    id: opts.credit ? 'AV-2026-001' : 'FA-2026-0042',
    issueDate: '2026-01-31',
    dueDate: '2026-03-02',
    typeCode: opts.credit ? InvoiceTypeCode.CREDIT_NOTE : InvoiceTypeCode.INVOICE,
    documentCurrencyCode: CurrencyCode.EUR,
    note: opts.note,
    invoiceDocumentReference: opts.credit ? [{ id: 'FA-2026-0001', issueDate: '2026-01-15' }] : undefined,
    legalMentions: {
      sellerLegalLine: 'Jean Dupont EI - SIREN 123 456 789',
      vatExemptionText: opts.franchise ? VAT_TEXT : undefined,
      paymentTermsText: 'Paiement à 30 jours',
      latePenaltyText: 'Pénalités de retard : 3 fois le taux d’intérêt légal.',
      recoveryFeeText: 'Indemnité forfaitaire pour frais de recouvrement : 40 €.',
      earlyPaymentDiscountText: 'Pas d’escompte pour paiement anticipé.',
      bankDetails: { iban: 'FR7612345678901234567890123', bic: 'ABCDFRPP' },
    },
    accountingSupplierParty: {
      partyLegalEntity: { registrationName: 'Jean Dupont EI', companyId: '12345678900018', companyIdScheme: '0009' },
      postalAddress: { streetName: '1 rue de la Paix', cityName: 'Paris', postalZone: '75002', countryCode: 'FR' },
    },
    accountingCustomerParty: {
      partyLegalEntity: { registrationName: 'Client SAS', companyId: '987654321' },
      postalAddress: { streetName: '2 avenue des Champs', cityName: 'Lyon', postalZone: '69001', countryCode: 'FR' },
    },
    paymentMeans: [{ paymentMeansCode: PaymentMeansCode.CREDIT_TRANSFER }],
    taxTotal: [{ taxAmount: vat, taxSubtotals: [{ taxableAmount: ht, taxAmount: vat, taxCategory: category }] }],
    legalMonetaryTotal: {
      lineExtensionAmount: ht,
      taxExclusiveAmount: ht,
      taxInclusiveAmount: ht + vat,
      payableAmount: ht + vat,
    },
    invoiceLines,
  };
}

const allText = (pages: string[][]) => pages.map((p) => p.join('\n')).join('\n');

describe('pdf-text helpers', () => {
  it('formats amounts the French way without duplicating the currency', () => {
    expect(formatAmountFR(2213.27, 'EUR')).toBe(`2${NBSP}213,27${NBSP}€`);
    expect(formatAmountFR(2213.27, 'EUR')).not.toContain('EUR');
    expect(formatAmountFR(-5, 'EUR')).toBe(`-5,00${NBSP}€`);
    expect(formatAmountFR(10, 'CHF')).toBe(`10,00${NBSP}CHF`);
  });

  it('formats ISO dates without timezone shift', () => {
    expect(formatDateFR('2026-01-01')).toBe('01/01/2026');
    expect(formatDateFR('2026-12-31T23:30:00Z')).toBe('31/12/2026');
    expect(formatDateFR(undefined)).toBe('');
  });

  it('labels 9 digits as SIREN and 14 digits as SIRET', () => {
    expect(describeCompanyId('123456789').label).toBe('SIREN');
    expect(describeCompanyId('12345678900018').label).toBe('SIRET');
  });

  it('replaces unsupported characters instead of throwing', () => {
    const supported = (cp: number) => cp >= 0x20 && cp < 0x7f;
    expect(sanitizeText('a → b', supported)).toBe('a -> b');
    expect(sanitizeText('ok 😀 fin', supported)).toBe('ok fin');
    expect(() => sanitizeText('\u0000\ud800 x', supported)).not.toThrow();
  });

  it('wraps long text and splits over-long words', () => {
    const lines = wrapText('aaa bbb ccc ddd', 7, (s) => s.length);
    expect(lines).toEqual(['aaa bbb', 'ccc ddd']);
    expect(wrapText('x'.repeat(20), 8, (s) => s.length).every((l) => l.length <= 8)).toBe(true);
  });
});

describe('PDFGenerator', () => {
  it('produces a single page for 3 lines', async () => {
    const r = await pdfGenerator.generateWithReport(makeInvoice(3));
    expect(r.pageCount).toBe(1);
    const text = allText(r.textByPage);
    expect(text).toContain('FACTURE');
    expect(text).toContain(`Total TTC`);
    expect(text).toContain('Page 1 / 1');
    expect(text).toContain(`SIRET : 123 456 789 00018`);
    expect(text).toContain(`SIREN : 987 654 321`);
    expect(text).toContain('31/01/2026');
    expect(text).not.toMatch(/€\s*EUR|EUR\s*€/);
  });

  it('paginates 60 lines with a repeated header and page numbers', async () => {
    const r = await pdfGenerator.generateWithReport(makeInvoice(60));
    expect(r.pageCount).toBeGreaterThan(1);
    r.textByPage.forEach((texts, i) => {
      expect(texts).toContain('Désignation');
      expect(texts).toContain(`Page ${i + 1} / ${r.pageCount}`);
    });
    const last = r.textByPage[r.pageCount - 1];
    expect(last).toContain('Total TTC');
    const text = allText(r.textByPage);
    expect(text.match(/Total TTC/g)).toHaveLength(1);
    for (let i = 1; i <= 60; i++) expect(text).toContain(`Prestation ${i} `);
    // Every page is a valid PDF page
    const doc = await PDFDocument.load(r.bytes);
    expect(doc.getPageCount()).toBe(r.pageCount);
  });

  it('does not throw on characters outside the font', async () => {
    const inv = makeInvoice(2, { note: 'Étape 1 → étape 2 😀 ✅ 日本語' });
    inv.invoiceLines[0].item.name = 'Mission → audit 😀';
    await expect(pdfGenerator.generate(inv)).resolves.toBeInstanceOf(Uint8Array);
  });

  it('prints legal mentions once, including the VAT exemption', async () => {
    const inv = makeInvoice(3, { franchise: true, note: `Merci de votre confiance.\n${VAT_TEXT}` });
    const text = allText((await pdfGenerator.generateWithReport(inv)).textByPage);
    expect(text.match(/art\. 293 B du CGI/g)).toHaveLength(1);
    expect(text).toContain('Merci de votre confiance.');
    expect(text).toContain('Paiement à 30 jours');
    expect(text).toContain('Pénalités de retard');
    expect(text).toContain('40 €');
    expect(text).toContain('escompte');
    expect(text).toContain('IBAN : FR76 1234 5678 9012 3456 7890 123');
    expect(text).toContain('BIC : ABCDFRPP');
    expect(text).toContain('Jean Dupont EI - SIREN 123 456 789');
  });

  it('dedupes the VAT mention when it is embedded in a longer note line', async () => {
    const inv = makeInvoice(2, { franchise: true, note: `Règlement par virement. ${VAT_TEXT}.` });
    const text = allText((await pdfGenerator.generateWithReport(inv)).textByPage);
    expect(text.match(/293 B/g)).toHaveLength(1);
    expect(text).toContain('Règlement par virement.');
  });

  it('titles a credit note AVOIR and references the original invoice', async () => {
    const text = allText((await pdfGenerator.generateWithReport(makeInvoice(2, { credit: true }))).textByPage);
    expect(text).toContain('AVOIR');
    expect(text).not.toContain('FACTURE\n');
    expect(text).toContain('Avoir sur la facture n° FA-2026-0001 du 15/01/2026');
  });

  it('keeps a long multi-line note above the table', async () => {
    const note = Array.from({ length: 6 }, (_, i) => `Ligne de note ${i + 1}`).join('\n');
    const r = await pdfGenerator.generateWithReport(makeInvoice(3, { note }));
    expect(r.pageCount).toBe(1);
    expect(allText(r.textByPage)).toContain('Ligne de note 6');
  });
});

describe('PDF/A-3 / Factur-X structure', () => {
  it('attaches factur-x.xml with AFRelationship, /AF, XMP, output intent and ID', async () => {
    const bytes = await pdfGenerator.generate(makeInvoice(3));
    const doc = await PDFDocument.load(bytes);
    const catalog = doc.catalog;

    const af = catalog.lookup(PDFName.of('AF'), PDFArray);
    expect(af.size()).toBe(1);
    const spec = af.lookup(0, PDFDict);
    expect(spec.get(PDFName.of('AFRelationship'))?.toString()).toBe('/Alternative');
    expect(spec.get(PDFName.of('EF'))).toBeDefined();

    const raw = Buffer.from(bytes).toString('latin1');
    expect(raw).toContain('factur-x.xml');
    expect(raw).toContain('<pdfaid:part>3</pdfaid:part>');
    expect(raw).toContain('<pdfaid:conformance>B</pdfaid:conformance>');
    expect(raw).toContain('<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>');
    expect(raw).toContain('urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#');
    expect(raw).toContain('/GTS_PDFA1');
    expect(raw).toMatch(/\/ID\s*\[\s*<[0-9A-F]{32}>\s*<[0-9A-F]{32}>\s*\]/);
    expect(raw).not.toMatch(/Conforme Factur-X/);
  });

  it('builds an XMP packet with the fx extension schema', () => {
    const xmp = buildXmpMetadata({
      title: 'T', author: 'A', subject: 'S', keywords: 'K', creatorTool: 'C', producer: 'P',
      date: new Date('2026-01-01T00:00:00Z'), conformanceLevel: 'EN 16931',
    });
    expect(xmp).toContain('<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>');
    expect(xmp).toContain('<pdfaSchema:prefix>fx</pdfaSchema:prefix>');
    expect(xmp).toContain('2026-01-01T00:00:00Z');
  });
});
