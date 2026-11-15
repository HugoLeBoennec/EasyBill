import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createCredentialsStore, type CredentialsCrypto } from '../credentials-store';
import { DEFAULT_SETTINGS, type EInvoicingSettingsInput } from '../../services/einvoicing/storage/types';

function fakeCrypto(available = true): CredentialsCrypto {
  return {
    isAvailable: () => available,
    encrypt: (s) => Buffer.from('ENC:' + Buffer.from(s).reverse().toString('hex')),
    decrypt: (b) => {
      const str = b.toString();
      if (!str.startsWith('ENC:')) throw new Error('bad');
      return Buffer.from(str.slice(4), 'hex').reverse().toString();
    },
  };
}

const { clientId: _i, clientSecret: _s, ...PUBLIC } = DEFAULT_SETTINGS;
const input = (o: Partial<EInvoicingSettingsInput> = {}): EInvoicingSettingsInput => ({
  ...PUBLIC,
  enabled: true,
  apiEndpoint: 'https://api.example.com',
  clientId: 'my-client-id',
  clientSecret: 'my-super-secret',
  ...o,
});

describe('credentials-store', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-'));
    file = path.join(dir, 'sub', 'creds.json');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns defaults when nothing is stored', () => {
    const s = createCredentialsStore({ filePath: file, crypto: fakeCrypto() }).get();
    expect(s).toMatchObject({ ...PUBLIC, hasClientId: false, hasClientSecret: false });
  });

  it('round trips: secrets decrypt in main, never in clear on disk', () => {
    const store = createCredentialsStore({ filePath: file, crypto: fakeCrypto() });
    const res = store.save(input());
    expect(res.ok).toBe(true);
    expect(store.getSecrets()).toEqual({ clientId: 'my-client-id', clientSecret: 'my-super-secret' });
    const raw = fs.readFileSync(file, 'utf8');
    expect(raw).not.toContain('my-super-secret');
    expect(raw).not.toContain('my-client-id');
    expect(raw).toContain('https://api.example.com');
  });

  it('masks secrets in what the renderer receives', () => {
    const store = createCredentialsStore({ filePath: file, crypto: fakeCrypto() });
    const res = store.save(input());
    const json = JSON.stringify([res, store.get()]);
    expect(json).not.toContain('my-super-secret');
    expect(json).not.toContain('my-client-id');
    expect(store.get()).toMatchObject({ hasClientId: true, hasClientSecret: true, enabled: true });
  });

  it('keeps current secrets when blank or missing', () => {
    const store = createCredentialsStore({ filePath: file, crypto: fakeCrypto() });
    store.save(input());
    store.save(input({ clientId: '', clientSecret: '  ', autoSend: true }));
    expect(store.getSecrets()).toEqual({ clientId: 'my-client-id', clientSecret: 'my-super-secret' });
    store.save(input({ clientId: undefined, clientSecret: undefined, autoSend: true }));
    expect(store.getSecrets().clientSecret).toBe('my-super-secret');
    expect(store.get().autoSend).toBe(true);
  });

  it('replaces a secret when a new one is given', () => {
    const store = createCredentialsStore({ filePath: file, crypto: fakeCrypto() });
    store.save(input());
    store.save(input({ clientSecret: 'new-secret' }));
    expect(store.getSecrets()).toEqual({ clientId: 'my-client-id', clientSecret: 'new-secret' });
  });

  it('clear removes everything', () => {
    const store = createCredentialsStore({ filePath: file, crypto: fakeCrypto() });
    store.save(input());
    const cleared = store.clear();
    expect(cleared.hasClientSecret).toBe(false);
    expect(fs.existsSync(file)).toBe(false);
    expect(store.get().enabled).toBe(false);
    expect(store.getSecrets().clientSecret).toBe('');
  });

  it('treats a corrupted file as empty and can overwrite it', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{not json');
    const store = createCredentialsStore({ filePath: file, crypto: fakeCrypto() });
    expect(store.get()).toMatchObject({ hasClientSecret: false, enabled: false });
    expect(store.save(input()).ok).toBe(true);
    expect(store.get().hasClientSecret).toBe(true);
  });

  it('treats undecryptable secrets as absent', () => {
    const store = createCredentialsStore({ filePath: file, crypto: fakeCrypto() });
    store.save(input());
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.secrets = Buffer.from('garbage').toString('base64');
    fs.writeFileSync(file, JSON.stringify(data));
    expect(store.get()).toMatchObject({ hasClientSecret: false, enabled: true });
  });

  describe('encryption unavailable', () => {
    it('refuses to store secrets and writes nothing', () => {
      const store = createCredentialsStore({ filePath: file, crypto: fakeCrypto(false) });
      const res = store.save(input());
      expect(res).toMatchObject({ ok: false, code: 'encryption-unavailable' });
      if (!res.ok) expect(res.message).toMatch(/chiffrement/);
      expect(fs.existsSync(file)).toBe(false);
      expect(store.get().encryptionAvailable).toBe(false);
    });

    it('still saves non-secret settings', () => {
      const store = createCredentialsStore({ filePath: file, crypto: fakeCrypto(false) });
      const res = store.save(input({ clientId: '', clientSecret: '', platform: 'sage' }));
      expect(res.ok).toBe(true);
      expect(store.get().platform).toBe('sage');
    });
  });

  describe('importLegacy', () => {
    const legacy = { ...DEFAULT_SETTINGS, enabled: true, apiEndpoint: 'https://x.io', clientId: 'old-id', clientSecret: 'old-secret' };

    it('imports encrypted when nothing is stored', () => {
      const store = createCredentialsStore({ filePath: file, crypto: fakeCrypto() });
      const res = store.importLegacy(legacy);
      expect(res.ok).toBe(true);
      expect(store.getSecrets()).toEqual({ clientId: 'old-id', clientSecret: 'old-secret' });
      expect(fs.readFileSync(file, 'utf8')).not.toContain('old-secret');
    });

    it('does not overwrite an existing configuration', () => {
      const store = createCredentialsStore({ filePath: file, crypto: fakeCrypto() });
      store.save(input());
      store.importLegacy(legacy);
      expect(store.getSecrets().clientSecret).toBe('my-super-secret');
    });

    it('refuses when encryption is unavailable', () => {
      const store = createCredentialsStore({ filePath: file, crypto: fakeCrypto(false) });
      expect(store.importLegacy(legacy)).toMatchObject({ ok: false, code: 'encryption-unavailable' });
      expect(fs.existsSync(file)).toBe(false);
    });
  });
});
