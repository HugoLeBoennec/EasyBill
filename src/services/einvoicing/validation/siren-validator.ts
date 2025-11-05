/**
 * SIREN/SIRET Validator
 *
 * Validates French company identification numbers:
 * - SIREN: 9 digits (company identifier)
 * - SIRET: 14 digits (SIREN + 5-digit establishment code)
 *
 * Both use the Luhn algorithm for checksum validation.
 *
 * References:
 * - https://www.insee.fr/fr/information/2560452
 * - https://fr.wikipedia.org/wiki/Syst%C3%A8me_d%27identification_du_r%C3%A9pertoire_des_%C3%A9tablissements
 */

import {
  ValidationResult,
  SIRENValidationResult,
  SIRETValidationResult,
  ValidationError,
} from './types';

export class SIRENValidator {
  /**
   * Normalize SIREN/SIRET by removing spaces, dashes, and other non-digit characters
   */
  private normalize(value: string | number): string {
    const str = String(value);
    return str.replace(/[\s\-._]/g, '');
  }

  /**
   * Validate SIREN number (9 digits with Luhn checksum)
   *
   * Algorithm:
   * 1. Double every other digit starting from position 1 (0-indexed)
   * 2. If doubled value > 9, subtract 9
   * 3. Sum all digits
   * 4. Result must be divisible by 10
   *
   * @param siren - SIREN number as string
   * @returns Validation result with normalized SIREN
   */
  validateSIREN(siren: string | number): SIRENValidationResult {
    if (!siren && siren !== 0) {
      return {
        valid: false,
        error: 'SIREN is required',
      };
    }

    const normalized = this.normalize(siren);

    // Check format: exactly 9 digits
    if (!/^\d{9}$/.test(normalized)) {
      return {
        valid: false,
        error: 'SIREN must be exactly 9 digits',
        details: `Received: ${normalized} (${normalized.length} characters)`,
      };
    }

    // Apply Luhn algorithm
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      let digit = parseInt(normalized[i], 10);

      // Double every other digit (positions 1, 3, 5, 7)
      if (i % 2 === 1) {
        digit *= 2;
        // If result > 9, subtract 9 (equivalent to summing digits)
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
    }

    const valid = sum % 10 === 0;

    if (!valid) {
      return {
        valid: false,
        error: 'Invalid SIREN checksum',
        details: `Luhn checksum failed (sum: ${sum})`,
      };
    }

    return {
      valid: true,
      siren: normalized,
      normalized,
    };
  }

  /**
   * Validate SIRET number (14 digits with Luhn checksum)
   *
   * SIRET = SIREN (9 digits) + NIC (5 digits)
   * NIC = Numéro Interne de Classement (establishment identifier)
   *
   * Algorithm:
   * 1. Validate the first 9 digits as SIREN
   * 2. Apply Luhn algorithm to all 14 digits
   * 3. Alternate doubling pattern starts at position 0
   *
   * @param siret - SIRET number as string
   * @returns Validation result with normalized SIRET and extracted SIREN
   */
  validateSIRET(siret: string | number): SIRETValidationResult {
    if (!siret && siret !== 0) {
      return {
        valid: false,
        error: 'SIRET is required',
      };
    }

    const normalized = this.normalize(siret);

    // Check format: exactly 14 digits
    if (!/^\d{14}$/.test(normalized)) {
      return {
        valid: false,
        error: 'SIRET must be exactly 14 digits',
        details: `Received: ${normalized} (${normalized.length} characters)`,
      };
    }

    // Extract SIREN (first 9 digits) and validate it
    const siren = normalized.substring(0, 9);
    const sirenValidation = this.validateSIREN(siren);

    if (!sirenValidation.valid) {
      return {
        valid: false,
        error: 'Invalid SIREN within SIRET',
        details: sirenValidation.error,
      };
    }

    // Extract NIC (last 5 digits)
    const nic = normalized.substring(9, 14);

    // Apply Luhn algorithm to full 14 digits
    // Note: For SIRET, the pattern starts at position 0 (unlike SIREN which starts at 1)
    let sum = 0;
    for (let i = 0; i < 14; i++) {
      let digit = parseInt(normalized[i], 10);

      // Double every other digit (positions 0, 2, 4, 6, 8, 10, 12)
      if (i % 2 === 0) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
    }

    const valid = sum % 10 === 0;

    if (!valid) {
      return {
        valid: false,
        error: 'Invalid SIRET checksum',
        details: `Luhn checksum failed (sum: ${sum})`,
      };
    }

    return {
      valid: true,
      siret: normalized,
      siren,
      establishment: nic,
      normalized,
    };
  }

  /**
   * Extract SIREN from SIRET
   */
  extractSIREN(siret: string): string {
    const normalized = this.normalize(siret);
    if (normalized.length >= 9) {
      return normalized.substring(0, 9);
    }
    return normalized;
  }

  /**
   * Format SIREN for display (XXX XXX XXX)
   */
  formatSIREN(siren: string): string {
    const normalized = this.normalize(siren);
    if (normalized.length === 9) {
      return `${normalized.substring(0, 3)} ${normalized.substring(3, 6)} ${normalized.substring(6, 9)}`;
    }
    return siren;
  }

  /**
   * Format SIRET for display (XXX XXX XXX XXXXX)
   */
  formatSIRET(siret: string): string {
    const normalized = this.normalize(siret);
    if (normalized.length === 14) {
      return `${normalized.substring(0, 3)} ${normalized.substring(3, 6)} ${normalized.substring(6, 9)} ${normalized.substring(9, 14)}`;
    }
    return siret;
  }

  /**
   * Validate either SIREN or SIRET based on length
   */
  validate(value: string): ValidationResult {
    const normalized = this.normalize(value);

    if (normalized.length === 9) {
      return this.validateSIREN(value);
    } else if (normalized.length === 14) {
      return this.validateSIRET(value);
    } else {
      return {
        valid: false,
        error: 'Invalid format: must be 9 digits (SIREN) or 14 digits (SIRET)',
        details: `Received: ${normalized.length} digits`,
      };
    }
  }

  /**
   * Check if a value is a valid SIREN (quick check)
   */
  isSIREN(value: string): boolean {
    return this.validateSIREN(value).valid;
  }

  /**
   * Check if a value is a valid SIRET (quick check)
   */
  isSIRET(value: string): boolean {
    return this.validateSIRET(value).valid;
  }

  /**
   * Throw ValidationError if invalid
   */
  assertValidSIREN(siren: string): void {
    const result = this.validateSIREN(siren);
    if (!result.valid) {
      throw new ValidationError(
        result.error || 'Invalid SIREN',
        'INVALID_SIREN',
        'siren',
      );
    }
  }

  /**
   * Throw ValidationError if invalid
   */
  assertValidSIRET(siret: string): void {
    const result = this.validateSIRET(siret);
    if (!result.valid) {
      throw new ValidationError(
        result.error || 'Invalid SIRET',
        'INVALID_SIRET',
        'siret',
      );
    }
  }
}

// Singleton instance for convenience
export const sirenValidator = new SIRENValidator();

// Export convenience functions
export const validateSIREN = (siren: string) => sirenValidator.validateSIREN(siren);
export const validateSIRET = (siret: string) => sirenValidator.validateSIRET(siret);
export const isSIREN = (value: string) => sirenValidator.isSIREN(value);
export const isSIRET = (value: string) => sirenValidator.isSIRET(value);
export const formatSIREN = (siren: string) => sirenValidator.formatSIREN(siren);
export const formatSIRET = (siret: string) => sirenValidator.formatSIRET(siret);
