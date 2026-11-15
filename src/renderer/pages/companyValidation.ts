/**
 * Validation of the seller ("my company") profile form.
 *
 * Pure functions, no React / Electron dependency.
 */

import {
  validateSIREN,
  validateSIRET,
} from '../../services/einvoicing/validation';
import type { Party, UpdateRecord } from '../../database/types';
import {
  DEFAULT_EARLY_PAYMENT_DISCOUNT_TEXT,
  DEFAULT_LATE_PENALTY_TEXT,
  DEFAULT_PAYMENT_TERMS_DAYS,
  formatIban,
  hasShareCapital,
} from '../../database/company-legal';

/** Text fields, all kept as strings while editing. */
export interface CompanyTextFields {
  legal_name: string;
  trading_name: string;
  legal_form: string;
  siret: string;
  siren: string;
  vat_number: string;
  address_line1: string;
  address_line2: string;
  postal_code: string;
  city: string;
  country_code: string;
  contact_name: string;
  email: string;
  phone: string;
  website: string;
  // Legal mentions
  share_capital: string;
  /** '', 'RCS' or 'RM' */
  registration_type: string;
  registration_city: string;
  ape_code: string;
  // Bank details
  iban: string;
  bic: string;
  // Payment conditions
  default_payment_terms_days: string;
  late_penalty_text: string;
  early_payment_discount_text: string;
}

/** The whole form: text fields plus the two switches. */
export interface CompanyForm extends CompanyTextFields {
  /** VAT franchise (art. 293 B du CGI) */
  vat_franchise: boolean;
  /** Print the 40 EUR fixed recovery fee mention */
  recovery_fee_enabled: boolean;
}

export type CompanyErrors = Partial<Record<keyof CompanyForm, string>>;

export const EMPTY_COMPANY_FORM: CompanyForm = {
  legal_name: '',
  trading_name: '',
  legal_form: '',
  siret: '',
  siren: '',
  vat_number: '',
  address_line1: '',
  address_line2: '',
  postal_code: '',
  city: '',
  country_code: 'FR',
  contact_name: '',
  email: '',
  phone: '',
  website: '',
  share_capital: '',
  registration_type: '',
  registration_city: '',
  ape_code: '',
  iban: '',
  bic: '',
  default_payment_terms_days: String(DEFAULT_PAYMENT_TERMS_DAYS),
  late_penalty_text: DEFAULT_LATE_PENALTY_TEXT,
  early_payment_discount_text: DEFAULT_EARLY_PAYMENT_DISCOUNT_TEXT,
  vat_franchise: false,
  recovery_fee_enabled: true,
};

/** Name of the placeholder company row inserted by the database schema. */
const PLACEHOLDER_LEGAL_NAME = 'Your Company Name';

/**
 * The schema seeds an empty company party so that one always exists.
 * Until the user saves real values it does not count as a profile.
 */
export function isPlaceholderCompany(party: Party | undefined | null): boolean {
  return (
    !party ||
    (party.legal_name === PLACEHOLDER_LEGAL_NAME &&
      !party.siret &&
      !party.address_line1)
  );
}

const digitsOnly = (value: string) => value.replace(/[^\d]/g, '');

/** Remove spaces, dots and dashes and upper-case (VAT numbers, country codes). */
export const compact = (value: string) =>
  value.replace(/[\s.\-_]/g, '').toUpperCase();

/**
 * French intra-community VAT number from a SIREN:
 * "FR" + key + SIREN, key = (12 + 3 × (SIREN mod 97)) mod 97.
 * Returns null when the SIREN is not valid.
 */
export function computeFrenchVatNumber(siren: string): string | null {
  const check = validateSIREN(siren);
  if (!check.valid || !check.normalized) return null;
  const key = (12 + 3 * (Number(check.normalized) % 97)) % 97;
  return `FR${String(key).padStart(2, '0')}${check.normalized}`;
}

/**
 * SIREN to store for a given SIRET input: its first 9 digits once they are
 * all typed, otherwise nothing.
 */
