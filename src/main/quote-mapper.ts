/**
 * Quote Mapper
 *
 * Pure mapping (no Electron, no database access) from a database quote
 * (amounts in integer cents) to the document model consumed by the PDF
 * generator. The model is the invoice model of the generators: a quote is
 * printed with the same pages, tables and legal mentions as an invoice, but
 * as a plain "DEVIS" PDF (see `documentKind: 'quote'`), never as an e-invoice.
 */

import type {
  Quote as DbQuote,
  QuoteLine as DbQuoteLine,
  Party as DbParty,
} from '../database/types';
import { computeInvoiceTotals } from '../database/repositories/invoice-repository';
import {
  INDIVIDUAL_ENTREPRENEUR_MENTION,
  VAT_FRANCHISE_MENTION,
  isIndividualEntrepreneur,
} from '../database/company-legal';
import {
  CurrencyCode,
  InvoiceTypeCode,
  PaymentMeansCode,
} from '../services/einvoicing/formats/types';
import type {
  Invoice as EN16931Invoice,
  InvoiceLegalMentions,
  InvoiceLine as EN16931InvoiceLine,
  TaxSubtotal,
  TaxCategory,
  UnitCode,
} from '../services/einvoicing/formats/types';
import {
  centsToAmount,
  clean,
  isoDay,
  isPlaceholderCompany,
  isSellerUnderVatFranchise,
  buildSellerLegalLine,
  mapParty,
  resolveTaxCategory,
} from './invoice-mapper';

/** Everything needed to generate the PDF of one quote. */
export interface QuoteExportSource {
  quote: DbQuote;
  lines: DbQuoteLine[];
  seller?: DbParty | null;
  buyer?: DbParty | null;
}

/** A quote ready for `pdfGenerator.generateQuote` */
export interface QuoteDocument {
  model: EN16931Invoice;
  /** YYYY-MM-DD, absent when the quote has no validity date */
  validUntil?: string;
}

/** Raised when the data is not sufficient to produce the quote document. */
export class QuoteMappingError extends Error {
  public readonly errors: string[];

  constructor(errors: string[]) {
    super(errors.join(' '));
    this.name = 'QuoteMappingError';
    this.errors = errors;
  }
}

/** Check the data of a quote; returns the problems in French. */
export function validateQuoteForExport(source: QuoteExportSource): string[] {
  const errors: string[] = [];
  const { quote, lines, seller, buyer } = source;

  if (!clean(quote.quote_number)) errors.push("Le devis n'a pas de numéro.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDay(quote.quote_date))) {
    errors.push('La date du devis est manquante ou invalide.');
  }

  if (!seller || isPlaceholderCompany(seller)) {
    errors.push(
      "Les informations de votre entreprise ne sont pas configurées. Renseignez-les dans Paramètres > Entreprise avant d'exporter un devis."
    );
  } else {
    const missing: string[] = [];
    if (!clean(seller.address_line1)) missing.push('adresse');
    if (!clean(seller.postal_code)) missing.push('code postal');
    if (!clean(seller.city)) missing.push('ville');
    if (!clean(seller.siret) && !clean(seller.siren)) missing.push('SIRET ou SIREN');
    if (missing.length > 0) {
      errors.push(
        `Les informations de votre entreprise sont incomplètes (${missing.join(', ')}). Complétez-les dans Paramètres > Entreprise.`
      );
    }
  }

  if (!buyer) {
    errors.push("Aucun client n'est associé à ce devis.");
  } else {
    const missing: string[] = [];
    if (!clean(buyer.legal_name)) missing.push('nom');
    if (!clean(buyer.postal_code)) missing.push('code postal');
    if (!clean(buyer.city)) missing.push('ville');
    if (missing.length > 0) {
      errors.push(
        `La fiche du client ${clean(buyer.legal_name) ? `« ${clean(buyer.legal_name)} » ` : ''}est incomplète (${missing.join(', ')}). Complétez-la dans Clients.`
      );
    }
  }

  if (!lines || lines.length === 0) {
    errors.push('Le devis ne contient aucune ligne.');
  } else {
    lines.forEach((line, index) => {
      if (!clean(line.item_name)) errors.push(`Ligne ${index + 1} : la désignation est manquante.`);
    });
  }

  return errors;
}

/** Non-blocking remarks (French). */
export function getQuoteExportWarnings(source: QuoteExportSource): string[] {
  const warnings: string[] = [];
  if (!isoDay(source.quote.valid_until)) {
    warnings.push("Ce devis n'a pas de date de validité : la mention « Valable jusqu'au » ne figurera pas sur le PDF.");
  }
  return warnings;
}

/**
 * Map a complete database quote to the generator's model.
 * Totals are recomputed from the lines like for invoices.
 *
 * @throws QuoteMappingError (French messages) when required data is missing
 */
