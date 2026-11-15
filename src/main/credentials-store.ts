/**
 * E-invoicing credentials store (pure, no electron import).
 *
 * Non-secret settings are kept in clear in a JSON file; clientId and
 * clientSecret live in a single blob encrypted through the injected
 * `crypto` functions (Electron safeStorage in production). The renderer only
 * ever gets masked settings (`hasClientId` / `hasClientSecret`).
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_SETTINGS,
  ENCRYPTION_UNAVAILABLE_MESSAGE,
  type CredentialsResult,
  type EInvoicingSettings,
  type EInvoicingSettingsInput,
  type PublicEInvoicingSettings,
} from '../services/einvoicing/storage/types';

export interface CredentialsCrypto {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(data: Buffer): string;
}

interface Secrets {
  clientId: string;
  clientSecret: string;
}

interface FileData {
  version: 1;
  settings: Omit<EInvoicingSettings, 'clientId' | 'clientSecret'>;
  /** base64 of the encrypted JSON of Secrets, or null when none stored */
  secrets: string | null;
}

type PublicPart = FileData['settings'];

function publicDefaults(): PublicPart {
  const { clientId: _i, clientSecret: _s, ...rest } = DEFAULT_SETTINGS;
  return rest;
}

function pickPublic(src: Partial<PublicPart>): PublicPart {
  const d = publicDefaults();
  return {
    enabled: typeof src.enabled === 'boolean' ? src.enabled : d.enabled,
    platform: src.platform ?? d.platform,
    apiEndpoint: typeof src.apiEndpoint === 'string' ? src.apiEndpoint : d.apiEndpoint,
    environment: src.environment ?? d.environment,
    defaultFormat: src.defaultFormat ?? d.defaultFormat,
    autoSend: typeof src.autoSend === 'boolean' ? src.autoSend : d.autoSend,
    offlineMode: typeof src.offlineMode === 'boolean' ? src.offlineMode : d.offlineMode,
  };
}

export function createCredentialsStore(opts: { filePath: string; crypto: CredentialsCrypto }) {
  const { filePath, crypto } = opts;

  function readFile(): { data: FileData | null; exists: boolean } {
    let raw: string;
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch {
      return { data: null, exists: false };
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1 || typeof parsed.settings !== 'object') {
        return { data: null, exists: true };
      }
      return {
        data: {
          version: 1,
          settings: pickPublic(parsed.settings),
          secrets: typeof parsed.secrets === 'string' ? parsed.secrets : null,
        },
        exists: true,
      };
    } catch {
      return { data: null, exists: true }; // corrupted: behave as empty
    }
  }

  function readSecrets(data: FileData | null): Secrets {
    const empty: Secrets = { clientId: '', clientSecret: '' };
    if (!data?.secrets || !crypto.isAvailable()) return empty;
    try {
      const obj = JSON.parse(crypto.decrypt(Buffer.from(data.secrets, 'base64')));
      return {
        clientId: typeof obj.clientId === 'string' ? obj.clientId : '',
        clientSecret: typeof obj.clientSecret === 'string' ? obj.clientSecret : '',
      };
    } catch {
      return empty; // undecryptable (keyring changed) or corrupted
    }
  }

  function toPublic(settings: PublicPart, secrets: Secrets): PublicEInvoicingSettings {
    return {
      ...settings,
      hasClientId: !!secrets.clientId,
      hasClientSecret: !!secrets.clientSecret,
      encryptionAvailable: crypto.isAvailable(),
    };
  }

  function writeFile(data: FileData): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, filePath);
  }

  function persist(settings: PublicPart, secrets: Secrets): CredentialsResult {
    const hasSecrets = !!(secrets.clientId || secrets.clientSecret);
    if (hasSecrets && !crypto.isAvailable()) {
      return { ok: false, code: 'encryption-unavailable', message: ENCRYPTION_UNAVAILABLE_MESSAGE };
    }
    try {
      const blob = hasSecrets
        ? crypto.encrypt(JSON.stringify(secrets)).toString('base64')
        : null;
      writeFile({ version: 1, settings, secrets: blob });
    } catch {
      return {
        ok: false,
        code: 'io',
        message: "Impossible d'enregistrer la configuration. Veuillez réessayer.",
      };
    }
    return { ok: true, settings: toPublic(settings, secrets) };
  }

  return {
    /** Masked settings; never contains a secret. */
    get(): PublicEInvoicingSettings {
      const { data } = readFile();
      return toPublic(data?.settings ?? publicDefaults(), readSecrets(data));
    },

    /** Save; undefined or blank secret keeps the current one. */
    save(input: EInvoicingSettingsInput): CredentialsResult {
      const { data } = readFile();
      const current = readSecrets(data);
      const next: Secrets = {
        clientId: input.clientId?.trim() ? input.clientId.trim() : current.clientId,
        clientSecret: input.clientSecret?.trim() ? input.clientSecret : current.clientSecret,
      };
      return persist(pickPublic(input), next);
    },

    /** Remove everything (settings and secrets). */
    clear(): PublicEInvoicingSettings {
      try {
        fs.rmSync(filePath, { force: true });
      } catch {
        /* ignore */
      }
      return toPublic(publicDefaults(), { clientId: '', clientSecret: '' });
    },

    /**
     * One-shot import of legacy clear-text settings. Ignored when a valid
     * configuration is already stored.
     */
    importLegacy(legacy: Partial<EInvoicingSettings>): CredentialsResult {
      const { data } = readFile();
      if (data) return { ok: true, settings: toPublic(data.settings, readSecrets(data)) };
      return persist(pickPublic(legacy), {
        clientId: typeof legacy.clientId === 'string' ? legacy.clientId.trim() : '',
        clientSecret: typeof legacy.clientSecret === 'string' ? legacy.clientSecret : '',
      });
    },

    /** Main-process only (future transmission code). Never expose over IPC. */
    getSecrets(): Secrets {
      return readSecrets(readFile().data);
    },
  };
}

export type CredentialsStore = ReturnType<typeof createCredentialsStore>;
