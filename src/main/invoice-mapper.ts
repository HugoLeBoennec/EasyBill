/**
 * Invoice Mapper
 *
 * Pure mapping (no Electron, no database access) from the database model
 * (amounts in integer cents) to the EN16931 semantic model consumed by the
 * invoice generators (amounts in currency units, 2 decimals).
 */

import type {
  Invoice as DbInvoice,
  InvoiceLine as DbInvoiceLine,
  Party as DbParty,
} from '../database/types';
import { computeInvoiceTotals } from '../database/repositories/invoice-repository';
import {
  CurrencyCode,
  InvoiceTypeCode,
  PaymentMeansCode,
  VATCategory,
} from '../services/einvoicing/formats/types';
import type {
  Contact,
  Invoice as EN16931Invoice,
  InvoiceLine as EN16931InvoiceLine,
  Party as EN16931Party,
  TaxCategory,
  TaxSubtotal,
  UnitCode,
} from '../services/einvoicing/formats/types';

/** Formats supported by the export (same names as the generator orchestrator). */
export type InvoiceExportFormat = 'facturx-pdf' | 'facturx-xml' | 'ubl';

export const INVOICE_EXPORT_FORMATS: readonly InvoiceExportFormat[] = [
  'facturx-pdf',
  'facturx-xml',
  'ubl',
];

/** Everything needed to generate a document for one invoice. */
export interface InvoiceExportSource {
  invoice: DbInvoice;
  lines: DbInvoiceLine[];
  seller?: DbParty | null;
  buyer?: DbParty | null;
}

/** Raised when the data is not sufficient to produce a valid invoice document. */
export class InvoiceMappingError extends Error {
  public readonly errors: string[];

  constructor(errors: string[]) {
    super(errors.join(' '));
    this.name = 'InvoiceMappingError';
    this.errors = errors;
  }
}

/** Name of the placeholder company row inserted by the initial schema. */
export const COMPANY_PLACEHOLDER_NAME = 'Your Company Name';

/** Legal mention required when the seller benefits from the VAT franchise. */
export const VAT_FRANCHISE_MENTION = 'TVA non applicable, art. 293 B du CGI';

const EN16931_CUSTOMIZATION_ID = 'urn:cen.eu:en16931:2017';
const DEFAULT_PROFILE_ID = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

const INVOICE_TYPE_CODES: Record<string, InvoiceTypeCode> = {
  invoice: InvoiceTypeCode.INVOICE,
  credit_note: InvoiceTypeCode.CREDIT_NOTE,
  debit_note: InvoiceTypeCode.DEBIT_NOTE,
};

const ZERO_RATE_CATEGORIES: readonly string[] = [
  VATCategory.ZERO_RATED,
  VATCategory.EXEMPT,
  VATCategory.REVERSE_CHARGE,
  VATCategory.INTRA_COMMUNITY,
  VATCategory.NOT_SUBJECT,
];

/** Integer cents -> currency units with exactly 2 decimals. */
export function centsToAmount(cents: number | null | undefined): number {
  return Math.round(Number(cents) || 0) / 100;
}

const clean = (value: string | null | undefined): string => (value ?? '').trim();

const isoDay = (value: string | null | undefined): string => clean(value).slice(0, 10);

const frenchDate = (iso: string): string => iso.split('-').reverse().join('/');

function isPlaceholderCompany(party: DbParty): boolean {
  return clean(party.legal_name) === '' || clean(party.legal_name) === COMPANY_PLACEHOLDER_NAME;
}

/**
 * Check that the data is complete enough to produce a legal invoice document.
 * Returns the list of problems, in French, ready to be shown to the user.
 */
