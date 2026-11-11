import { describe, it, expect } from 'vitest';
import type { Party } from '../../../database/types';
import {
  DEFAULT_EARLY_PAYMENT_DISCOUNT_TEXT,
  DEFAULT_LATE_PENALTY_TEXT,
  formatEuroAmount,
  formatIban,
  hasShareCapital,
  isIndividualEntrepreneur,
} from '../../../database/company-legal';
import {
  CompanyForm,
  EMPTY_COMPANY_FORM,
  formFromParty,
  parseAmount,
  partyFieldsFromForm,
  validateApeCode,
  validateBic,
  validateCompanyForm,
  validateIban,
} from '../companyValidation';

const validForm = (overrides: Partial<CompanyForm> = {}): CompanyForm => ({
  ...EMPTY_COMPANY_FORM,
  legal_name: 'Dupont Conseil',
  legal_form: 'SAS',
  siret: '732 829 320 00074',
  siren: '732829320',
  vat_number: 'FR44732829320',
  address_line1: '12 rue de la Paix',
  postal_code: '75002',
  city: 'Paris',
  ...overrides,
});

describe('validateIban', () => {
  it('accepts valid IBANs, with or without spaces and in lower case', () => {
    expect(validateIban('FR76 3000 6000 0112 3456 7890 189')).toBeUndefined();
    expect(validateIban('fr7630006000011234567890189')).toBeUndefined();
    expect(validateIban('GB82 WEST 1234 5698 7654 32')).toBeUndefined();
    expect(validateIban('DE89370400440532013000')).toBeUndefined();
    expect(validateIban('BE68539007547034')).toBeUndefined();
    expect(validateIban('')).toBeUndefined(); // optional
  });

  it('rejects a wrong check key (mod 97)', () => {
    expect(validateIban('FR76 3000 6000 0112 3456 7890 188')).toMatch(/clé de contrôle/);
    expect(validateIban('FR75 3000 6000 0112 3456 7890 189')).toMatch(/clé de contrôle/);
    expect(validateIban('GB82 WEST 1234 5698 7654 33')).toMatch(/clé de contrôle/);
  });

  it('rejects malformed values and wrong French lengths', () => {
    expect(validateIban('1234')).toMatch(/Format invalide/);
    expect(validateIban('FR76 3000 6000 01!2')).toMatch(/Format invalide/);
    expect(validateIban('FR76 3000 6000 0112 3456 7890')).toMatch(/27 caractères/);
  });
});

describe('validateBic', () => {
  it('accepts 8 and 11 character codes', () => {
    expect(validateBic('BNPAFRPP')).toBeUndefined();
    expect(validateBic('bnpafrppxxx')).toBeUndefined();
    expect(validateBic('CMCI FR 2A')).toBeUndefined();
    expect(validateBic('')).toBeUndefined();
  });

  it('rejects other shapes', () => {
    expect(validateBic('BNPAFR')).toMatch(/BIC invalide/);
    expect(validateBic('BNPAFRPPXX')).toMatch(/BIC invalide/);
    expect(validateBic('1NPAFRPP')).toMatch(/BIC invalide/);
  });
});

describe('validateApeCode', () => {
  it('accepts 4 digits and a letter', () => {
    expect(validateApeCode('6201Z')).toBeUndefined();
    expect(validateApeCode('62.01z')).toBeUndefined();
    expect(validateApeCode('')).toBeUndefined();
  });

  it('rejects anything else', () => {
    expect(validateApeCode('6201')).toMatch(/Code APE invalide/);
    expect(validateApeCode('620Z1')).toMatch(/Code APE invalide/);
    expect(validateApeCode('62011Z')).toMatch(/Code APE invalide/);
  });
});

describe('parseAmount', () => {
  it('reads French and plain notations', () => {
    expect(parseAmount('10 000')).toBe(10000);
    expect(parseAmount('1 500,50 €')).toBe(1500.5);
    expect(parseAmount('1000.5')).toBe(1000.5);
    expect(parseAmount('  ')).toBeNull();
    expect(parseAmount('dix mille')).toBeNaN();
    expect(parseAmount('-5')).toBeNaN();
  });
});

