/**
 * Settings IPC handlers
 *
 * Database backup / restore driven by native file dialogs.
 */

import { BrowserWindow, dialog, ipcMain } from 'electron';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import {
  databaseManager,
  DatabaseService,
  InvoiceRepository,
  EInvoiceRepository,
  PartyRepository,
  QuoteRepository,
} from '../database';

const DB_FILTERS = [
  { name: 'Sauvegarde EasyBill (SQLite)', extensions: ['db', 'sqlite'] },
  { name: 'Tous les fichiers', extensions: ['*'] },
];

/** Tables a file must contain to be accepted as an EasyBill database. */
const REQUIRED_TABLES = ['invoices', 'invoice_lines', 'parties'];

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(
    d.getHours()
  )}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function samePath(a: string, b: string): boolean {
  const norm = (p: string) => {
    const resolved = path.resolve(p);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return norm(a) === norm(b);
}

/**
 * Online backup of the live database (SQLite backup API, WAL-safe).
 * better-sqlite3's `backup()` returns a promise resolved once the copy is done.
 */
async function backupTo(destination: string): Promise<void> {
  await databaseManager.getConnection().backup(destination);
}

/**
 * Check that a file is a readable EasyBill SQLite database.
 * Returns an error message, or null when the file is acceptable.
 */
export function checkBackupFile(filePath: string): string | null {
  let candidate: Database.Database | null = null;
  try {
    candidate = new Database(filePath, { readonly: true, fileMustExist: true });
    const check = candidate.pragma('quick_check', { simple: true });
    if (check !== 'ok') {
      return 'Le fichier de sauvegarde est corrompu.';
    }
    const tables = (
      candidate
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as { name: string }[]
    ).map((row) => row.name);
    const missing = REQUIRED_TABLES.filter((t) => !tables.includes(t));
    if (missing.length > 0) {
      return "Ce fichier n'est pas une sauvegarde EasyBill (tables manquantes).";
    }
    return null;
  } catch {
    return "Ce fichier n'est pas une base de données SQLite lisible.";
  } finally {
    candidate?.close();
  }
}

/**
 * The repositories keep a reference to the connection they were created with.
 * A restore closes that connection and opens a new one, so they are rebuilt.
 */
function rebindRepositories(service: DatabaseService): void {
  const connection = databaseManager.getConnection();
  service.invoices = new InvoiceRepository(connection);
  service.einvoices = new EInvoiceRepository(connection);
  service.parties = new PartyRepository(connection);
  service.quotes = new QuoteRepository(connection);
}

export function registerSettingsHandlers(getDB: () => DatabaseService): void {
  // Backup: ask for a destination, then copy the live database there
  ipcMain.handle('db:backupWithDialog', async (event) => {
    try {
      getDB();
      const win = BrowserWindow.fromWebContents(event.sender);
      const options = {
        title: 'Sauvegarder la base de données',
        defaultPath: `easybill-sauvegarde-${timestamp()}.db`,
        filters: DB_FILTERS,
      };
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);

      if (result.canceled || !result.filePath) {
        return { success: true, data: { canceled: true } };
      }
      if (samePath(result.filePath, databaseManager.getInfo().path)) {
        return {
          success: false,
          error:
            'Choisissez un autre emplacement que le fichier de la base en cours.',
        };
      }

      await backupTo(result.filePath);
      return {
        success: true,
        data: { canceled: false, path: result.filePath },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Restore: pick a file, validate it, confirm, keep a safety copy, restore
  ipcMain.handle('db:restoreWithDialog', async (event) => {
    try {
      const service = getDB();
      const win = BrowserWindow.fromWebContents(event.sender);
      const openOptions = {
        title: 'Restaurer une sauvegarde',
        filters: DB_FILTERS,
        properties: ['openFile' as const],
      };
      const picked = win
        ? await dialog.showOpenDialog(win, openOptions)
        : await dialog.showOpenDialog(openOptions);

      if (picked.canceled || picked.filePaths.length === 0) {
        return { success: true, data: { canceled: true } };
      }
      const source = picked.filePaths[0];
      const livePath = databaseManager.getInfo().path;

      if (samePath(source, livePath)) {
        return {
          success: false,
          error: 'Ce fichier est la base de données en cours d\'utilisation.',
        };
      }
      const problem = checkBackupFile(source);
      if (problem) {
        return { success: false, error: problem };
      }

      const confirmOptions = {
        type: 'warning' as const,
        buttons: ['Annuler', 'Restaurer'],
        defaultId: 0,
        cancelId: 0,
        title: 'Restaurer une sauvegarde',
        message: 'Remplacer toutes les données actuelles ?',
        detail:
          `Les factures, devis et clients actuels seront remplacés par le contenu de :\n${source}\n\n` +
          'Une copie de la base actuelle sera conservée à côté de celle-ci avant la restauration.',
      };
      const confirmation = win
        ? await dialog.showMessageBox(win, confirmOptions)
        : await dialog.showMessageBox(confirmOptions);
      if (confirmation.response !== 1) {
        return { success: true, data: { canceled: true } };
      }

      // Safety copy of the current database, next to it
      const safetyCopy = path.join(
        path.dirname(livePath),
        `easybill-avant-restauration-${timestamp()}.db`
      );
      await backupTo(safetyCopy);

      try {
        await service.restore(source);
      } catch (restoreError: any) {
        // The connection may have been closed: put the previous data back
        try {
          databaseManager.close();
          fs.copyFileSync(safetyCopy, livePath);
          await databaseManager.initialize();
          rebindRepositories(service);
        } catch (rollbackError: any) {
          return {
            success: false,
            error: `${restoreError.message} — la base précédente est disponible ici : ${safetyCopy} (${rollbackError.message})`,
          };
        }
        return { success: false, error: restoreError.message };
      }

      rebindRepositories(service);
      return {
        success: true,
        data: { canceled: false, path: source, safetyCopy },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
