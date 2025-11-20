/**
 * E-Invoicing Settings Storage Service
 *
 * Handles persistence of e-invoicing configuration using localStorage.
 * In a production app, this would use Electron's safeStorage for credentials.
 */

import {
  EInvoicingSettings,
  DEFAULT_SETTINGS,
  PLATFORM_ENDPOINTS,
  Platform,
  Environment,
} from './types';

const STORAGE_KEY = 'einvoicing_settings';
const STORAGE_VERSION = 1;

interface StorageData {
  version: number;
  settings: EInvoicingSettings;
  lastUpdated: string;
}

export class SettingsStore {
  /**
   * Load settings from localStorage
   */
  load(): EInvoicingSettings {
    try {
      const data = localStorage.getItem(STORAGE_KEY);

      if (!data) {
        return { ...DEFAULT_SETTINGS };
      }

      const parsed: StorageData = JSON.parse(data);

      // Version check and migration
      if (parsed.version !== STORAGE_VERSION) {
        console.warn('Settings version mismatch, using defaults');
        return { ...DEFAULT_SETTINGS };
      }

      return parsed.settings;
    } catch (error) {
      console.error('Failed to load settings:', error);
      return { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Save settings to localStorage
   */
  save(settings: EInvoicingSettings): void {
    try {
      const data: StorageData = {
        version: STORAGE_VERSION,
        settings,
        lastUpdated: new Date().toISOString(),
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw new Error('Failed to save settings. Please try again.');
    }
  }

  /**
   * Clear all settings (reset to defaults)
   */
  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear settings:', error);
    }
  }

  /**
   * Get the default API endpoint for a platform and environment
   */
  getDefaultEndpoint(platform: Platform, environment: Environment): string {
    const endpoints = PLATFORM_ENDPOINTS[platform];
    return endpoints[environment];
  }

  /**
   * Validate settings before saving
   */
  validate(settings: EInvoicingSettings): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (settings.enabled) {
      // API endpoint is required when enabled
      if (!settings.apiEndpoint || !settings.apiEndpoint.trim()) {
        errors.push('API endpoint is required');
      } else if (!this.isValidUrl(settings.apiEndpoint)) {
        errors.push('API endpoint must be a valid URL');
      }

      // Client ID is required for most platforms
      if (settings.platform !== 'other' && !settings.clientId.trim()) {
        errors.push('Client ID is required');
      }

      // Client secret is required
      if (!settings.clientSecret.trim()) {
        errors.push('Client secret is required');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if a string is a valid URL
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Export settings as JSON (for backup)
   */
  export(): string {
    const settings = this.load();
    return JSON.stringify(settings, null, 2);
  }

  /**
   * Import settings from JSON
   */
  import(json: string): void {
    try {
      const settings = JSON.parse(json) as EInvoicingSettings;

      // Validate imported settings
      const validation = this.validate(settings);
      if (!validation.valid) {
        throw new Error(`Invalid settings: ${validation.errors.join(', ')}`);
      }

      this.save(settings);
    } catch (error) {
      console.error('Failed to import settings:', error);
      throw new Error('Failed to import settings. Invalid format.');
    }
  }

  /**
   * Check if settings are configured (has API credentials)
   */
  isConfigured(): boolean {
    const settings = this.load();
    return (
      settings.enabled &&
      !!settings.apiEndpoint &&
      !!settings.clientId &&
      !!settings.clientSecret
    );
  }

  /**
   * Get settings summary for display
   */
  getSummary(): {
    enabled: boolean;
    platform: string;
    environment: string;
    format: string;
    configured: boolean;
  } {
    const settings = this.load();

    return {
      enabled: settings.enabled,
      platform: settings.platform,
      environment: settings.environment,
      format: settings.defaultFormat,
      configured: this.isConfigured(),
    };
  }
}

// Singleton instance
export const settingsStore = new SettingsStore();

// Export convenience functions
export const loadSettings = () => settingsStore.load();
export const saveSettings = (settings: EInvoicingSettings) => settingsStore.save(settings);
export const clearSettings = () => settingsStore.clear();
export const validateSettings = (settings: EInvoicingSettings) => settingsStore.validate(settings);
export const isSettingsConfigured = () => settingsStore.isConfigured();
export const getSettingsSummary = () => settingsStore.getSummary();
