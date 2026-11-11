/**
 * Validation of the seller ("my company") profile form.
 *
 * Pure functions, no React / Electron dependency.
 */

import {
  validateSIREN,
  validateSIRET,
} from '../../services/einvoicing/validation';
import type { Party } from '../../database/types';

/** Form fields, all kept as strings while editing. */
export interface CompanyForm {
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
  };
}

/** Normalised values to store (only columns of the `parties` table). */
export function partyFieldsFromForm(form: CompanyForm): CompanyForm {
  const siret = digitsOnly(form.siret);
  return {
    legal_name: form.legal_name.trim(),
    trading_name: form.trading_name.trim(),
    legal_form: form.legal_form.trim(),
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
