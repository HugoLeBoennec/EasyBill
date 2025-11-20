/**
 * Invoice Data Types for EN16931 Compliance
 *
 * These types represent the semantic data model required for both
 * Factur-X and UBL invoice formats according to EN16931 standard.
 */

/**
 * VAT Category Codes (EN16931-1 Annex)
 */
export enum VATCategory {
  STANDARD = 'S',           // Standard rate
  ZERO_RATED = 'Z',         // Zero rated goods
  EXEMPT = 'E',             // Exempt from tax
  REVERSE_CHARGE = 'AE',    // VAT Reverse Charge
  INTRA_COMMUNITY = 'K',    // Intra-Community supply
  NOT_SUBJECT = 'O',        // Not subject to VAT
  REDUCED = 'AA',           // Reduced rate
}

/**
 * Invoice Type Codes (UNTDID 1001)
 */
export enum InvoiceTypeCode {
  INVOICE = '380',                    // Commercial invoice
  CREDIT_NOTE = '381',                // Credit note
  DEBIT_NOTE = '383',                 // Debit note
  CORRECTED_INVOICE = '384',          // Corrected invoice
  PREPAYMENT_INVOICE = '386',         // Prepayment invoice
  SELF_BILLED_INVOICE = '389',        // Self-billed invoice
}

/**
 * Currency Codes (ISO 4217)
 */
export enum CurrencyCode {
  EUR = 'EUR',
  USD = 'USD',
  GBP = 'GBP',
  CHF = 'CHF',
}

/**
 * Country Codes (ISO 3166-1 alpha-2)
 */
export type CountryCode = string; // e.g., 'FR', 'DE', 'GB', 'US'

/**
 * Payment Means Codes (UNTDID 4461)
 */
export enum PaymentMeansCode {
  CREDIT_TRANSFER = '30',   // Credit transfer
  DEBIT_TRANSFER = '31',    // Debit transfer
  PAYMENT_TO_BANK = '42',   // Payment to bank account
  CARD = '48',              // Bank card
  DIRECT_DEBIT = '49',      // Direct debit
}

/**
 * Unit of Measure Codes (UNECE Recommendation 20)
 */
export enum UnitCode {
  PIECE = 'C62',           // Piece/unit
  HOUR = 'HUR',            // Hour
  DAY = 'DAY',             // Day
  KILOGRAM = 'KGM',        // Kilogram
  METER = 'MTR',           // Meter
  SQUARE_METER = 'MTK',    // Square meter
  LITER = 'LTR',           // Liter
  SET = 'SET',             // Set
  SERVICE_UNIT = 'E48',    // Service unit
}

/**
 * Postal Address
 */
export interface PostalAddress {
  streetName?: string;           // BT-35, BT-50
  additionalStreetName?: string; // BT-36, BT-51
  cityName: string;              // BT-37, BT-52 (mandatory)
  postalZone: string;            // BT-38, BT-53 (mandatory)
  countrySubentity?: string;     // BT-39, BT-54 (state/region)
  countryCode: CountryCode;      // BT-40, BT-55 (mandatory)
}

/**
 * Party Identification
 */
export interface PartyIdentification {
  id: string;                    // e.g., SIREN/SIRET
  schemeId?: string;             // e.g., '0009' for SIRET
}

/**
 * Legal Entity
 */
export interface LegalEntity {
  registrationName: string;      // BT-27, BT-44 (mandatory)
  companyId?: string;            // BT-30, BT-47 (SIREN/SIRET)
  companyIdScheme?: string;      // e.g., '0009' for SIRET
  companyLegalForm?: string;     // BT-33 (e.g., 'SARL', 'SAS')
}

/**
 * Contact Information
 */
export interface Contact {
  name?: string;                 // BT-41, BT-56
  telephone?: string;            // BT-42, BT-57
  email?: string;                // BT-43, BT-58
}

/**
 * Tax Scheme
 */
export interface TaxScheme {
  id: string;                    // e.g., 'VAT'
}

/**
 * Party Tax Scheme
 */
export interface PartyTaxScheme {
  companyId: string;             // BT-31, BT-48 (VAT number)
  taxScheme: TaxScheme;
}