export function sirenFromSiret(siret: string): string {
  const digits = digitsOnly(siret);
  return digits.length >= 9 ? digits.substring(0, 9) : '';
}

/** Error message for a VAT number, or undefined when acceptable. */
export function validateVatNumber(
  vatNumber: string,
  siren: string
): string | undefined {
  const vat = compact(vatNumber);
  if (!vat) return undefined;

  if (!/^[A-Z]{2}[A-Z0-9]{2,12}$/.test(vat)) {
    return 'Format invalide : code pays sur 2 lettres suivi du numéro (ex. FR12345678901).';
  }
  if (!vat.startsWith('FR')) return undefined;

  // France: FR + 2-character key + SIREN
  if (!/^FR[0-9A-HJ-NP-Z]{2}\d{9}$/.test(vat)) {
    return 'Un numéro de TVA français comporte FR, une clé de 2 caractères et le SIREN (9 chiffres).';
  }
  const vatSiren = vat.substring(4);
  if (siren && vatSiren !== siren) {
    return 'Le numéro de TVA ne correspond pas au SIREN de votre SIRET.';
  }
  // The key can only be verified when it is numeric (the usual case)
  const key = vat.substring(2, 4);
  if (/^\d{2}$/.test(key) && computeFrenchVatNumber(vatSiren) !== vat) {
    return 'Clé de contrôle du numéro de TVA incorrecte.';
  }
  return undefined;
}

/** Error message for an IBAN, or undefined when acceptable (ISO 13616, mod 97). */
export function validateIban(value: string): string | undefined {
  const iban = compact(value);
  if (!iban) return undefined;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) {
    return 'Format invalide : code pays, clé de 2 chiffres puis le numéro de compte (ex. FR76 3000 6000 0112 3456 7890 189).';
  }
  if (iban.startsWith('FR') && iban.length !== 27) {
    return `Un IBAN français comporte 27 caractères (${iban.length} saisis).`;
  }
  // Move the 4 first characters to the end, letters -> 10..35, then mod 97
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  if (remainder !== 1) {
    return 'IBAN invalide : la clé de contrôle ne correspond pas, vérifiez la saisie.';
  }
  return undefined;
}

/** Error message for a BIC / SWIFT code, or undefined when acceptable. */
export function validateBic(value: string): string | undefined {
  const bic = compact(value);
  if (!bic) return undefined;
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) {
    return 'BIC invalide : 8 ou 11 caractères (ex. BNPAFRPP ou BNPAFRPPXXX).';
  }
  return undefined;
}

/** Error message for an APE / NAF code, or undefined when acceptable. */
export function validateApeCode(value: string): string | undefined {
  const ape = compact(value);
  if (!ape) return undefined;
  if (!/^\d{4}[A-Z]$/.test(ape)) {
    return 'Code APE invalide : 4 chiffres suivis d\'une lettre (ex. 6201Z).';
  }
  return undefined;
}

/**
 * Amount typed the French way ("10 000", "1 500,50", "1000.5") as a number.
 * Returns null when empty and NaN when it is not a positive amount.
 */
export function parseAmount(value: string): number | null {
  const cleaned = value.replace(/[\s\u00a0\u202f€]/g, '').replace(',', '.');
  if (!cleaned) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return NaN;
  return Number(cleaned);
}

