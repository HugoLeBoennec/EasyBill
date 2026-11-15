/**
 * Startup smoke test, used by CI on the packaged application.
 *
 * With EASYBILL_SMOKE_TEST=1 the app starts on a throwaway data folder,
 * checks that the window renders and that the renderer can reach the
 * database through the preload bridge, then exits: code 0 on success,
 * 1 on failure. It never runs for a normal launch.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { app, safeStorage } from 'electron';
import type { BrowserWindow } from 'electron';

const TIMEOUT_MS = 60_000;

export const isSmokeTest = process.env.EASYBILL_SMOKE_TEST === '1';

/**
 * The data folder is redirected here, at import time: this module is the
 * first import of main.ts, and the database module resolves its path as soon
 * as it is loaded. The real user data is therefore never touched.
 */
if (isSmokeTest) {
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'easybill-smoke-')));
}

function finish(ok: boolean, details: unknown): void {
  const line = `${ok ? 'SMOKE_OK' : 'SMOKE_FAILED'} ${JSON.stringify(details)}`;
  console.log(line);
  const resultFile = process.env.EASYBILL_SMOKE_RESULT;
  if (resultFile) {
    try {
      fs.writeFileSync(resultFile, `${line}\n`);
    } catch {
      // the exit code still carries the result
    }
  }
  app.exit(ok ? 0 : 1);
}

/** Script evaluated in the renderer: waits for React to render, then calls the bridge. */
const RENDERER_CHECK = `(async () => {
  const deadline = Date.now() + 20000;
  const root = () => document.getElementById('root');
  while (!(root() && root().children.length > 0) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const api = window.electron;
  const result = {
    rendered: !!(root() && root().children.length > 0),
    text: (document.body.innerText || '').slice(0, 120),
    bridge: !!api,
    company: false,
    stats: false,
    migration: null,
    errors: [],
  };
  if (!api) return result;
  try {
    const company = await api.party.getCompany();
    result.company = company.success === true;
    if (!company.success) result.errors.push('getCompany: ' + company.error);
    const stats = await api.database.getStats();
    result.stats = stats.success === true;
    if (!stats.success) result.errors.push('getStats: ' + stats.error);
    const info = await api.database.getInfo();
    result.migration = info.success ? info.data : null;
    if (!info.success) result.errors.push('getInfo: ' + info.error);
    const quotes = await api.quote.list();
    if (!quotes.success) result.errors.push('quote.list: ' + quotes.error);
    const invoices = await api.invoice.list();
    if (!invoices.success) result.errors.push('invoice.list: ' + invoices.error);
  } catch (error) {
    result.errors.push(String(error && error.message ? error.message : error));
  }
  return result;
})()`;

/** Guards the test itself: the database must live in the temporary folder. */
function isThrowawayDataFolder(result: { migration?: { path?: string } | null }): boolean {
  const dbPath = result.migration?.path ?? '';
  return path.resolve(dbPath).startsWith(path.resolve(app.getPath('userData')))
    && app.getPath('userData').includes('easybill-smoke-');
}

export function runSmokeTest(window: BrowserWindow): void {
  const timer = setTimeout(
    () => finish(false, { error: `timeout after ${TIMEOUT_MS} ms` }),
    TIMEOUT_MS,
  );

  window.webContents.on('did-fail-load', (_event, code, description) => {
    clearTimeout(timer);
    finish(false, { error: `page failed to load: ${code} ${description}` });
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    clearTimeout(timer);
    finish(false, { error: `renderer process gone: ${details.reason}` });
  });

  window.webContents.on('did-finish-load', async () => {
    try {
      const result = await window.webContents.executeJavaScript(RENDERER_CHECK, true);
      clearTimeout(timer);
      const ok =
        result.rendered &&
        result.bridge &&
        result.company &&
        result.stats &&
        result.errors.length === 0;
      finish(ok && isThrowawayDataFolder(result), { ...result, encryptionAvailable: safeStorage.isEncryptionAvailable() });
    } catch (error) {
      clearTimeout(timer);
      finish(false, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}