/**
 * Party (Seller or Buyer)
 */
export interface Party {
  endpointId?: string;           // BT-34, BT-49 (Electronic address)
  endpointScheme?: string;       // e.g., 'EM' for email
  partyIdentification?: PartyIdentification[];
  partyName?: string;            // BT-27, BT-44 (trading name)
  postalAddress: PostalAddress;
  partyTaxScheme?: PartyTaxScheme[];
  partyLegalEntity: LegalEntity;
  contact?: Contact;
}

/**
 * Payment Terms
 */
export interface PaymentTerms {
  note?: string;                 // BT-20 (free text payment terms)
}

/**
 * Payment Means
 */
export interface PaymentMeans {
  paymentMeansCode: PaymentMeansCode;  // BT-81 (mandatory)
  paymentId?: string;                   // BT-83 (remittance information)
  payeeFinancialAccount?: {
    id: string;                         // BT-84 (IBAN)
    name?: string;                      // Account holder name
    financialInstitutionBranch?: {
      id?: string;                      // BT-86 (BIC)
    };
  };
}

/**
 * Tax Category with breakdown
 */
export interface TaxCategory {
  id: VATCategory;               // BT-118, BT-151 (mandatory)
  percent?: number;              // BT-119, BT-152 (tax rate percentage)
  taxExemptionReason?: string;   // BT-120, BT-121 (exemption reason)
  taxScheme: TaxScheme;
}

/**
 * Tax Subtotal (per VAT category)
 */
export interface TaxSubtotal {
  taxableAmount: number;         // BT-116 (tax base)
  taxAmount: number;             // BT-117 (tax amount)
  taxCategory: TaxCategory;
}

/**
 * Tax Total
 */
export interface TaxTotal {
  taxAmount: number;             // BT-110 (total tax amount)
  taxSubtotals: TaxSubtotal[];   // BG-23 (breakdown per category)
}

/**
 * Allowance/Charge
 */
export interface AllowanceCharge {
  chargeIndicator: boolean;      // true = charge, false = allowance/discount
  allowanceChargeReason?: string; // BT-97, BT-104
  amount: number;                // BT-92, BT-99 (mandatory)
  baseAmount?: number;           // BT-93, BT-100 (base for percentage)
  multiplierFactorNumeric?: number; // BT-94, BT-101 (percentage/100)
  taxCategory?: TaxCategory;     // BT-95/96, BT-102/103
}

/**
 * Legal Monetary Total
 */
export interface LegalMonetaryTotal {
  lineExtensionAmount: number;   // BT-106 (sum of line net amounts)
  taxExclusiveAmount: number;    // BT-109 (invoice total excl. VAT)
  taxInclusiveAmount: number;    // BT-112 (invoice total incl. VAT)
  allowanceTotalAmount?: number; // BT-107 (sum of document level allowances)
  chargeTotalAmount?: number;    // BT-108 (sum of document level charges)
  prepaidAmount?: number;        // BT-113 (paid in advance)
  payableRoundingAmount?: number; // BT-114 (rounding adjustment)
  payableAmount: number;         // BT-115 (amount due for payment)
}

/**
 * Price Details
 */
export interface Price {
  priceAmount: number;           // BT-146 (item price excluding VAT)
  baseQuantity?: number;         // BT-149 (quantity for unit price)
  allowanceCharge?: AllowanceCharge[]; // BT-147/148 (item price discount)
}

/**
 * Item Classification
 */
export interface ItemClassification {
  itemClassificationCode?: string; // BT-158 (product code)
  listId?: string;                 // Code list identifier
}

/**
 * Item Information
 */
export interface Item {
  description?: string;          // BT-154 (item description)
  name: string;                  // BT-153 (item name, mandatory)
  sellersItemIdentification?: string; // BT-155 (seller's item ID)
  standardItemIdentification?: string; // BT-157 (GTIN, etc.)
  classifiedTaxCategory: TaxCategory;  // BT-151, BT-152 (mandatory)
  additionalItemProperty?: {     // BT-160, BT-161
    name: string;
    value: string;
  }[];
  itemClassification?: ItemClassification[];
}

