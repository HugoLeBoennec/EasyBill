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
  DEFAULT_EARLY_PAYMENT_DISCOUNT_TEXT,
  DEFAULT_LATE_PENALTY_TEXT,
  INDIVIDUAL_ENTREPRENEUR_MENTION,
  RECOVERY_FEE_TEXT,
  VAT_FRANCHISE_MENTION,
  formatEuroAmount,
  formatIban,
  formatSirenOrSiret,
  hasShareCapital,
  isIndividualEntrepreneur,
} from '../database/company-legal';
import {
  CurrencyCode,
  InvoiceTypeCode,
  PaymentMeansCode,
  VATCategory,
} from '../services/einvoicing/formats/types';
import type {
  Contact,
  Invoice as EN16931Invoice,
  InvoiceLegalMentions,
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

// Legal mention required when the seller benefits from the VAT franchise
export { VAT_FRANCHISE_MENTION };

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
 * Whether the seller is under the VAT franchise (art. 293 B du CGI).
 *
 * The explicit `vat_franchise` flag of the company profile decides. Rows that
 * do not carry the flag at all (data loaded before migration 003) fall back
 * to the former rule: no VAT number means franchise.
 */
export function isSellerUnderVatFranchise(seller: DbParty | null | undefined): boolean {
  if (!seller) return false;
  if (seller.vat_franchise === undefined || seller.vat_franchise === null) {
    return clean(seller.vat_number) === '';
  }
  return Number(seller.vat_franchise) === 1;
}

/**
 * Points of the seller profile that should be completed but do not prevent
 * the export (French messages). Blocking problems are reported by
 * `validateInvoiceForExport`.
 */
export function getInvoiceExportWarnings(source: InvoiceExportSource): string[] {
  const warnings: string[] = [];
  const { seller, lines } = source;
  if (!seller || isPlaceholderCompany(seller)) return warnings;

  const franchise = isSellerUnderVatFranchise(seller);
  const individual = isIndividualEntrepreneur(seller.legal_form);

  if (!clean(seller.legal_form)) {
    warnings.push(
      "La forme juridique de votre entreprise n'est pas renseignée (elle doit figurer sur vos factures)."
    );
  } else if (hasShareCapital(seller.legal_form) && !seller.share_capital) {
    warnings.push(
      "Le capital social n'est pas renseigné : il est obligatoire sur les factures d'une société."
    );
  }
  if (!individual && clean(seller.legal_form) && !clean(seller.registration_city)) {
    warnings.push(
      "L'immatriculation (RCS ou RM et ville) n'est pas renseignée dans les mentions légales."
    );
  }
  if (clean(seller.siren) && !clean(seller.siret)) {
    warnings.push('Le SIRET de votre entreprise est manquant (seul le SIREN est renseigné).');
  }
  if (!franchise && !clean(seller.vat_number)) {
    warnings.push(
      "Votre numéro de TVA intracommunautaire n'est pas renseigné alors que vous n'êtes pas en franchise en base de TVA."
    );
  }
  if (franchise && (lines || []).some((line) => (Number(line.vat_rate) || 0) > 0)) {
    warnings.push(
      'Votre entreprise est en franchise en base de TVA mais cette facture comporte des lignes avec TVA.'
    );
  }
  if (!clean(seller.iban)) {
    warnings.push(
      "Aucun IBAN n'est renseigné : les coordonnées bancaires ne figureront pas sur la facture."
    );
  }

  return warnings.map((warning) => `${warning} Complétez Paramètres > Entreprise.`);
}

/**
 * Identity line printed at the bottom of the invoice, e.g.
 * "SAS au capital de 10 000 € – RCS Paris 732 829 320 – APE 6201Z" or
 * "Entrepreneur individuel (EI) – SIRET 732 829 320 00074 – APE 6201Z".
 */
export function buildSellerLegalLine(seller: DbParty): string | undefined {
  const parts: string[] = [];
  const legalForm = clean(seller.legal_form);
  const siret = clean(seller.siret).replace(/\s+/g, '');
  const siren = clean(seller.siren).replace(/\s+/g, '') || siret.slice(0, 9);
  const capital = Number(seller.share_capital) || 0;

  if (isIndividualEntrepreneur(legalForm)) {
    parts.push(`Entrepreneur individuel (${INDIVIDUAL_ENTREPRENEUR_MENTION})`);
  } else if (capital > 0 && hasShareCapital(legalForm)) {
    parts.push(
      legalForm
        ? `${legalForm} au capital de ${formatEuroAmount(capital)}`
        : `Capital social de ${formatEuroAmount(capital)}`
    );
  } else if (legalForm) {
    parts.push(legalForm);
  }

  const registrationType = clean(seller.registration_type).toUpperCase();
  const registrationCity = clean(seller.registration_city);
  if ((registrationType === 'RCS' || registrationType === 'RM') && registrationCity && siren) {
    parts.push(`${registrationType} ${registrationCity} ${formatSirenOrSiret(siren)}`);
  } else if (siret) {
    parts.push(`SIRET ${formatSirenOrSiret(siret)}`);
  } else if (siren) {
    parts.push(`SIREN ${formatSirenOrSiret(siren)}`);
  }

  const ape = clean(seller.ape_code).toUpperCase();
  if (ape) parts.push(`APE ${ape}`);

  return parts.length > 0 ? parts.join(' – ') : undefined;
}

/**
 * Ready-to-print French legal mentions of an invoice, from the seller
 * profile (defaults apply when a text was never set).
 */
export function buildLegalMentions(
  seller: DbParty,
  options: { vatFranchiseApplied: boolean; paymentTermsText?: string }
): InvoiceLegalMentions {
  const mentions: InvoiceLegalMentions = {
    sellerLegalLine: buildSellerLegalLine(seller),
    paymentTermsText: options.paymentTermsText,
    latePenaltyText: clean(seller.late_penalty_text) || DEFAULT_LATE_PENALTY_TEXT,
    earlyPaymentDiscountText:
      clean(seller.early_payment_discount_text) || DEFAULT_EARLY_PAYMENT_DISCOUNT_TEXT,
  };
  if (options.vatFranchiseApplied) mentions.vatExemptionText = VAT_FRANCHISE_MENTION;
  // Enabled unless explicitly switched off
  if (seller.recovery_fee_enabled === undefined || seller.recovery_fee_enabled === null
    || Number(seller.recovery_fee_enabled) !== 0) {
    mentions.recoveryFeeText = RECOVERY_FEE_TEXT;
  }
  const iban = clean(seller.iban).replace(/\s+/g, '').toUpperCase();
  if (iban) {
    mentions.bankDetails = {
      iban: formatIban(iban),
      bic: clean(seller.bic).toUpperCase() || undefined,
      accountHolder: clean(seller.legal_name) || undefined,
    };
  }
  return mentions;
}

/**
 * EN16931 VAT category of a line.
 * A positive rate is always the standard category. With a 0 % rate the
 * category stored in the database is kept when it is a valid zero-rate
 * category, otherwise the line is treated as exempt. Under the VAT franchise
 * every 0 % line that is not an explicit reverse charge / intra-community /
 * out-of-scope operation is exempt with the art. 293 B mention.
 */
function resolveTaxCategory(
  dbCategory: string | undefined,
  rate: number,
  vatFranchise: boolean
): TaxCategory {
  const taxScheme = { id: 'VAT' };
  if (rate > 0) {
    return { id: VATCategory.STANDARD, percent: rate, taxScheme };
  }

  let id = (
    dbCategory && ZERO_RATE_CATEGORIES.includes(dbCategory) ? dbCategory : VATCategory.EXEMPT
  ) as VATCategory;
  if (vatFranchise && id === VATCategory.ZERO_RATED) id = VATCategory.EXEMPT;

  let taxExemptionReason: string | undefined;
  switch (id) {
    case VATCategory.EXEMPT:
      taxExemptionReason = vatFranchise ? VAT_FRANCHISE_MENTION : 'Exonération de TVA';
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

  // Individual entrepreneurs must have "EI" next to their name (since 2022)
  const supplierParty = mapParty(seller);
  if (
    isIndividualEntrepreneur(seller.legal_form) &&
    !/(^|[^A-Za-z])EI([^A-Za-z]|$)|entrepreneur individuel/i.test(
      supplierParty.partyLegalEntity.registrationName
    )
  ) {
    supplierParty.partyLegalEntity.registrationName += ` ${INDIVIDUAL_ENTREPRENEUR_MENTION}`;
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

    legalMentions: buildLegalMentions(seller, {
      vatFranchiseApplied: franchise,
      paymentTermsText: paymentTermsNote,
    }),

    accountingSupplierParty: supplierParty,
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
