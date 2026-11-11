import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';

// Electron is not available under vitest: capture the registered handlers and
// script the save dialog.
const electronMock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  showSaveDialog: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      electronMock.handlers.set(channel, handler);
    },
  },
  dialog: { showSaveDialog: electronMock.showSaveDialog },
  BrowserWindow: { fromWebContents: () => null },
}));

import schemaSql from '../../database/schema.sql?raw';
import { runMigrations } from '../../database/database-manager';
import { InvoiceRepository } from '../../database/repositories/invoice-repository';
import { PartyRepository } from '../../database/repositories/party-repository';
import type { DatabaseService } from '../../database';
import { registerExportHandlers } from '../export-handlers';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easybill-export-'));

let db: Database.Database;
let service: DatabaseService;
let invoiceId: number;

const exportInvoice = (id: number, format?: string) =>
  electronMock.handlers.get('invoice:export')!({ sender: {} }, id, format);

function configureCompany(): void {
  service.parties.update(1, {
    legal_name: 'Dupont Conseil EURL',
    siret: '73282932000074',
    vat_number: 'FR44732829320',
    address_line1: '12 rue de la Paix',
    postal_code: '75002',
    city: 'Paris',
  });
}

beforeEach(() => {
  // Same initialisation as the application: schema.sql then the migrations
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(schemaSql);
  runMigrations(db);
  service = {
    invoices: new InvoiceRepository(db),
    parties: new PartyRepository(db),
  } as unknown as DatabaseService;

  const customerId = Number(
    db
      .prepare(
        "INSERT INTO parties (party_type, legal_name, country_code, active) VALUES ('customer', 'Client & Fils SARL', 'FR', 1)"
      )
      .run().lastInsertRowid
  );
  service.parties.update(customerId, {
    address_line1: '5 avenue des Champs',
    postal_code: '69001',
    city: 'Lyon',
  });

  invoiceId = service.invoices.saveDraft(
    null,
    { invoice_date: '2026-03-15', due_date: '2026-04-14', buyer_id: customerId, notes: 'Merci' },
    [
      { item_name: 'Conseil <stratégie> & audit', quantity: 2, unit_price: 45000, vat_rate: 20 },
      { item_name: 'Livre', quantity: 3, unit_price: 1999, vat_rate: 5.5 },
    ]
  );

  electronMock.handlers.clear();
  electronMock.showSaveDialog.mockReset();
  registerExportHandlers(() => service);
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('invoice:export', () => {
  it('refuses to export a draft', async () => {
    configureCompany();
    const response = await exportInvoice(invoiceId, 'facturx-pdf');
    expect(response.success).toBe(false);
    expect(response.error).toMatch(/brouillon/);
    expect(electronMock.showSaveDialog).not.toHaveBeenCalled();
  });

  it('explains in French that the company is not configured', async () => {
    service.invoices.finalize(invoiceId);
    const response = await exportInvoice(invoiceId, 'facturx-pdf');
    expect(response).toEqual({
      success: false,
      error: expect.stringMatching(/votre entreprise ne sont pas configurées/),
    });
    expect(electronMock.showSaveDialog).not.toHaveBeenCalled();
  });

  it('reports an unknown invoice or format', async () => {
    configureCompany();
    service.invoices.finalize(invoiceId);
    expect((await exportInvoice(4242, 'ubl')).error).toBe('Facture introuvable.');
    expect((await exportInvoice(invoiceId, 'docx')).error).toMatch(/Format d'export non pris en charge/);
  });

  it('writes a Factur-X PDF where the user chose', async () => {
    configureCompany();
    service.invoices.finalize(invoiceId);
    const target = path.join(tmpDir, 'facture.pdf');
    electronMock.showSaveDialog.mockResolvedValue({ canceled: false, filePath: target });

    const response = await exportInvoice(invoiceId, 'facturx-pdf');

    expect(response).toEqual({
      success: true,
      data: { canceled: false, path: target, format: 'facturx-pdf' },
    });
    expect(electronMock.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'Facture-INV-2026-001.pdf' })
    );
    const bytes = fs.readFileSync(target);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('writes UBL and Factur-X XML, adding the extension when missing', async () => {
    configureCompany();
    service.invoices.finalize(invoiceId);

    for (const format of ['ubl', 'facturx-xml'] as const) {
      const target = path.join(tmpDir, `export-${format}`);
      electronMock.showSaveDialog.mockResolvedValue({ canceled: false, filePath: target });

      const response = await exportInvoice(invoiceId, format);

      expect(response.success).toBe(true);
      expect(response.data.path).toBe(`${target}.xml`);
      const xml = fs.readFileSync(`${target}.xml`, 'utf-8');
      expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
      expect(xml).toContain('INV-2026-001');
      expect(xml).toContain('Conseil &lt;stratégie&gt; &amp; audit');
      expect(xml).toContain('1143.27');
    }
  });

  it('exports a credit note as type 381 referencing the original invoice', async () => {
    configureCompany();
    service.invoices.finalize(invoiceId);
    const creditNoteId = service.invoices.createCreditNote(invoiceId);

    // Still a draft: no definitive number
    const draft = await exportInvoice(creditNoteId, 'ubl');
    expect(draft.success).toBe(false);
    expect(draft.error).toContain('avoir est encore un brouillon');

    service.invoices.finalize(creditNoteId);
    const number = service.invoices.findById(creditNoteId)!.invoice_number;
    expect(number).toMatch(/^AV-\d{4}-001$/);

    for (const format of ['ubl', 'facturx-xml'] as const) {
      const target = path.join(tmpDir, `avoir-${format}.xml`);
      electronMock.showSaveDialog.mockResolvedValue({ canceled: false, filePath: target });

      const response = await exportInvoice(creditNoteId, format);

      expect(response.success).toBe(true);
      expect(electronMock.showSaveDialog).toHaveBeenLastCalledWith(
        expect.objectContaining({
          title: "Exporter l'avoir",
          defaultPath: `Avoir-${number}-${format === 'ubl' ? 'ubl' : 'facturx'}.xml`,
        })
      );
      const xml = fs.readFileSync(target, 'utf-8');
      expect(xml).toContain(number);
      expect(xml).toMatch(/TypeCode>381</);
      expect(xml).not.toMatch(/TypeCode>380<\/(ram:TypeCode|cbc:InvoiceTypeCode)>\s*<(ram:IssueDateTime|cbc:Note|cbc:DocumentCurrencyCode)/);
      // Preceding invoice reference (BG-3) and positive amounts
      expect(xml).toContain('INV-2026-001');
      expect(xml).toContain('1143.27');
      expect(xml).not.toContain('-1143.27');
    }

    const pdfTarget = path.join(tmpDir, 'avoir.pdf');
    electronMock.showSaveDialog.mockResolvedValue({ canceled: false, filePath: pdfTarget });
    const pdf = await exportInvoice(creditNoteId, 'facturx-pdf');
    expect(pdf.success).toBe(true);
    expect(electronMock.showSaveDialog).toHaveBeenLastCalledWith(
      expect.objectContaining({ defaultPath: `Avoir-${number}.pdf` })
    );
  });

  it('writes nothing when the dialog is cancelled', async () => {
    configureCompany();
    service.invoices.finalize(invoiceId);
    electronMock.showSaveDialog.mockResolvedValue({ canceled: true, filePath: '' });

    const response = await exportInvoice(invoiceId, 'ubl');
    expect(response).toEqual({ success: true, data: { canceled: true, format: 'ubl' } });
  });

  it('turns write failures into a French error', async () => {
    configureCompany();
    service.invoices.finalize(invoiceId);
    electronMock.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: path.join(tmpDir, 'missing-dir', 'sub', 'facture.pdf'),
    });
    const response = await exportInvoice(invoiceId, 'facturx-pdf');
    expect(response.success).toBe(false);
    expect(response.error).toMatch(/^Échec de l'export de la facture/);
  });
});