/** Validate the whole form. An empty object means the form is valid. */
export function validateCompanyForm(form: CompanyForm): CompanyErrors {
  const errors: CompanyErrors = {};
  const isFrench = compact(form.country_code) === 'FR';

  if (!form.legal_name.trim()) {
    errors.legal_name = 'La dénomination (ou vos nom et prénom) est obligatoire.';
  }

  const siret = form.siret.trim();
  if (!siret) {
    if (isFrench) {
      errors.siret = 'Le SIRET est obligatoire sur les factures.';
    }
  } else {
    const digits = digitsOnly(siret);
    const check = validateSIRET(siret);
    if (!check.valid) {
      if (!/^[\d\s.\-_]+$/.test(siret)) {
        errors.siret = 'Le SIRET ne contient que des chiffres.';
      } else if (digits.length !== 14) {
        errors.siret = `Le SIRET comporte 14 chiffres (${digits.length} saisi${
          digits.length > 1 ? 's' : ''
        }).`;
      } else {
        errors.siret =
          'SIRET invalide : la clé de contrôle ne correspond pas, vérifiez la saisie.';
      }
    }
  }

  const vatError = validateVatNumber(form.vat_number, sirenFromSiret(siret));
  if (vatError) errors.vat_number = vatError;
  // A seller subject to VAT must print its VAT number on invoices
  if (!errors.vat_number && isFrench && !form.vat_franchise && !form.vat_number.trim()) {
    errors.vat_number =
      'Le numéro de TVA est obligatoire, sauf si vous cochez la franchise en base de TVA.';
  }

  const capital = parseAmount(form.share_capital);
  if (capital !== null && (Number.isNaN(capital) || capital <= 0)) {
    errors.share_capital = 'Montant invalide : saisissez un nombre positif (ex. 10 000).';
  }
  if (form.registration_type && !['RCS', 'RM'].includes(form.registration_type)) {
    errors.registration_type = 'Choisissez RCS ou RM.';
  }
  const apeError = validateApeCode(form.ape_code);
  if (apeError) errors.ape_code = apeError;
  const ibanError = validateIban(form.iban);
  if (ibanError) errors.iban = ibanError;
  const bicError = validateBic(form.bic);
  if (bicError) errors.bic = bicError;

  const days = form.default_payment_terms_days.trim();
  if (days && (!/^\d{1,3}$/.test(days) || Number(days) > 60)) {
    // Art. L441-10 du Code de commerce: 60 days at most from the invoice date
    errors.default_payment_terms_days =
      'Délai invalide : un nombre de jours entre 0 et 60 (plafond légal).';
  }

  if (!form.address_line1.trim()) {
    errors.address_line1 = "L'adresse est obligatoire sur les factures.";
  }
  const postalCode = form.postal_code.trim();
  if (!postalCode) {
    errors.postal_code = 'Le code postal est obligatoire.';
  } else if (isFrench && !/^\d{5}$/.test(postalCode)) {
    errors.postal_code = 'Le code postal comporte 5 chiffres.';
  }
  if (!form.city.trim()) {
    errors.city = 'La ville est obligatoire.';
  }
  if (!/^[A-Z]{2}$/.test(compact(form.country_code))) {
    errors.country_code = 'Code pays sur 2 lettres (ex. FR).';
  }

  const email = form.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Adresse e-mail invalide.';
  }
  const phone = form.phone.trim();
  if (phone && !/^\+?[\d\s.\-()]{6,20}$/.test(phone)) {
    errors.phone = 'Numéro de téléphone invalide.';
  }

  return errors;
}

/** Values of a stored party, as editable strings. */
export function formFromParty(party: Party): CompanyForm {
  return {
    legal_name: isPlaceholderCompany(party) ? '' : party.legal_name ?? '',
    trading_name: party.trading_name ?? '',
    legal_form: party.legal_form ?? '',
    siret: party.siret ?? '',
    siren: party.siren ?? '',
    vat_number: party.vat_number ?? '',
    address_line1: party.address_line1 ?? '',
    address_line2: party.address_line2 ?? '',
    postal_code: party.postal_code ?? '',
    city: party.city ?? '',
    country_code: party.country_code || 'FR',
    contact_name: party.contact_name ?? '',
    email: party.email ?? '',
    phone: party.phone ?? '',
    website: party.website ?? '',
    share_capital:
      party.share_capital == null ? '' : String(party.share_capital).replace('.', ','),
    registration_type: party.registration_type ?? '',
    registration_city: party.registration_city ?? '',
    ape_code: party.ape_code ?? '',
    iban: formatIban(party.iban),
    bic: party.bic ?? '',
    // NULL means "never chosen": propose the usual French conditions
    default_payment_terms_days: String(
      party.default_payment_terms_days ?? DEFAULT_PAYMENT_TERMS_DAYS
    ),
    late_penalty_text: party.late_penalty_text ?? DEFAULT_LATE_PENALTY_TEXT,
    early_payment_discount_text:
      party.early_payment_discount_text ?? DEFAULT_EARLY_PAYMENT_DISCOUNT_TEXT,
    vat_franchise: Boolean(party.vat_franchise),
    recovery_fee_enabled: party.recovery_fee_enabled !== 0,
  };
}

