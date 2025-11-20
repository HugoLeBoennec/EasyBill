/**
 * E-Invoicing Storage Types
 */

export type Platform = 'chorus-pro' | 'tiime' | 'pennylane' | 'sage' | 'other';
export type InvoiceFormat = 'facturx' | 'ubl' | 'cii';
export type Environment = 'production' | 'qualification';

export interface EInvoicingSettings {
  enabled: boolean;
  platform: Platform;
  apiEndpoint: string;
  clientId: string;
  clientSecret: string;
  environment: Environment;
  defaultFormat: InvoiceFormat;
  autoSend: boolean;
  offlineMode: boolean;
}

export const DEFAULT_SETTINGS: EInvoicingSettings = {
  enabled: false,
  platform: 'chorus-pro',
  apiEndpoint: '',
  clientId: '',
  clientSecret: '',
  environment: 'qualification',
  defaultFormat: 'facturx',
  autoSend: false,
  offlineMode: true,
};

export const PLATFORM_ENDPOINTS: Record<Platform, { production: string; qualification: string }> = {
  'chorus-pro': {
    production: 'https://api.piste.gouv.fr/cpro/v1',
    qualification: 'https://api-qualif.piste.gouv.fr/cpro/v1',
  },
  'tiime': {
    production: 'https://api.tiime.fr/v1',
    qualification: 'https://api-sandbox.tiime.fr/v1',
  },
  'pennylane': {
    production: 'https://api.pennylane.com/v1',
    qualification: 'https://api-sandbox.pennylane.com/v1',
  },
  'sage': {
    production: 'https://api.sage.com/v1',
    qualification: 'https://api-sandbox.sage.com/v1',
  },
  'other': {
    production: '',
    qualification: '',
  },
};