export function mapQuoteToDocument(source: QuoteExportSource): QuoteDocument {
  const errors = validateQuoteForExport(source);
  if (errors.length > 0) throw new QuoteMappingError(errors);

  const { quote, lines } = source;
  const seller = source.seller as DbParty;
  const buyer = source.buyer as DbParty;
  const vatFranchise = isSellerUnderVatFranchise(seller);
  const sortedLines = [...lines].sort((a, b) => a.line_number - b.line_number);

  const categories = sortedLines.map((line) =>
    resolveTaxCategory(line.vat_category, Number(line.vat_rate) || 0, vatFranchise)
  );

  const invoiceLines: EN16931InvoiceLine[] = sortedLines.map((line, index) => {
    const mapped: EN16931InvoiceLine = {
      id: String(index + 1),
      invoicedQuantity: line.quantity,
      unitCode: (clean(line.unit_code) || 'C62') as UnitCode,
      lineExtensionAmount: centsToAmount(line.line_total),
      item: {
        name: clean(line.item_name),
        description: clean(line.item_description) || undefined,
        sellersItemIdentification: clean(line.item_code) || undefined,
        classifiedTaxCategory: categories[index],
      },
      price: { priceAmount: centsToAmount(line.unit_price) },
    };
    if (line.discount_amount && line.discount_amount > 0) {
      mapped.allowanceCharge = [
        {
          chargeIndicator: false,
          allowanceChargeReason: 'Remise',
          amount: centsToAmount(line.discount_amount),
          baseAmount: centsToAmount(line.line_amount),
        },
      ];
    }
    return mapped;
  });

  const totals = computeInvoiceTotals(
    sortedLines.map((line, index) => ({
      line_total: line.line_total,
      vat_rate: Number(line.vat_rate) || 0,
      vat_category: categories[index].id,
    }))
  );
  const taxSubtotals: TaxSubtotal[] = totals.vat_breakdown.map((entry) => {
    const category = categories.find(
      (c) => c.id === entry.vat_category && (c.percent ?? 0) === entry.vat_rate
    ) as TaxCategory;
    return {
      taxableAmount: centsToAmount(entry.taxable_amount),
      taxAmount: centsToAmount(entry.tax_amount),
      taxCategory: { ...category },
    };
  });

  const franchise = categories.some((c) => c.taxExemptionReason === VAT_FRANCHISE_MENTION);

  // Only what belongs on a quote: no late-payment penalties or recovery fee
  const legalMentions: InvoiceLegalMentions = {
    sellerLegalLine: buildSellerLegalLine(seller),
    paymentTermsText: 'Paiement à réception de la facture',
  };
  if (franchise) legalMentions.vatExemptionText = VAT_FRANCHISE_MENTION;
  const iban = clean(seller.iban).replace(/\s+/g, '').toUpperCase();
  if (iban) {
    legalMentions.bankDetails = {
      iban,
      bic: clean(seller.bic).toUpperCase() || undefined,
      accountHolder: clean(seller.legal_name) || undefined,
    };
  }

  const supplierParty = mapParty(seller);
  if (
    isIndividualEntrepreneur(seller.legal_form) &&
    !/(^|[^A-Za-z])EI([^A-Za-z]|$)|entrepreneur individuel/i.test(
      supplierParty.partyLegalEntity.registrationName
    )
  ) {
    supplierParty.partyLegalEntity.registrationName += ` ${INDIVIDUAL_ENTREPRENEUR_MENTION}`;
  }

  const notes = clean(quote.notes);
  const model: EN16931Invoice = {
    customizationId: 'urn:cen.eu:en16931:2017',
    profileId: 'quote',
    id: clean(quote.quote_number),
    issueDate: isoDay(quote.quote_date),
    typeCode: InvoiceTypeCode.INVOICE,
    note: notes || undefined,
    documentCurrencyCode: ((clean(quote.currency) || 'EUR').toUpperCase()) as CurrencyCode,
    buyerReference: clean(quote.customer_reference) || undefined,
    legalMentions,
    accountingSupplierParty: supplierParty,
    accountingCustomerParty: mapParty(buyer),
    paymentTerms: { note: legalMentions.paymentTermsText },
    paymentMeans: [{ paymentMeansCode: PaymentMeansCode.CREDIT_TRANSFER }],
    taxTotal: [{ taxAmount: centsToAmount(totals.tax_amount), taxSubtotals }],
    legalMonetaryTotal: {
      lineExtensionAmount: centsToAmount(totals.subtotal_amount),
      taxExclusiveAmount: centsToAmount(totals.subtotal_amount),
      taxInclusiveAmount: centsToAmount(totals.total_amount),
      payableAmount: centsToAmount(totals.total_amount),
    },
    invoiceLines,
  };

  return { model, validUntil: isoDay(quote.valid_until) || undefined };
}

/** Default file name proposed in the save dialog, e.g. "Devis-QT-2026-001.pdf". */
export function buildQuoteFilename(quoteNumber: string): string {
  const safeNumber =
    clean(quoteNumber)
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sans-numero';
  return `Devis-${safeNumber}.pdf`;
}
