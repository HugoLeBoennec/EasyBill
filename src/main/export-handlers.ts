/**
 * Invoice Export Handlers
 *
 * Loads a complete invoice from the database, maps it to the generators'
 * model, generates the requested document (Factur-X PDF, Factur-X XML, UBL
 * XML) and writes it where the user chooses (native save dialog).
 */

import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { SaveDialogOptions } from 'electron';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { DatabaseService } from '../database';
import { invoiceGenerator } from '../services/einvoicing/formats/invoice-generator';
import {
  buildExportFilename,
  INVOICE_EXPORT_FORMATS,
  InvoiceMappingError,
  mapInvoiceToEN16931,
} from './invoice-mapper';
import type { InvoiceExportFormat, InvoiceExportSource } from './invoice-mapper';

export interface InvoiceExportResult {
  /** True when the user closed the save dialog without choosing a file */
  canceled: boolean;
  /** Absolute path of the written file (absent when canceled) */
  path?: string;
  format: InvoiceExportFormat;
}

const DIALOG_FILTERS: Record<InvoiceExportFormat, { name: string; extensions: string[] }> = {
  'facturx-pdf': { name: 'Facture PDF (Factur-X)', extensions: ['pdf'] },
  'facturx-xml': { name: 'Factur-X XML (CII)', extensions: ['xml'] },
  ubl: { name: 'UBL 2.1 XML', extensions: ['xml'] },
};

/** Turn generator / file system errors into a message the user can act on. */
function toFrenchError(error: unknown): string {
  if (error instanceof InvoiceMappingError) {
    return error.errors.join('\n');
  }
  const message = error instanceof Error ? error.message : String(error);

  const encoding = message.match(/WinAnsi cannot encode "(.*?)"/);
  if (encoding) {
    return `Le PDF ne peut pas être généré : le caractère « ${encoding[1]} » n'est pas pris en charge. Retirez-le des désignations, des notes ou des coordonnées, puis réessayez.`;
  }
  if (/EACCES|EPERM|EBUSY|EROFS/.test(message)) {
    return "Impossible d'écrire le fichier à cet emplacement (accès refusé ou fichier ouvert dans une autre application).";
  }
  if (/ENOSPC/.test(message)) {
    return "Impossible d'écrire le fichier : espace disque insuffisant.";
  }
  return `Échec de l'export de la facture : ${message}`;
}

/** Load the invoice, its lines and both parties. */
function loadExportSource(db: DatabaseService, invoiceId: number): InvoiceExportSource {
  const invoice = db.invoices.findById(invoiceId);
  if (!invoice) {
    throw new InvoiceMappingError(['Facture introuvable.']);
  }

  const lines = db.invoices.findLinesByInvoiceId(invoiceId);

  // Seller: the party referenced by the invoice, otherwise the company party
  let seller = invoice.seller_id ? db.parties.findById(invoice.seller_id) : undefined;
  if (!seller) {
    seller = db.parties.findAll({ party_type: 'company' })[0];
  }
  const buyer = invoice.buyer_id ? db.parties.findById(invoice.buyer_id) : undefined;

  return { invoice, lines, seller, buyer };
}

/**
 * Generate the document for an invoice (no dialog, no file written).
 * Exported so that it can be reused (e.g. PA transmission) and tested.
 */
export async function generateInvoiceDocument(
  db: DatabaseService,
  invoiceId: number,
  format: InvoiceExportFormat
): Promise<{ data: Uint8Array | string; defaultFilename: string }> {
  if (!INVOICE_EXPORT_FORMATS.includes(format)) {
    throw new InvoiceMappingError([`Format d'export non pris en charge : ${String(format)}.`]);
  }

  const source = loadExportSource(db, invoiceId);
  if (source.invoice.status === 'draft') {
    throw new InvoiceMappingError([
      "Cette facture est encore un brouillon : elle n'a pas de numéro définitif. Finalisez-la avant de l'exporter.",
    ]);
  }

  const model = mapInvoiceToEN16931(source);
  const result = await invoiceGenerator.generate(model, {
    format,
    language: 'fr',
    prettyPrint: true,
  });

  if (!result.success || result.data === undefined) {
    throw new Error((result.errors || []).join(', ') || 'erreur inconnue du générateur');
  }
  if (result.data.length === 0) {
    throw new Error('le générateur a produit un document vide');
  }

  return {
    data: result.data,
    defaultFilename: buildExportFilename(source.invoice.invoice_number, format),
  };
}

/**
 * Register the export IPC handlers.
 * Channel: invoice:export (invoiceId, format) -> { success, data: { canceled, path, format } }
 */
export function registerExportHandlers(getDB: () => DatabaseService): void {
  ipcMain.handle(
    'invoice:export',
    async (event, invoiceId: number, format: InvoiceExportFormat = 'facturx-pdf') => {
      try {
        const { data, defaultFilename } = await generateInvoiceDocument(
          getDB(),
          Number(invoiceId),
          format
        );

        const options: SaveDialogOptions = {
          title: 'Exporter la facture',
          defaultPath: defaultFilename,
          filters: [DIALOG_FILTERS[format]],
          properties: ['showOverwriteConfirmation', 'createDirectory'],
        };
        const win = BrowserWindow.fromWebContents(event.sender);
        const choice = win
          ? await dialog.showSaveDialog(win, options)
          : await dialog.showSaveDialog(options);

        if (choice.canceled || !choice.filePath) {
          const canceled: InvoiceExportResult = { canceled: true, format };
          return { success: true, data: canceled };
        }

        // Make sure the file carries the right extension
        const extension = `.${DIALOG_FILTERS[format].extensions[0]}`;
        const filePath =
          path.extname(choice.filePath).toLowerCase() === extension
            ? choice.filePath
            : `${choice.filePath}${extension}`;

        if (typeof data === 'string') {
          await fs.writeFile(filePath, data, 'utf-8');
        } else {
          await fs.writeFile(filePath, data);
        }

        const exported: InvoiceExportResult = { canceled: false, path: filePath, format };
        return { success: true, data: exported };
      } catch (error: unknown) {
        console.error('Invoice export failed:', error);
        return { success: false, error: toFrenchError(error) };
      }
    }
  );
}
