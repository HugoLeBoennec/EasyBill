/**
 * SIREN/SIRET Validator Tests
 */

import {
  SIRENValidator,
  validateSIREN,
  validateSIRET,
  isSIREN,
  isSIRET,
  formatSIREN,
  formatSIRET,
} from '../siren-validator';
import { ValidationError } from '../types';

describe('SIRENValidator', () => {
  let validator: SIRENValidator;

  beforeEach(() => {
    validator = new SIRENValidator();
  });

  describe('SIREN Validation', () => {
    describe('Valid SIREN numbers', () => {
      const validSIRENs = [
        '732829320', // Société Générale
        '552100554', // EDF
        '542065479', // La Poste
        '443061841', // Apple France
        '301625869', // L'Oréal
        '542107651', // Air France
      ];

      test.each(validSIRENs)('should validate SIREN: %s', (siren) => {
        const result = validator.validateSIREN(siren);
        expect(result.valid).toBe(true);
        expect(result.siren).toBe(siren);
        expect(result.normalized).toBe(siren);
        expect(result.error).toBeUndefined();
      });

      it('should validate SIREN with spaces', () => {
        const result = validator.validateSIREN('732 829 320');
        expect(result.valid).toBe(true);
        expect(result.normalized).toBe('732829320');
      });

      it('should validate SIREN with dashes', () => {
        const result = validator.validateSIREN('732-829-320');
        expect(result.valid).toBe(true);
        expect(result.normalized).toBe('732829320');
      });

      it('should validate SIREN with mixed formatting', () => {
        const result = validator.validateSIREN('732 829-320');
        expect(result.valid).toBe(true);
        expect(result.normalized).toBe('732829320');
      });
    });

    describe('Invalid SIREN numbers', () => {
      it('should reject empty SIREN', () => {
        const result = validator.validateSIREN('');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('SIREN is required');
      });

      it('should reject SIREN with wrong length (too short)', () => {
        const result = validator.validateSIREN('12345678');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('SIREN must be exactly 9 digits');
      });

      it('should reject SIREN with wrong length (too long)', () => {
        const result = validator.validateSIREN('1234567890');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('SIREN must be exactly 9 digits');
      });

      it('should reject SIREN with invalid checksum', () => {
        const result = validator.validateSIREN('123456789'); // Invalid checksum
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Invalid SIREN checksum');
        expect(result.details).toContain('Luhn checksum failed');
      });

      it('should reject SIREN with letters', () => {
        const result = validator.validateSIREN('73282932A');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('SIREN must be exactly 9 digits');
      });

      it('should reject SIREN with special characters', () => {
        const result = validator.validateSIREN('732829@20');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('SIREN must be exactly 9 digits');
      });
    });
  });

  describe('SIRET Validation', () => {
    describe('Valid SIRET numbers', () => {
      const validSIRETs = [
        '73282932000009', // Société Générale
        '55210055400005', // EDF
        '54206547900009', // La Poste
        '44306184100005', // Apple France
        '30162586900005', // L'Oréal
        '54210765100011', // Air France (verified)
      ];

      test.each(validSIRETs)('should validate SIRET: %s', (siret) => {
        const result = validator.validateSIRET(siret);
        expect(result.valid).toBe(true);
        expect(result.siret).toBe(siret);
        expect(result.siren).toBe(siret.substring(0, 9));
        expect(result.establishment).toBe(siret.substring(9, 14));
        expect(result.normalized).toBe(siret);
        expect(result.error).toBeUndefined();
      });

      it('should validate SIRET with spaces', () => {
        const result = validator.validateSIRET('732 829 320 00009');
        expect(result.valid).toBe(true);
        expect(result.normalized).toBe('73282932000009');
      });

      it('should validate SIRET with dashes', () => {
        const result = validator.validateSIRET('732-829-320-00009');
        expect(result.valid).toBe(true);
        expect(result.normalized).toBe('73282932000009');
      });

      it('should extract correct SIREN from SIRET', () => {
        const result = validator.validateSIRET('73282932000009');
        expect(result.siren).toBe('732829320');
      });

      it('should extract correct establishment code from SIRET', () => {
        const result = validator.validateSIRET('73282932000009');
        expect(result.establishment).toBe('00009');
      });
    });

    describe('Invalid SIRET numbers', () => {
      it('should reject empty SIRET', () => {
        const result = validator.validateSIRET('');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('SIRET is required');
      });

      it('should reject SIRET with wrong length (too short)', () => {
        const result = validator.validateSIRET('7328293200007');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('SIRET must be exactly 14 digits');
      });

      it('should reject SIRET with wrong length (too long)', () => {
        const result = validator.validateSIRET('732829320000740');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('SIRET must be exactly 14 digits');
      });

      it('should reject SIRET with invalid SIREN part', () => {
        const result = validator.validateSIRET('12345678900074');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Invalid SIREN within SIRET');
      });

      it('should reject SIRET with invalid checksum', () => {
        const result = validator.validateSIRET('73282932000010'); // Invalid checksum (should be 00009 or 00017)
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Invalid SIRET checksum');
        expect(result.details).toContain('Luhn checksum failed');
      });

      it('should reject SIRET with letters', () => {
        const result = validator.validateSIRET('7328293200007A');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('SIRET must be exactly 14 digits');
      });
    });
  });

  describe('Utility Functions', () => {
    describe('extractSIREN', () => {
      it('should extract SIREN from SIRET', () => {
        expect(validator.extractSIREN('73282932000074')).toBe('732829320');
      });

      it('should handle SIREN input', () => {
        expect(validator.extractSIREN('732829320')).toBe('732829320');
      });

      it('should handle short input', () => {
        expect(validator.extractSIREN('12345')).toBe('12345');
      });

      it('should handle formatted SIRET', () => {
        expect(validator.extractSIREN('732 829 320 00009')).toBe('732829320');
      });
    });

    describe('formatSIREN', () => {
      it('should format valid SIREN', () => {
        expect(validator.formatSIREN('732829320')).toBe('732 829 320');
      });

      it('should return original if not 9 digits', () => {
        expect(validator.formatSIREN('12345')).toBe('12345');
      });

      it('should handle already formatted SIREN', () => {
        expect(validator.formatSIREN('732 829 320')).toBe('732 829 320');
      });
    });

    describe('formatSIRET', () => {
      it('should format valid SIRET', () => {
        expect(validator.formatSIRET('73282932000074')).toBe('732 829 320 00074');
      });

      it('should return original if not 14 digits', () => {
        expect(validator.formatSIRET('12345')).toBe('12345');
      });

      it('should handle already formatted SIRET', () => {
        expect(validator.formatSIRET('732 829 320 00074')).toBe('732 829 320 00074');
      });
    });

    describe('validate (auto-detect)', () => {
      it('should validate SIREN when 9 digits', () => {
        const result = validator.validate('732829320');
        expect(result.valid).toBe(true);
      });

      it('should validate SIRET when 14 digits', () => {
        const result = validator.validate('73282932000009');
        expect(result.valid).toBe(true);
      });

      it('should reject invalid length', () => {
        const result = validator.validate('12345');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('must be 9 digits (SIREN) or 14 digits (SIRET)');
      });
    });

    describe('isSIREN', () => {
      it('should return true for valid SIREN', () => {
        expect(validator.isSIREN('732829320')).toBe(true);
      });

      it('should return false for invalid SIREN', () => {
        expect(validator.isSIREN('123456789')).toBe(false);
      });
    });

    describe('isSIRET', () => {
      it('should return true for valid SIRET', () => {
        expect(validator.isSIRET('73282932000009')).toBe(true);
      });

      it('should return false for invalid SIRET', () => {
        expect(validator.isSIRET('12345678900074')).toBe(false);
      });
    });

    describe('assertValidSIREN', () => {
      it('should not throw for valid SIREN', () => {
        expect(() => validator.assertValidSIREN('732829320')).not.toThrow();
      });

      it('should throw ValidationError for invalid SIREN', () => {
        expect(() => validator.assertValidSIREN('123456789')).toThrow(ValidationError);
        expect(() => validator.assertValidSIREN('123456789')).toThrow('Invalid SIREN checksum');
      });

      it('should throw with correct error code', () => {
        try {
          validator.assertValidSIREN('123456789');
          fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(ValidationError);
          expect((error as ValidationError).code).toBe('INVALID_SIREN');
          expect((error as ValidationError).field).toBe('siren');
        }
      });
    });

    describe('assertValidSIRET', () => {
      it('should not throw for valid SIRET', () => {
        expect(() => validator.assertValidSIRET('73282932000009')).not.toThrow();
      });

      it('should throw ValidationError for invalid SIRET', () => {
        expect(() => validator.assertValidSIRET('12345678900074')).toThrow(ValidationError);
      });

      it('should throw with correct error code', () => {
        try {
          validator.assertValidSIRET('12345678900074');
          fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(ValidationError);
          expect((error as ValidationError).code).toBe('INVALID_SIRET');
          expect((error as ValidationError).field).toBe('siret');
        }
      });
    });
  });

  describe('Convenience Functions', () => {
    it('validateSIREN should work', () => {
      const result = validateSIREN('732829320');
      expect(result.valid).toBe(true);
    });

    it('validateSIRET should work', () => {
      const result = validateSIRET('73282932000009');
      expect(result.valid).toBe(true);
    });

    it('isSIREN should work', () => {
      expect(isSIREN('732829320')).toBe(true);
      expect(isSIREN('123456789')).toBe(false);
    });

    it('isSIRET should work', () => {
      expect(isSIRET('73282932000009')).toBe(true);
      expect(isSIRET('12345678900074')).toBe(false);
    });

    it('formatSIREN should work', () => {
      expect(formatSIREN('732829320')).toBe('732 829 320');
    });

    it('formatSIRET should work', () => {
      expect(formatSIRET('73282932000009')).toBe('732 829 320 00009');
    });
  });

  describe('Real-world examples', () => {
    const realCompanies = [
      { name: 'Société Générale', siren: '732829320', siret: '73282932000009' },
      { name: 'EDF', siren: '552100554', siret: '55210055400005' },
      { name: 'La Poste', siren: '542065479', siret: '54206547900009' },
      { name: 'Apple France', siren: '443061841', siret: '44306184100005' },
      { name: "L'Oréal", siren: '301625869', siret: '30162586900005' },
      { name: 'Air France', siren: '542107651', siret: '54210765100011' },
    ];

    test.each(realCompanies)(
      'should validate $name SIREN and SIRET',
      ({ siren, siret }) => {
        expect(validator.isSIREN(siren)).toBe(true);
        expect(validator.isSIRET(siret)).toBe(true);
        expect(validator.extractSIREN(siret)).toBe(siren);
      },
    );
  });

  describe('Edge Cases', () => {
    it('should handle null input gracefully', () => {
      const result = validator.validateSIREN(null as any);
      expect(result.valid).toBe(false);
    });

    it('should handle undefined input gracefully', () => {
      const result = validator.validateSIREN(undefined as any);
      expect(result.valid).toBe(false);
    });

    it('should handle numeric input', () => {
      const result = validator.validateSIREN(732829320 as any);
      expect(result.valid).toBe(true);
    });

    it('should handle SIRET with dots', () => {
      const result = validator.validateSIRET('732.829.320.00009');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('73282932000009');
    });

    it('should handle SIRET with underscores', () => {
      const result = validator.validateSIRET('732_829_320_00009');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('73282932000009');
    });
  });
});
