/**
 * Settings Store Tests (renderer side: IPC client, validation, legacy migration)
 */

import { SettingsStore, LEGACY_STORAGE_KEY, type CredentialsApi } from '../settings-store';
import {
  DEFAULT_SETTINGS,
  type EInvoicingSettingsInput,
  type PublicEInvoicingSettings,
} from '../types';

const { clientId: _i, clientSecret: _s, ...PUBLIC } = DEFAULT_SETTINGS;
const publicSettings = (o: Partial<PublicEInvoicingSettings> = {}): PublicEInvoicingSettings => ({
  ...PUBLIC,
  hasClientId: false,
  hasClientSecret: false,
  encryptionAvailable: true,
  ...o,
});
const input = (o: Partial<EInvoicingSettingsInput> = {}): EInvoicingSettingsInput => ({
  ...PUBLIC,
  ...o,
});

function makeApi(): CredentialsApi {
  return {
    get: vi.fn(async () => publicSettings()),
    save: vi.fn(async () => ({ ok: true as const, settings: publicSettings() })),
    clear: vi.fn(async () => publicSettings()),
    importLegacy: vi.fn(async () => ({ ok: true as const, settings: publicSettings() })),
  };
}

describe('SettingsStore', () => {
  let api: CredentialsApi;
  let ls: Record<string, string>;
  let store: SettingsStore;

  beforeEach(() => {
    api = makeApi();
    ls = {};
    store = new SettingsStore(api, {
      getItem: (k) => ls[k] ?? null,
      removeItem: (k) => {
        delete ls[k];
      },
    });
  });

  describe('load / save / clear', () => {
    it('loads masked settings from the main process', async () => {
      api.get = vi.fn(async () => publicSettings({ hasClientSecret: true }));
      expect((await store.load()).hasClientSecret).toBe(true);
    });

    it('falls back to defaults if load fails', async () => {
      api.get = vi.fn(async () => {
        throw new Error('ipc');
      });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(await store.load()).toMatchObject({ ...PUBLIC, hasClientSecret: false });
    });

    it('sends the input to the main process and never touches localStorage', async () => {
      const payload = input({ clientSecret: 'abc' });
      expect((await store.save(payload)).ok).toBe(true);
      expect(api.save).toHaveBeenCalledWith(payload);
      expect(Object.keys(ls)).toHaveLength(0);
    });

    it('returns a French error if save throws', async () => {
      api.save = vi.fn(async () => {
        throw new Error('ipc');
      });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await store.save(input());
      expect(res).toMatchObject({ ok: false, code: 'io' });
    });

    it('clears via the main process', async () => {
      await store.clear();
      expect(api.clear).toHaveBeenCalled();
    });
  });

  describe('migrateLegacy', () => {
    const legacy = { ...DEFAULT_SETTINGS, enabled: true, clientId: 'id', clientSecret: 'sec' };
    const seed = () => {
      ls[LEGACY_STORAGE_KEY] = JSON.stringify({ version: 1, settings: legacy, lastUpdated: 'x' });
    };

    it('does nothing without legacy data', async () => {
      expect(await store.migrateLegacy()).toBeNull();
      expect(api.importLegacy).not.toHaveBeenCalled();
    });

    it('sends legacy settings once and deletes them from localStorage', async () => {
      seed();
      const res = await store.migrateLegacy();
      expect(res?.ok).toBe(true);
      expect(api.importLegacy).toHaveBeenCalledWith(legacy);
      expect(ls[LEGACY_STORAGE_KEY]).toBeUndefined();
      expect(await store.migrateLegacy()).toBeNull();
    });

    it('deletes clear-text secrets and reports an error when encryption is unavailable', async () => {
      seed();
      api.importLegacy = vi.fn(async (l) =>
        'clientSecret' in l
          ? { ok: false as const, code: 'encryption-unavailable' as const, message: 'pas de chiffrement' }
          : { ok: true as const, settings: publicSettings() }
      );
      const res = await store.migrateLegacy();
      expect(res).toMatchObject({ ok: false, code: 'encryption-unavailable' });
      expect(ls[LEGACY_STORAGE_KEY]).toBeUndefined();
      const second = (api.importLegacy as ReturnType<typeof vi.fn>).mock.calls[1][0];
      expect(second.clientSecret).toBeUndefined();
      expect(second.clientId).toBeUndefined();
    });

    it('keeps legacy data on I/O failure so it can be retried', async () => {
      seed();
      api.importLegacy = vi.fn(async () => ({ ok: false as const, code: 'io' as const, message: 'x' }));
      await store.migrateLegacy();
      expect(ls[LEGACY_STORAGE_KEY]).toBeDefined();
    });

    it('drops unparsable legacy data', async () => {
      ls[LEGACY_STORAGE_KEY] = 'invalid json';
      expect(await store.migrateLegacy()).toBeNull();
      expect(ls[LEGACY_STORAGE_KEY]).toBeUndefined();
    });
  });

  describe('validate', () => {
    const valid = input({
      enabled: true,
      apiEndpoint: 'https://api.example.com',
      clientId: 'id',
      clientSecret: 'secret',
    });

    it('passes when disabled', () => {
      expect(store.validate(input({ enabled: false })).valid).toBe(true);
    });

    it('requires an API endpoint when enabled', () => {
      const r = store.validate({ ...valid, apiEndpoint: '' });
      expect(r.valid).toBe(false);
      expect(r.errors).toContain("L'adresse de l'API est obligatoire");
    });

    it('validates the endpoint format', () => {
      const r = store.validate({ ...valid, apiEndpoint: 'not-a-url' });
      expect(r.errors).toContain("L'adresse de l'API doit être une URL valide");
    });

    it('requires client ID except for other platforms', () => {
      expect(store.validate({ ...valid, clientId: '' }).valid).toBe(false);
      expect(store.validate({ ...valid, clientId: '', platform: 'other' }).valid).toBe(true);
    });

    it('requires a client secret unless one is already stored', () => {
      expect(store.validate({ ...valid, clientSecret: '' }).errors).toContain('Le secret client est obligatoire');
      expect(store.validate({ ...valid, clientSecret: '' }, { hasClientSecret: true }).valid).toBe(true);
      expect(store.validate({ ...valid, clientId: '' }, { hasClientId: true }).valid).toBe(true);
    });

    it('trims whitespace', () => {
      const r = store.validate({ ...valid, apiEndpoint: '  ', clientId: '  ', clientSecret: '  ' });
      expect(r.valid).toBe(false);
      expect(r.errors.length).toBeGreaterThan(2);
    });

    it('passes with all required fields', () => {
      expect(store.validate(valid)).toEqual({ valid: true, errors: [] });
    });
  });

  describe('getDefaultEndpoint', () => {
    it('returns endpoints per platform/environment', () => {
      expect(store.getDefaultEndpoint('chorus-pro', 'qualification')).toBe('https://api-qualif.piste.gouv.fr/cpro/v1');
      expect(store.getDefaultEndpoint('chorus-pro', 'production')).toBe('https://api.piste.gouv.fr/cpro/v1');
      expect(store.getDefaultEndpoint('other', 'production')).toBe('');
    });
  });

  describe('isConfigured', () => {
    it('is true only when enabled with endpoint and both secrets stored', async () => {
      api.get = vi.fn(async () => publicSettings({ enabled: true, apiEndpoint: 'https://a.io', hasClientId: true, hasClientSecret: true }));
      expect(await store.isConfigured()).toBe(true);
      api.get = vi.fn(async () => publicSettings({ enabled: true, apiEndpoint: 'https://a.io' }));
      expect(await store.isConfigured()).toBe(false);
    });
  });
});
