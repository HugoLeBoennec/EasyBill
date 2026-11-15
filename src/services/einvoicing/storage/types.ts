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

/** Settings the renderer may hold: never contains a stored secret. */
export type PublicEInvoicingSettings = Omit<EInvoicingSettings, 'clientId' | 'clientSecret'> & {
  hasClientId: boolean;
  hasClientSecret: boolean;
  /** False when the OS cannot encrypt (e.g. Linux without keyring). */
  encryptionAvailable: boolean;
};

/** Payload sent to the main process. Blank/undefined secret = keep current. */
export type EInvoicingSettingsInput = Omit<EInvoicingSettings, 'clientId' | 'clientSecret'> & {
  clientId?: string;
  clientSecret?: string;
};

export type CredentialsErrorCode = 'encryption-unavailable' | 'io' | 'invalid';

export type CredentialsResult =
  | { ok: true; settings: PublicEInvoicingSettings }
  | { ok: false; code: CredentialsErrorCode; message: string };

export const ENCRYPTION_UNAVAILABLE_MESSAGE =
  "Le chiffrement sécurisé n'est pas disponible sur ce système (trousseau de clés absent). " +
  'Les identifiants ne peuvent pas être enregistrés.';

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
