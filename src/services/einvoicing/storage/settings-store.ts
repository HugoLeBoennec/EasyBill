/**
 * E-Invoicing Settings Service (renderer side)
 *
 * Settings and credentials are persisted by the main process (secrets are
 * encrypted with Electron safeStorage, see src/main/credentials-store.ts).
 * The renderer only ever receives masked settings (hasClientId /
 * hasClientSecret) and never writes anything to localStorage; it only reads
 * and deletes the legacy clear-text entry during the one-time migration.
 */

import {
  DEFAULT_SETTINGS,
  PLATFORM_ENDPOINTS,
  type CredentialsResult,
  type EInvoicingSettings,
  type EInvoicingSettingsInput,
  type Environment,
  type Platform,
  type PublicEInvoicingSettings,
} from './types';

export const LEGACY_STORAGE_KEY = 'einvoicing_settings';

export interface CredentialsApi {
  get(): Promise<PublicEInvoicingSettings>;
  save(input: EInvoicingSettingsInput): Promise<CredentialsResult>;
  clear(): Promise<PublicEInvoicingSettings>;
  importLegacy(legacy: Partial<EInvoicingSettings>): Promise<CredentialsResult>;
}

type LegacyStorage = Pick<Storage, 'getItem' | 'removeItem'>;

export const DEFAULT_PUBLIC_SETTINGS: PublicEInvoicingSettings = (() => {
  const { clientId: _i, clientSecret: _s, ...rest } = DEFAULT_SETTINGS;
  return { ...rest, hasClientId: false, hasClientSecret: false, encryptionAvailable: true };
})();

export class SettingsStore {
  constructor(
    private readonly api?: CredentialsApi,
    private readonly legacyStorage?: LegacyStorage
  ) {}

  private getApi(): CredentialsApi {
    const api = this.api ?? (typeof window !== 'undefined' ? window.electron?.credentials : undefined);
    if (!api) throw new Error('API des identifiants indisponible');
    return api;
  }

  private getLegacyStorage(): LegacyStorage | undefined {
    if (this.legacyStorage) return this.legacyStorage;
    try {
      return typeof localStorage !== 'undefined' ? localStorage : undefined;
    } catch {
      return undefined;
    }
  }

  /** Masked settings from the main process. */
  async load(): Promise<PublicEInvoicingSettings> {
    try {
      return await this.getApi().get();
    } catch (error) {
      console.error('Failed to load settings:', error);
      return { ...DEFAULT_PUBLIC_SETTINGS };
    }
  }

  /** Blank or missing clientId/clientSecret keep the stored value. */
  async save(input: EInvoicingSettingsInput): Promise<CredentialsResult> {
    try {
      return await this.getApi().save(input);
    } catch (error) {
      console.error('Failed to save settings:', error);
      return {
        ok: false,
        code: 'io',
        message: "Impossible d'enregistrer la configuration. Veuillez réessayer.",
      };
    }
  }

  async clear(): Promise<PublicEInvoicingSettings> {
    try {
      return await this.getApi().clear();
    } catch (error) {
      console.error('Failed to clear settings:', error);
      return { ...DEFAULT_PUBLIC_SETTINGS };
    }
  }

  /**
   * One-time migration of legacy clear-text settings from localStorage.
   * Returns null when there is nothing to migrate. The legacy entry is
   * always deleted once handed over, even when encryption is unavailable (in
   * that case only the non-secret settings are kept and an error is returned).
   * It is kept only on an I/O failure so the migration can be retried.
   */
  async migrateLegacy(): Promise<CredentialsResult | null> {
    const storage = this.getLegacyStorage();
    if (!storage) return null;

    let raw: string | null;
    try {
      raw = storage.getItem(LEGACY_STORAGE_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;

    const remove = () => {
      try {
        storage.removeItem(LEGACY_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    };

    let legacy: Partial<EInvoicingSettings> | undefined;
    try {
      legacy = JSON.parse(raw)?.settings;
    } catch {
      legacy = undefined;
    }
    if (!legacy || typeof legacy !== 'object') {
      remove();
      return null;
    }

    const api = this.getApi();
    const result = await api.importLegacy(legacy);
    if (!result.ok && result.code === 'encryption-unavailable') {
      const { clientId: _i, clientSecret: _s, ...nonSecret } = legacy;
      await api.importLegacy(nonSecret);
      remove();
      return result;
    }
    if (result.ok) remove();
    return result;
  }

  /**
   * Get the default API endpoint for a platform and environment
   */
  getDefaultEndpoint(platform: Platform, environment: Environment): string {
    return PLATFORM_ENDPOINTS[platform][environment];
  }

  /**
   * Validate the form. Stored secrets count as present (blank = keep).
   */
  validate(
    settings: EInvoicingSettingsInput,
    existing: { hasClientId?: boolean; hasClientSecret?: boolean } = {}
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (settings.enabled) {
      if (!settings.apiEndpoint || !settings.apiEndpoint.trim()) {
        errors.push("L'adresse de l'API est obligatoire");
      } else if (!this.isValidUrl(settings.apiEndpoint)) {
        errors.push("L'adresse de l'API doit être une URL valide");
      }

      if (
        settings.platform !== 'other' &&
        !settings.clientId?.trim() &&
        !existing.hasClientId
      ) {
        errors.push("L'identifiant client (Client ID) est obligatoire");
      }

      if (!settings.clientSecret?.trim() && !existing.hasClientSecret) {
        errors.push('Le secret client est obligatoire');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  async isConfigured(): Promise<boolean> {
    const s = await this.load();
    return s.enabled && !!s.apiEndpoint && s.hasClientId && s.hasClientSecret;
  }
}

// Singleton instance
export const settingsStore = new SettingsStore();

// Export convenience functions
export const loadSettings = () => settingsStore.load();
export const saveSettings = (settings: EInvoicingSettingsInput) => settingsStore.save(settings);
export const clearSettings = () => settingsStore.clear();
export const migrateLegacySettings = () => settingsStore.migrateLegacy();
export const validateSettings = (
  settings: EInvoicingSettingsInput,
  existing?: { hasClientId?: boolean; hasClientSecret?: boolean }
) => settingsStore.validate(settings, existing);
export const isSettingsConfigured = () => settingsStore.isConfigured();