export function validateInvoiceForExport(source: InvoiceExportSource): string[] {
  const errors: string[] = [];
  const { invoice, lines, seller, buyer } = source;

  if (!clean(invoice.invoice_number)) {
    errors.push("La facture n'a pas de numéro.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDay(invoice.invoice_date))) {
    errors.push("La date de la facture est manquante ou invalide.");
  }

  if (!seller || isPlaceholderCompany(seller)) {
    errors.push(
      "Les informations de votre entreprise ne sont pas configurées. Renseignez-les dans Paramètres > Entreprise avant d'exporter une facture."
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
    errors.push("Aucun client n'est associé à cette facture.");
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
    errors.push('La facture ne contient aucune ligne.');
  } else {
    lines.forEach((line, index) => {
      if (!clean(line.item_name)) {
        errors.push(`Ligne ${index + 1} : la désignation est manquante.`);
      }
    });
  }

  return errors;
}

/**
 * EN16931 VAT category of a line.
 * A positive rate is always the standard category. With a 0 % rate the
 * category stored in the database is kept when it is a valid zero-rate
 * category, otherwise the line is treated as exempt.
 */
function resolveTaxCategory(
  dbCategory: string | undefined,
  rate: number,
  sellerHasVatNumber: boolean
): TaxCategory {
  const taxScheme = { id: 'VAT' };
  if (rate > 0) {
    return { id: VATCategory.STANDARD, percent: rate, taxScheme };
  }

  const id = (
    dbCategory && ZERO_RATE_CATEGORIES.includes(dbCategory) ? dbCategory : VATCategory.EXEMPT
  ) as VATCategory;

  let taxExemptionReason: string | undefined;
  switch (id) {
    case VATCategory.EXEMPT:
      taxExemptionReason = sellerHasVatNumber ? 'Exonération de TVA' : VAT_FRANCHISE_MENTION;
      break;
    case VATCategory.REVERSE_CHARGE:
      taxExemptionReason = 'Autoliquidation de la TVA par le preneur';
      break;
    case VATCategory.INTRA_COMMUNITY:
      taxExemptionReason = 'Livraison intracommunautaire exonérée, art. 262 ter I du CGI';
      break;
    case VATCategory.NOT_SUBJECT:
      taxExemptionReason = 'Opération non soumise à la TVA';
      break;
    default:
      taxExemptionReason = undefined;
  }

  // "Not subject to VAT" carries no rate at all (EN16931 BR-O-05)
  const percent = id === VATCategory.NOT_SUBJECT ? undefined : 0;
  return { id, percent, taxExemptionReason, taxScheme };
}

/** Database party -> EN16931 party. */
export function mapParty(party: DbParty): EN16931Party {
  const siret = clean(party.siret).replace(/\s+/g, '');
  const siren = clean(party.siren).replace(/\s+/g, '') || siret.slice(0, 9);
  const vatNumber = clean(party.vat_number).replace(/\s+/g, '');
  const email = clean(party.email);

  const contact: Contact = {};
  if (clean(party.contact_name)) contact.name = clean(party.contact_name);
  if (clean(party.phone)) contact.telephone = clean(party.phone);
  if (email) contact.email = email;

  const mapped: EN16931Party = {
    postalAddress: {
      streetName: clean(party.address_line1) || undefined,
      additionalStreetName: clean(party.address_line2) || undefined,
      cityName: clean(party.city),
      postalZone: clean(party.postal_code),
      countrySubentity: clean(party.state_region) || undefined,
      countryCode: (clean(party.country_code) || 'FR').toUpperCase(),
    },
    partyLegalEntity: {
      registrationName: clean(party.legal_name),
      companyLegalForm: clean(party.legal_form) || undefined,
    },
  };

  // Legal identifier: SIRET (ISO 6523 ICD 0009) when known, otherwise SIREN (0002)
  if (siret) {
    mapped.partyLegalEntity.companyId = siret;
    mapped.partyLegalEntity.companyIdScheme = '0009';
  } else if (siren) {
    mapped.partyLegalEntity.companyId = siren;
    mapped.partyLegalEntity.companyIdScheme = '0002';
  }

  if (clean(party.trading_name)) mapped.partyName = clean(party.trading_name);

  if (vatNumber) {
    mapped.partyTaxScheme = [{ companyId: vatNumber, taxScheme: { id: 'VAT' } }];
  }

  if (clean(party.electronic_address)) {
    mapped.endpointId = clean(party.electronic_address);
    mapped.endpointScheme = clean(party.electronic_address_scheme) || undefined;
  } else if (email) {
    mapped.endpointId = email;
    mapped.endpointScheme = 'EM';
  }

  if (Object.keys(contact).length > 0) mapped.contact = contact;

  return mapped;
}

/**
 * Map a complete database invoice to the generators' input model.
 *
 * Totals are derived from the lines with the same function the repository
 * uses when it saves / finalizes an invoice, so the generated document is
 * always internally consistent (sum of lines = HT, VAT per rate, TTC).
 *
 * @throws InvoiceMappingError (French messages) when required data is missing
 */
export function mapInvoiceToEN16931(source: InvoiceExportSource): EN16931Invoice {
  const errors = validateInvoiceForExport(source);
  if (errors.length > 0) {
    throw new InvoiceMappingError(errors);
  }

  const { invoice, lines } = source;
  const seller = source.seller as DbParty;
  const buyer = source.buyer as DbParty;
  const sellerHasVatNumber = clean(seller.vat_number) !== '';

  const sortedLines = [...lines].sort((a, b) => a.line_number - b.line_number);

  const categories = sortedLines.map((line) =>
    resolveTaxCategory(line.vat_category, Number(line.vat_rate) || 0, sellerHasVatNumber)
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
        standardItemIdentification: clean(line.item_gtin) || undefined,
        classifiedTaxCategory: categories[index],
      },
      price: {
        priceAmount: centsToAmount(line.unit_price),
      },
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

    if (line.period_start || line.period_end) {
      mapped.invoicePeriod = {
        startDate: isoDay(line.period_start) || undefined,
        endDate: isoDay(line.period_end) || undefined,
      };
    }

    return mapped;
  });

  // Totals (cents) grouped by resolved VAT category / rate
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

  const paidCents = Math.max(0, Math.min(invoice.paid_amount || 0, totals.total_amount));

  // Notes: user notes + mandatory VAT franchise mention when it applies
  const noteParts: string[] = [];
  if (clean(invoice.notes)) noteParts.push(clean(invoice.notes));
  const franchise = categories.some((c) => c.taxExemptionReason === VAT_FRANCHISE_MENTION);
  if (franchise && !clean(invoice.notes).toLowerCase().includes('293 b')) {
    noteParts.push(VAT_FRANCHISE_MENTION);
  }

  const issueDate = isoDay(invoice.invoice_date);
  const dueDate = isoDay(invoice.due_date) || undefined;

  let paymentTermsNote: string;
  if (dueDate && dueDate > issueDate) {
    const days = invoice.payment_terms_days;
    paymentTermsNote = days
      ? `Paiement à ${days} jours, échéance le ${frenchDate(dueDate)}`
      : `Paiement au plus tard le ${frenchDate(dueDate)}`;
  } else {
    paymentTermsNote = 'Paiement à réception de la facture';
  }

  const currency = (clean(invoice.currency) || 'EUR').toUpperCase() as CurrencyCode;

  const mapped: EN16931Invoice = {
    customizationId: EN16931_CUSTOMIZATION_ID,
    profileId: DEFAULT_PROFILE_ID,

    id: clean(invoice.invoice_number),
    issueDate,
    dueDate,
    typeCode: INVOICE_TYPE_CODES[invoice.invoice_type] || InvoiceTypeCode.INVOICE,
    note: noteParts.length > 0 ? noteParts.join('\n') : undefined,
    documentCurrencyCode: currency,
    buyerReference: clean(invoice.buyer_reference) || undefined,

    accountingSupplierParty: mapParty(seller),
    accountingCustomerParty: mapParty(buyer),

    paymentTerms: { note: paymentTermsNote },
    paymentMeans: [
      {
        paymentMeansCode: PaymentMeansCode.CREDIT_TRANSFER,
        paymentId: clean(invoice.invoice_number),
      },
    ],

    taxTotal: [
      {
        taxAmount: centsToAmount(totals.tax_amount),
        taxSubtotals,
      },
    ],

    legalMonetaryTotal: {
      lineExtensionAmount: centsToAmount(totals.subtotal_amount),
      taxExclusiveAmount: centsToAmount(totals.subtotal_amount),
      taxInclusiveAmount: centsToAmount(totals.total_amount),
      prepaidAmount: paidCents > 0 ? centsToAmount(paidCents) : undefined,
      payableAmount: centsToAmount(totals.total_amount - paidCents),
    },

    invoiceLines,
  };

  if (clean(invoice.purchase_order_ref)) {
    mapped.additionalDocumentReference = [
      { id: clean(invoice.purchase_order_ref), documentDescription: 'Bon de commande' },
    ];
  }

  return mapped;
}

/** Default file name proposed in the save dialog, e.g. "Facture-INV-2026-001.pdf". */
export function buildExportFilename(invoiceNumber: string, format: InvoiceExportFormat): string {
  const safeNumber =
    clean(invoiceNumber)
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sans-numero';

  switch (format) {
    case 'facturx-pdf':
      return `Facture-${safeNumber}.pdf`;
    case 'facturx-xml':
      return `Facture-${safeNumber}-facturx.xml`;
    case 'ubl':
      return `Facture-${safeNumber}-ubl.xml`;
    default:
      return `Facture-${safeNumber}`;
  }
}