/**
 * Invoice Line
 */
export interface InvoiceLine {
  id: string;                    // BT-126 (line identifier, mandatory)
  note?: string;                 // BT-127 (line note)
  invoicedQuantity: number;      // BT-129 (mandatory)
  unitCode: UnitCode;            // BT-130 (mandatory)
  lineExtensionAmount: number;   // BT-131 (line net amount, mandatory)
  accountingCost?: string;       // BT-133 (buyer accounting reference)
  invoicePeriod?: {              // BG-26
    startDate?: string;          // BT-134 (ISO 8601)
    endDate?: string;            // BT-135 (ISO 8601)
  };
  orderLineReference?: string;   // BT-132 (purchase order line ref)
  allowanceCharge?: AllowanceCharge[]; // BG-27, BG-28
  item: Item;                    // BG-31 (mandatory)
  price: Price;                  // BG-29 (mandatory)
}

/**
 * Document Reference (e.g., contract, order, etc.)
 */
export interface DocumentReference {
  id: string;                    // Document number
  documentTypeCode?: string;     // UNTDID 1001 code
  documentDescription?: string;  // Description
}

/**
 * Complete Invoice Document (EN16931 Semantic Model)
 */
export interface Invoice {
  // BG-2: Process control
  customizationId: string;       // BT-24 (e.g., 'urn:cen.eu:en16931:2017#compliant#urn:fac-turx.eu:1p0:extended')
  profileId: string;             // BT-23 (e.g., 'urn:fac-turx.eu:1p0:basic')

  // BG-1: Invoice identification
  id: string;                    // BT-1 (invoice number, mandatory)
  issueDate: string;             // BT-2 (ISO 8601 format, mandatory)
  dueDate?: string;              // BT-9 (ISO 8601 format)
  typeCode: InvoiceTypeCode;     // BT-3 (mandatory)
  note?: string;                 // BT-22 (general invoice note)
  documentCurrencyCode: CurrencyCode; // BT-5 (mandatory)
  taxCurrencyCode?: CurrencyCode; // BT-6 (if different from document currency)
  accountingCost?: string;       // BT-19 (buyer accounting reference)
  buyerReference?: string;       // BT-10 (buyer reference, mandatory in some contexts)

  // BG-3: Preceding invoice reference (for credit notes)
  invoiceDocumentReference?: DocumentReference[];

  // BG-24: Additional documents (attachments)
  additionalDocumentReference?: DocumentReference[];

  // BG-13: Delivery information
  delivery?: {
    actualDeliveryDate?: string; // BT-72 (ISO 8601)
    deliveryLocation?: {
      id?: string;               // BT-71 (delivery location identifier)
      address?: PostalAddress;   // BG-15
    };
    deliveryPartyName?: string;  // BT-70
  };

  // BG-4: Seller (mandatory)
  accountingSupplierParty: Party;

  // BG-7: Buyer (mandatory)
  accountingCustomerParty: Party;

  // BG-10: Payee (if different from seller)
  payeeParty?: Party;

  // BG-19: Payment terms
  paymentTerms?: PaymentTerms;

  // BG-16: Payment means
  paymentMeans?: PaymentMeans[];

  // BG-20, BG-21: Document level allowances/charges
  allowanceCharge?: AllowanceCharge[];

  // BG-22: Tax total (mandatory)
  taxTotal: TaxTotal[];

  // BG-22: Legal monetary totals (mandatory)
  legalMonetaryTotal: LegalMonetaryTotal;

  // BG-25: Invoice lines (mandatory, at least one)
  invoiceLines: InvoiceLine[];
}

/**
 * Validation result for invoice data
 */
export interface InvoiceValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Format generation options
 */
export interface FormatGenerationOptions {
  format: 'facturx' | 'ubl' | 'cii';
  facturxProfile?: 'MINIMUM' | 'BASIC' | 'EN16931' | 'EXTENDED';
  prettyPrint?: boolean;          // Format XML with indentation
  includeComments?: boolean;      // Add explanatory XML comments
}
