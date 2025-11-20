/**
 * Settings Store Tests
 */

import { SettingsStore } from '../settings-store';
import { DEFAULT_SETTINGS, type EInvoicingSettings } from '../types';

describe('SettingsStore', () => {
  let store: SettingsStore;
  let mockLocalStorage: { [key: string]: string };

  beforeEach(() => {
    store = new SettingsStore();

    // Mock localStorage
    mockLocalStorage = {};
    global.localStorage = {
      getItem: (key: string) => mockLocalStorage[key] || null,
      setItem: (key: string, value: string) => {
        mockLocalStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockLocalStorage[key];
      },
      clear: () => {
        mockLocalStorage = {};
      },
      length: Object.keys(mockLocalStorage).length,
      key: (index: number) => Object.keys(mockLocalStorage)[index] || null,
    };
  });

  describe('load', () => {
    it('should return default settings when localStorage is empty', () => {
      const settings = store.load();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('should load settings from localStorage', () => {
      const testSettings: EInvoicingSettings = {
        ...DEFAULT_SETTINGS,
        enabled: true,
        platform: 'tiime',
        clientId: 'test-client-id',
      };

      store.save(testSettings);
      const loaded = store.load();

      expect(loaded).toEqual(testSettings);
    });

    it('should return defaults if JSON parse fails', () => {
      mockLocalStorage['einvoicing_settings'] = 'invalid json';
      const settings = store.load();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('should return defaults if version mismatch', () => {
      mockLocalStorage['einvoicing_settings'] = JSON.stringify({
        version: 999,
        settings: { enabled: true },
      });
      const settings = store.load();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe('save', () => {
    it('should save settings to localStorage', () => {
      const testSettings: EInvoicingSettings = {
        ...DEFAULT_SETTINGS,
        enabled: true,
        clientId: 'test-id',
      };

      store.save(testSettings);

      const raw = mockLocalStorage['einvoicing_settings'];
      expect(raw).toBeDefined();

      const parsed = JSON.parse(raw);
      expect(parsed.version).toBe(1);
      expect(parsed.settings).toEqual(testSettings);
      expect(parsed.lastUpdated).toBeDefined();
    });

    it('should throw error if save fails', () => {
      // Make setItem throw error
      global.localStorage.setItem = () => {
        throw new Error('Storage full');
      };

      const testSettings = { ...DEFAULT_SETTINGS };
      expect(() => store.save(testSettings)).toThrow(
        'Failed to save settings'
      );
    });
  });

  describe('clear', () => {
    it('should remove settings from localStorage', () => {
      store.save({ ...DEFAULT_SETTINGS, enabled: true });
      expect(mockLocalStorage['einvoicing_settings']).toBeDefined();

      store.clear();
      expect(mockLocalStorage['einvoicing_settings']).toBeUndefined();
    });
  });

  describe('validate', () => {
    it('should pass validation when disabled', () => {
      const settings = { ...DEFAULT_SETTINGS, enabled: false };
      const result = store.validate(settings);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require API endpoint when enabled', () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        enabled: true,
        apiEndpoint: '',
      };
      const result = store.validate(settings);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('API endpoint is required');
    });

    it('should validate API endpoint format', () => {
      const settings: EInvoicingSettings = {
        ...DEFAULT_SETTINGS,
        enabled: true,
        apiEndpoint: 'not-a-url',
        clientId: 'test',
        clientSecret: 'secret',
      };
      const result = store.validate(settings);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('API endpoint must be a valid URL');
    });

    it('should require client ID for non-other platforms', () => {
      const settings: EInvoicingSettings = {
        ...DEFAULT_SETTINGS,
        enabled: true,
        platform: 'chorus-pro',
        apiEndpoint: 'https://api.example.com',
        clientId: '',
        clientSecret: 'secret',
      };
      const result = store.validate(settings);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Client ID is required');
    });

    it('should require client secret', () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        enabled: true,
        apiEndpoint: 'https://api.example.com',
        clientId: 'test',
        clientSecret: '',
      };
      const result = store.validate(settings);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Client secret is required');
    });

    it('should pass validation with all required fields', () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        enabled: true,
        apiEndpoint: 'https://api.example.com',
        clientId: 'test-id',
        clientSecret: 'test-secret',
      };
      const result = store.validate(settings);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should allow empty client ID for other platform', () => {
      const settings: EInvoicingSettings = {
        ...DEFAULT_SETTINGS,
        enabled: true,
        platform: 'other',
        apiEndpoint: 'https://api.example.com',
        clientId: '',
        clientSecret: 'secret',
      };
      const result = store.validate(settings);

      expect(result.valid).toBe(true);
    });
  });

  describe('getDefaultEndpoint', () => {
    it('should return qualification endpoint for chorus-pro', () => {
      const endpoint = store.getDefaultEndpoint('chorus-pro', 'qualification');
      expect(endpoint).toBe('https://api-qualif.piste.gouv.fr/cpro/v1');
    });

    it('should return production endpoint for chorus-pro', () => {
      const endpoint = store.getDefaultEndpoint('chorus-pro', 'production');
      expect(endpoint).toBe('https://api.piste.gouv.fr/cpro/v1');
    });

    it('should return empty string for other platform', () => {
      const endpoint = store.getDefaultEndpoint('other', 'production');
      expect(endpoint).toBe('');
    });
  });

  describe('isConfigured', () => {
    it('should return false when disabled', () => {
      store.save({ ...DEFAULT_SETTINGS, enabled: false });
      expect(store.isConfigured()).toBe(false);
    });

    it('should return false when missing credentials', () => {
      store.save({
        ...DEFAULT_SETTINGS,
        enabled: true,
        apiEndpoint: 'https://api.example.com',
      });
      expect(store.isConfigured()).toBe(false);
    });

    it('should return true when fully configured', () => {
      store.save({
        ...DEFAULT_SETTINGS,
        enabled: true,
        apiEndpoint: 'https://api.example.com',
        clientId: 'test-id',
        clientSecret: 'test-secret',
      });
      expect(store.isConfigured()).toBe(true);
    });
  });

  describe('getSummary', () => {
    it('should return settings summary', () => {
      store.save({
        ...DEFAULT_SETTINGS,
        enabled: true,
        platform: 'pennylane',
        environment: 'production',
        defaultFormat: 'ubl',
      });

      const summary = store.getSummary();

      expect(summary.enabled).toBe(true);
      expect(summary.platform).toBe('pennylane');
      expect(summary.environment).toBe('production');
      expect(summary.format).toBe('ubl');
    });
  });

  describe('export/import', () => {
    it('should export settings as JSON', () => {
      const testSettings = {
        ...DEFAULT_SETTINGS,
        enabled: true,
        clientId: 'test-id',
      };
      store.save(testSettings);

      const exported = store.export();
      const parsed = JSON.parse(exported);

      expect(parsed).toEqual(testSettings);
    });

    it('should import settings from JSON', () => {
      const testSettings: EInvoicingSettings = {
        ...DEFAULT_SETTINGS,
        enabled: true,
        apiEndpoint: 'https://api.example.com',
        clientId: 'imported-id',
        clientSecret: 'imported-secret',
      };

      const json = JSON.stringify(testSettings);
      store.import(json);

      const loaded = store.load();
      expect(loaded).toEqual(testSettings);
    });

    it('should throw error on invalid JSON import', () => {
      expect(() => store.import('invalid json')).toThrow(
        'Failed to import settings'
      );
    });

    it('should validate imported settings', () => {
      const invalidSettings: EInvoicingSettings = {
        ...DEFAULT_SETTINGS,
        enabled: true,
        apiEndpoint: 'not-a-url',
      };

      const json = JSON.stringify(invalidSettings);
      expect(() => store.import(json)).toThrow('Failed to import settings');
    });
  });

  describe('Edge Cases', () => {
    it('should handle trimmed strings in validation', () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        enabled: true,
        apiEndpoint: '  ',
        clientId: '  ',
        clientSecret: '  ',
      };
      const result = store.validate(settings);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should persist multiple saves correctly', () => {
      const settings1 = { ...DEFAULT_SETTINGS, enabled: true };
      const settings2 = { ...DEFAULT_SETTINGS, enabled: false, platform: 'sage' as const };

      store.save(settings1);
      expect(store.load().enabled).toBe(true);

      store.save(settings2);
      expect(store.load().enabled).toBe(false);
      expect(store.load().platform).toBe('sage');
    });
  });
});