describe('legal form helpers', () => {
  it('recognises individual entrepreneurs', () => {
    for (const form of [
      'EI',
      'EI (micro-entrepreneur)',
      'EIRL',
      'Entrepreneur individuel',
      'Micro-entreprise',
      'auto-entrepreneur',
    ]) {
      expect(isIndividualEntrepreneur(form)).toBe(true);
      expect(hasShareCapital(form)).toBe(false);
    }
    for (const form of ['SAS', 'SASU', 'EURL', 'SARL', 'SA', '', undefined]) {
      expect(isIndividualEntrepreneur(form)).toBe(false);
    }
    expect(hasShareCapital('SAS')).toBe(true);
    expect(hasShareCapital('Association')).toBe(false);
  });

  it('formats amounts and IBANs for printing', () => {
    expect(formatEuroAmount(10000)).toBe('10 000 €');
    expect(formatEuroAmount(1500.5)).toBe('1 500,50 €');
    expect(formatEuroAmount(1)).toBe('1 €');
    expect(formatIban('fr7630006000011234567890189')).toBe('FR76 3000 6000 0112 3456 7890 189');
  });
});

describe('validateCompanyForm (legal mentions)', () => {
  it('accepts a complete company', () => {
    expect(
      validateCompanyForm(
        validForm({
          share_capital: '10 000',
          registration_type: 'RCS',
          registration_city: 'Paris',
          ape_code: '6201Z',
          iban: 'FR76 3000 6000 0112 3456 7890 189',
          bic: 'BNPAFRPP',
        })
      )
    ).toEqual({});
  });

  it('requires the VAT number unless the franchise is checked', () => {
    expect(validateCompanyForm(validForm({ vat_number: '' })).vat_number).toMatch(/franchise/);
    expect(validateCompanyForm(validForm({ vat_number: '', vat_franchise: true }))).toEqual({});
    // A foreign seller is not concerned
    expect(
      validateCompanyForm(
        validForm({ vat_number: '', country_code: 'BE', siret: '', siren: '', postal_code: '1000' })
      )
    ).toEqual({});
  });

  it('reports invalid legal, bank and payment fields', () => {
    const errors = validateCompanyForm(
      validForm({
        share_capital: 'beaucoup',
        ape_code: '62',
        iban: 'FR00 0000',
        bic: 'XX',
        default_payment_terms_days: '90',
      })
    );
    expect(Object.keys(errors).sort()).toEqual([
      'ape_code',
      'bic',
      'default_payment_terms_days',
      'iban',
      'share_capital',
    ]);
  });
});

describe('form <-> party', () => {
  it('proposes the French default conditions for a party that never set them', () => {
    const party: Party = {
      id: 1,
      party_type: 'company',
      legal_name: 'Dupont Conseil',
      country_code: 'FR',
      active: 1,
    };
    const form = formFromParty(party);
    expect(form.default_payment_terms_days).toBe('30');
    expect(form.late_penalty_text).toBe(DEFAULT_LATE_PENALTY_TEXT);
    expect(form.early_payment_discount_text).toBe(DEFAULT_EARLY_PAYMENT_DISCOUNT_TEXT);
    expect(form.recovery_fee_enabled).toBe(true);
    expect(form.vat_franchise).toBe(false);
    expect(DEFAULT_LATE_PENALTY_TEXT).toContain("3 fois le taux d'intérêt légal");
  });

  it('normalises the values to store', () => {
    const fields = partyFieldsFromForm(
      validForm({
        share_capital: '10 000,50',
        registration_type: 'RCS',
        registration_city: ' Paris ',
        ape_code: '62.01z',
        iban: 'fr76 3000 6000 0112 3456 7890 189',
        bic: 'bnpafrpp',
        default_payment_terms_days: '45',
        vat_franchise: true,
        recovery_fee_enabled: false,
      })
    );
    expect(fields).toMatchObject({
      siret: '73282932000074',
      share_capital: 10000.5,
      registration_type: 'RCS',
      registration_city: 'Paris',
      ape_code: '6201Z',
      iban: 'FR7630006000011234567890189',
      bic: 'BNPAFRPP',
      default_payment_terms_days: 45,
      vat_franchise: 1,
      recovery_fee_enabled: 0,
    });
  });

  it('drops the share capital of an individual entrepreneur and unused registration city', () => {
    const fields = partyFieldsFromForm(
      validForm({ legal_form: 'EI', share_capital: '5000', registration_city: 'Lyon' })
    );
    expect(fields.share_capital).toBeNull();
    expect(fields.registration_type).toBeNull();
    expect(fields.registration_city).toBeNull();
  });
});
