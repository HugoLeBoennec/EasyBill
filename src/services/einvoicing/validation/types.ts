/**
 * French E-Invoicing Validation Types
 * For SIREN/SIRET validation and directory lookup
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
  details?: string;
}

export interface SIRENValidationResult extends ValidationResult {
  siren?: string;
  normalized?: string;
}

export interface SIRETValidationResult extends ValidationResult {
  siret?: string;
  siren?: string;
  establishment?: string; // Last 5 digits (NIC - Numéro Interne de Classement)
  normalized?: string;
}

export interface CompanyInfo {
  siren: string;
  siret?: string;
  denomination: string;
  address?: string;
  postalCode?: string;
  city?: string;
  nafCode?: string; // APE/NAF code
  legalForm?: string;
  active: boolean;
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public code: string,
    public field?: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}
