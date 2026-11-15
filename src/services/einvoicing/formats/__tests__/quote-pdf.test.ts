/** Quote PDF: same generator as invoices, plain "DEVIS" document */
import { PDFDocument, PDFName } from 'pdf-lib';
import { pdfGenerator } from '../pdf-generator';
import { CurrencyCode, Invoice, InvoiceTypeCode, UnitCode, VATCategory } from '../types';

const VAT_TEXT = 'TVA non applicable, art. 293 B du CGI';

function makeQuote(lineCount = 3, franchise = false): Invoice {
  const category = franchise
    ? { id: VATCategory.EXEMPT, percent: 0, taxExemptionReason: VAT_TEXT, taxScheme: { id: 'VAT' } }
    : { id: VATCategory.STANDARD, percent: 20, taxScheme: { id: 'VAT' } };
  const invoiceLines = Array.from({ length: lineCount }, (_, i) => ({
    id: String(i + 1),
    invoicedQuantity: 2,
    unitCode: UnitCode.HOUR,
    lineExtensionAmount: 200,
    item: { name: `Prestation ${i + 1}`, classifiedTaxCategory: category },
    price: { priceAmount: 100 },
  }));
  const ht = 200 * lineCount;
  const vat = franchise ? 0 : ht * 0.2;
  return {
    customizationId: 'urn:cen.eu:en16931:2017',
    profileId: 'quote',
    id: 'QT-2026-0007',
    issueDate: '2026-03-01',
    typeCode: InvoiceTypeCode.INVOICE,
    documentCurrencyCode: CurrencyCode.EUR,
    note: 'Délai : 3 semaines',
    legalMentions: {
      sellerLegalLine: 'Jean Dupont EI - SIREN 123 456 789',
      vatExemptionText: franchise ? VAT_TEXT : undefined,
      paymentTermsText: 'Paiement à réception de la facture',
    },
    accountingSupplierParty: {
      partyLegalEntity: { registrationName: 'Jean Dupont EI', companyId: '12345678900018', companyIdScheme: '0009' },
      postalAddress: { streetName: '1 rue de la Paix', cityName: 'Paris', postalZone: '75002', countryCode: 'FR' },
    },
    accountingCustomerParty: {
      partyLegalEntity: { registrationName: 'Client SARL' },
      postalAddress: { streetName: '5 avenue des Champs', cityName: 'Lyon', postalZone: '69001', countryCode: 'FR' },
    },
    taxTotal: [
      {
        taxAmount: vat,
        taxSubtotals: [{ taxableAmount: ht, taxAmount: vat, taxCategory: category }],
      },
    ],
    legalMonetaryTotal: {
      lineExtensionAmount: ht,
      taxExclusiveAmount: ht,
      taxInclusiveAmount: ht + vat,
      payableAmount: ht + vat,
    },
    invoiceLines,
  } as Invoice;
}

const render = (quote: Invoice, validUntil?: string) =>
  pdfGenerator.generateWithReport(quote, { documentKind: 'quote', validUntil });

describe('quote PDF', () => {
  it('is titled DEVIS with validity date, totals and signature block', async () => {
    const report = await render(makeQuote(), '2026-03-31');
    const text = report.textByPage.flat();
    expect(report.pageCount).toBe(1);
    expect(text).toContain('DEVIS');
    expect(text).not.toContain('FACTURE');
    expect(text.some((t) => t.includes('N° QT-2026-0007'))).toBe(true);
    expect(text).toContain("Valable jusqu'au 31/03/2026");
    expect(text).toContain('Total TTC');
    expect(text).toContain('Bon pour accord');
    expect(text).toContain('Signature :');
    expect(text).toContain('Date :');
    expect(text).toContain('Délai : 3 semaines');
    expect(text).not.toContain('Net à payer');
  });

  it('prints the franchise mention', async () => {
    const text = (await render(makeQuote(3, true), '2026-03-31')).textByPage.flat();
    expect(text).toContain(VAT_TEXT);
  });

  it('flows 60 lines over several pages, signature after the totals on the last page', async () => {
    const report = await render(makeQuote(60), '2026-03-31');
    expect(report.pageCount).toBeGreaterThan(1);
    const last = report.textByPage[report.pageCount - 1];
    expect(last).toContain('Bon pour accord');
    expect(last).toContain('Total TTC');
    expect(report.textByPage.slice(0, -1).flat()).not.toContain('Bon pour accord');
  });

  it('is a plain PDF: no attachment, no Factur-X', async () => {
    const { bytes } = await render(makeQuote(), '2026-03-31');
    const doc = await PDFDocument.load(bytes);
    const catalog = doc.catalog;
    expect(catalog.get(PDFName.of('AF'))).toBeUndefined();
    expect(catalog.get(PDFName.of('Names'))).toBeUndefined();
    expect(catalog.get(PDFName.of('Metadata'))).toBeUndefined();
    expect(Buffer.from(bytes).toString('latin1')).not.toContain('factur-x.xml');
    expect(doc.getTitle()).toBe('DEVIS QT-2026-0007');
  });

  it('omits the validity line when there is none', async () => {
    const text = (await render(makeQuote())).textByPage.flat();
    expect(text.some((t) => t.includes("Valable jusqu'au"))).toBe(false);
  });
});
