/**
 * Quote Export Handlers
 *
 * Loads a quote with its lines and parties, maps it, generates the plain PDF
 * ("DEVIS", not Factur-X) and writes it where the user chooses.
 * Channel: quote:export (quoteId) -> { success, data: { canceled, path, warnings } }
 */

import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { SaveDialogOptions } from 'electron';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { DatabaseService } from '../database';
import { pdfGenerator } from '../services/einvoicing/formats/pdf-generator';
import {
  buildQuoteFilename,
  getQuoteExportWarnings,
  mapQuoteToDocument,
  QuoteMappingError,
} from './quote-mapper';
import type { QuoteExportSource } from './quote-mapper';

export interface QuoteExportResult {
  /** True when the user closed the save dialog without choosing a file */
  canceled: boolean;
  /** Absolute path of the written file (absent when canceled) */
  path?: string;
  /** Non-blocking remarks, French texts */
  warnings: string[];
}

function toFrenchError(error: unknown): string {
  if (error instanceof QuoteMappingError) return error.errors.join('\n');
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
  return `Échec de l'export du devis : ${message}`;
}

function loadQuoteSource(db: DatabaseService, quoteId: number): QuoteExportSource {
  const quote = db.quotes.findById(quoteId);
  if (!quote) throw new QuoteMappingError(['Devis introuvable.']);

  const lines = db.quotes.getLines(quoteId);
  // Seller: the company party of the application
  const seller = db.parties.findAll({ party_type: 'company' })[0];
  const buyer = quote.customer_id ? db.parties.findById(quote.customer_id) : undefined;
  return { quote, lines, seller, buyer };
}

/** Generate the quote PDF (no dialog, no file written). */
export async function generateQuoteDocument(
  db: DatabaseService,
  quoteId: number
): Promise<{ data: Uint8Array; defaultFilename: string; warnings: string[] }> {
  const source = loadQuoteSource(db, quoteId);
  const { model, validUntil } = mapQuoteToDocument(source);
  const data = await pdfGenerator.generateQuote(model, { language: 'fr', validUntil });
  if (data.length === 0) throw new Error('le générateur a produit un document vide');
  return {
    data,
    defaultFilename: buildQuoteFilename(source.quote.quote_number),
    warnings: getQuoteExportWarnings(source),
  };
}

export function registerQuoteExportHandlers(getDB: () => DatabaseService): void {
  ipcMain.handle('quote:export', async (event, quoteId: number) => {
    try {
      const { data, defaultFilename, warnings } = await generateQuoteDocument(getDB(), Number(quoteId));

      const options: SaveDialogOptions = {
        title: 'Exporter le devis',
        defaultPath: defaultFilename,
        filters: [{ name: 'Devis PDF', extensions: ['pdf'] }],
        properties: ['showOverwriteConfirmation', 'createDirectory'],
      };
      const win = BrowserWindow.fromWebContents(event.sender);
      const choice = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);

      if (choice.canceled || !choice.filePath) {
        const canceled: QuoteExportResult = { canceled: true, warnings: [] };
        return { success: true, data: canceled };
      }

      const filePath =
        path.extname(choice.filePath).toLowerCase() === '.pdf' ? choice.filePath : `${choice.filePath}.pdf`;
      await fs.writeFile(filePath, data);

      const exported: QuoteExportResult = { canceled: false, path: filePath, warnings };
      return { success: true, data: exported };
    } catch (error: unknown) {
      if (!(error instanceof QuoteMappingError)) console.error('Quote export failed:', error);
      return { success: false, error: toFrenchError(error) };
    }
  });
}
