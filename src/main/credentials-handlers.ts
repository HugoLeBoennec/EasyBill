/**
 * Credentials IPC handlers: thin Electron wrapper around credentials-store.
 * Secrets are encrypted with safeStorage and never sent back to the renderer.
 */

import { app, ipcMain, safeStorage } from 'electron';
import * as path from 'path';
import { createCredentialsStore, type CredentialsStore } from './credentials-store';
import type { EInvoicingSettings, EInvoicingSettingsInput } from '../services/einvoicing/storage/types';

let store: CredentialsStore | null = null;

function getStore(): CredentialsStore {
  if (!store) {
    store = createCredentialsStore({
      filePath: path.join(app.getPath('userData'), 'einvoicing-credentials.json'),
      crypto: {
        isAvailable: () => safeStorage.isEncryptionAvailable(),
        encrypt: (s) => safeStorage.encryptString(s),
        decrypt: (b) => safeStorage.decryptString(b),
      },
    });
  }
  return store;
}

export function registerCredentialsHandlers(): void {
  ipcMain.handle('credentials:get', async () => getStore().get());
  ipcMain.handle('credentials:save', async (_, input: EInvoicingSettingsInput) =>
    getStore().save(input)
  );
  ipcMain.handle('credentials:clear', async () => getStore().clear());
  ipcMain.handle('credentials:importLegacy', async (_, legacy: Partial<EInvoicingSettings>) =>
    getStore().importLegacy(legacy)
  );
}