/** Normalised form values (trimmed, compacted identifiers). */
export function normalizeCompanyForm(form: CompanyForm): CompanyForm {
  const siret = digitsOnly(form.siret);
  const legalForm = form.legal_form.trim();
  const capital = parseAmount(form.share_capital);
  return {
    legal_name: form.legal_name.trim(),
    trading_name: form.trading_name.trim(),
    legal_form: legalForm,
    siret,
    siren: sirenFromSiret(siret),
    vat_number: compact(form.vat_number),
    address_line1: form.address_line1.trim(),
    address_line2: form.address_line2.trim(),
    postal_code: form.postal_code.trim(),
    city: form.city.trim(),
    country_code: compact(form.country_code),
    contact_name: form.contact_name.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    website: form.website.trim(),
    // An individual entrepreneur has no share capital
    share_capital:
      capital === null || Number.isNaN(capital) || !hasShareCapital(legalForm)
        ? ''
        : String(capital).replace('.', ','),
    registration_type: form.registration_type,
    registration_city: form.registration_type ? form.registration_city.trim() : '',
    ape_code: compact(form.ape_code),
    iban: formatIban(compact(form.iban)),
    bic: compact(form.bic),
    default_payment_terms_days: form.default_payment_terms_days.trim(),
    late_penalty_text: form.late_penalty_text.trim(),
    early_payment_discount_text: form.early_payment_discount_text.trim(),
    vat_franchise: form.vat_franchise,
    recovery_fee_enabled: form.recovery_fee_enabled,
  };
}

/** Values to store, typed as columns of the `parties` table. */
export function partyFieldsFromForm(
  form: CompanyForm
): UpdateRecord<Party> & { legal_name: string; country_code: string } {
  const n = normalizeCompanyForm(form);
  const days = n.default_payment_terms_days;
  return {
    legal_name: n.legal_name,
    trading_name: n.trading_name,
    legal_form: n.legal_form,
    siret: n.siret,
    siren: n.siren,
    vat_number: n.vat_number,
    address_line1: n.address_line1,
    address_line2: n.address_line2,
    postal_code: n.postal_code,
    city: n.city,
    country_code: n.country_code,
    contact_name: n.contact_name,
    email: n.email,
    phone: n.phone,
    website: n.website,
    share_capital: parseAmount(n.share_capital),
    registration_type: (n.registration_type || null) as 'RCS' | 'RM' | null,
    registration_city: n.registration_city || null,
    ape_code: n.ape_code || null,
    iban: compact(n.iban) || null,
    bic: n.bic || null,
    default_payment_terms_days: days ? Number(days) : null,
    late_penalty_text: n.late_penalty_text,
    early_payment_discount_text: n.early_payment_discount_text,
    vat_franchise: n.vat_franchise ? 1 : 0,
    recovery_fee_enabled: n.recovery_fee_enabled ? 1 : 0,
  };
}

/**
 * Seller mentions an invoice cannot do without. Used to tell whether the
 * company profile is complete enough to invoice.
 */
export function isCompanyProfileComplete(party: Party | undefined | null): boolean {
  if (!party || isPlaceholderCompany(party)) return false;
  return Boolean(
    party.legal_name?.trim() &&
      party.address_line1?.trim() &&
      party.postal_code?.trim() &&
      party.city?.trim() &&
      (party.siret?.trim() || party.country_code !== 'FR')
  );
}
