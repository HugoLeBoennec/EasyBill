/**
 * IPC Handlers for Database Operations
 *
 * Exposes database functionality to the renderer process
 */

import { ipcMain } from 'electron';
import { DatabaseService } from '../database';
import type {
  Invoice,
  InvoiceLine,
  Party,
  Quote,
  QuoteLine,
  EInvoiceMetadata,
  EInvoiceQueue,
  InvoiceFilter,
  PartyFilter,
  QuoteFilter,
  NewRecord,
  UpdateRecord,
} from '../database/types';

let db: DatabaseService | null = null;

/**
 * Initialize database and register IPC handlers
 */
export async function initializeIPC(): Promise<void> {
  // Initialize database
  db = await DatabaseService.initialize();
  console.log('Database initialized for IPC');

  // Register all IPC handlers
  registerInvoiceHandlers();
  registerPartyHandlers();
  registerQuoteHandlers();
  registerEInvoiceHandlers();
  registerDatabaseHandlers();

  console.log('IPC handlers registered');
}

/**
 * Get database instance (throws if not initialized)
 */
function getDB(): DatabaseService {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

// ============================================================================
// INVOICE HANDLERS
// ============================================================================

function registerInvoiceHandlers(): void {
  // Create invoice
  ipcMain.handle('invoice:create', async (_, invoice: NewRecord<Invoice>) => {
    try {
      const id = getDB().invoices.create(invoice);
      return { success: true, data: id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get invoice by ID
  ipcMain.handle('invoice:get', async (_, id: number) => {
    try {
      const invoice = getDB().invoices.findById(id);
      return { success: true, data: invoice };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get complete invoice with parties
  ipcMain.handle('invoice:getComplete', async (_, id: number) => {
    try {
      const invoice = getDB().invoices.findCompleteById(id);
      return { success: true, data: invoice };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // List invoices
  ipcMain.handle('invoice:list', async (_, filter?: InvoiceFilter) => {
    try {
      const invoices = getDB().invoices.findAll(filter);
      const count = getDB().invoices.count(filter);
      return { success: true, data: { invoices, count } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Update invoice
  ipcMain.handle('invoice:update', async (_, id: number, updates: UpdateRecord<Invoice>) => {
    try {
      const success = getDB().invoices.update(id, updates);
      return { success, data: success };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Delete invoice
  ipcMain.handle('invoice:delete', async (_, id: number) => {
    try {
      const success = getDB().invoices.delete(id);
      return { success, data: success };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Finalize invoice
  ipcMain.handle('invoice:finalize', async (_, id: number) => {
    try {
      const success = getDB().invoices.finalize(id);
      return { success, data: success };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Mark as sent
  ipcMain.handle('invoice:markSent', async (_, id: number) => {
    try {
      const success = getDB().invoices.markAsSent(id);
      return { success, data: success };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get next invoice number
  ipcMain.handle('invoice:getNextNumber', async (_, prefix: string = 'INV') => {
    try {
      const number = getDB().invoices.getNextInvoiceNumber(prefix);
      return { success: true, data: number };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Invoice lines
  ipcMain.handle('invoice:createLine', async (_, line: NewRecord<InvoiceLine>) => {
    try {
      const id = getDB().invoices.createLine(line);
      return { success: true, data: id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('invoice:getLines', async (_, invoiceId: number) => {
    try {
      const lines = getDB().invoices.findLinesByInvoiceId(invoiceId);
      return { success: true, data: lines };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('invoice:updateLine', async (_, id: number, updates: UpdateRecord<InvoiceLine>) => {
    try {
      const success = getDB().invoices.updateLine(id, updates);
      return { success, data: success };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('invoice:deleteLine', async (_, id: number) => {
    try {
      const success = getDB().invoices.deleteLine(id);
      return { success, data: success };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get overdue invoices
  ipcMain.handle('invoice:getOverdue', async () => {
    try {
      const invoices = getDB().invoices.findOverdue();
      return { success: true, data: invoices };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get recent invoices
  ipcMain.handle('invoice:getRecent', async (_, limit: number = 10) => {
    try {
      const invoices = getDB().invoices.findRecent(limit);
      return { success: true, data: invoices };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get financial metrics
  ipcMain.handle('invoice:getFinancialMetrics', async (_, paymentTermsDays: number = 30) => {
    try {
      const metrics = getDB().invoices.getFinancialMetrics(paymentTermsDays);
      return { success: true, data: metrics };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

// ============================================================================
// PARTY HANDLERS
// ============================================================================

function registerPartyHandlers(): void {
  // Create party
  ipcMain.handle('party:create', async (_, party: NewRecord<Party>) => {
    try {
      const id = getDB().parties.create(party);
      return { success: true, data: id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get party by ID
  ipcMain.handle('party:get', async (_, id: number) => {
    try {
      const party = getDB().parties.findById(id);
      return { success: true, data: party };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // List parties
  ipcMain.handle('party:list', async (_, filter?: PartyFilter) => {
    try {
      const parties = getDB().parties.findAll(filter);
      const count = getDB().parties.count(filter);
      return { success: true, data: { parties, count } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get customers
  ipcMain.handle('party:getCustomers', async (_, activeOnly: boolean = true) => {
    try {
      const customers = getDB().parties.findCustomers(activeOnly);
      return { success: true, data: customers };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get company
  ipcMain.handle('party:getCompany', async () => {
    try {
      const company = getDB().parties.findCompany();
      return { success: true, data: company };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Update party
  ipcMain.handle('party:update', async (_, id: number, updates: UpdateRecord<Party>) => {
    try {
      const success = getDB().parties.update(id, updates);
      return { success, data: success };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Delete party
  ipcMain.handle('party:delete', async (_, id: number) => {
    try {
      const success = getDB().parties.delete(id);
      return { success, data: success };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Check SIRET exists
  ipcMain.handle('party:checkSiret', async (_, siret: string, excludeId?: number) => {
    try {
      const exists = getDB().parties.existsBySiret(siret, excludeId);
      return { success: true, data: exists };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

// ============================================================================
// QUOTE HANDLERS
// ============================================================================

function registerQuoteHandlers(): void {
  // Create quote
  ipcMain.handle('quote:create', async (_, quote: NewRecord<Quote>) => {
    try {
      const id = getDB().quotes.create(quote);
      return { success: true, data: id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get quote by ID
  ipcMain.handle('quote:get', async (_, id: number) => {
    try {
      const quote = getDB().quotes.findById(id);
      return { success: true, data: quote };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get complete quote with customer
  ipcMain.handle('quote:getComplete', async (_, id: number) => {
    try {
      const quote = getDB().quotes.getComplete(id);
      return { success: true, data: quote };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // List quotes
  ipcMain.handle('quote:list', async (_, filter?: QuoteFilter) => {
    try {
      const quotes = getDB().quotes.getAllComplete(filter);
      const count = getDB().quotes.count(filter);
      return { success: true, data: { quotes, count } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Update quote
  ipcMain.handle('quote:update', async (_, id: number, updates: UpdateRecord<Quote>) => {
    try {
      const success = getDB().quotes.update(id, updates);
      return { success, data: success };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Delete quote
  ipcMain.handle('quote:delete', async (_, id: number) => {
    try {
      const success = getDB().quotes.delete(id);
      return { success, data: success };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get next quote number
  ipcMain.handle('quote:getNextNumber', async (_, prefix?: string) => {
    try {
      const number = getDB().quotes.getNextNumber(prefix);
      return { success: true, data: number };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Create quote line
  ipcMain.handle('quote:createLine', async (_, line: NewRecord<QuoteLine>) => {
    try {
      const id = getDB().quotes.createLine(line);
      return { success: true, data: id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get quote lines
  ipcMain.handle('quote:getLines', async (_, quoteId: number) => {
    try {
      const lines = getDB().quotes.getLines(quoteId);
      return { success: true, data: lines };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Update quote line
  ipcMain.handle('quote:updateLine', async (_, id: number, updates: UpdateRecord<QuoteLine>) => {
    try {
      const success = getDB().quotes.updateLine(id, updates);
      return { success, data: success };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Delete quote line
  ipcMain.handle('quote:deleteLine', async (_, id: number) => {
    try {
      const success = getDB().quotes.deleteLine(id);
      return { success, data: success };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get recent quotes
  ipcMain.handle('quote:getRecent', async (_, limit: number = 10) => {
    try {
      const quotes = getDB().quotes.getRecent(limit);
      return { success: true, data: quotes };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

// ============================================================================
// E-INVOICE HANDLERS
// ============================================================================

function registerEInvoiceHandlers(): void {
  // Create metadata
  ipcMain.handle('einvoice:createMetadata', async (_, metadata: NewRecord<EInvoiceMetadata>) => {
    try {
      const id = getDB().einvoices.createMetadata(metadata);
      return { success: true, data: id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get metadata by invoice ID
  ipcMain.handle('einvoice:getMetadata', async (_, invoiceId: number) => {
    try {
      const metadata = getDB().einvoices.findMetadataByInvoiceId(invoiceId);
      return { success: true, data: metadata };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Update metadata
  ipcMain.handle('einvoice:updateMetadata', async (_, id: number, updates: UpdateRecord<EInvoiceMetadata>) => {
    try {
      const success = getDB().einvoices.updateMetadata(id, updates);
      return { success, data: success };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Queue operations
  ipcMain.handle('einvoice:addToQueue', async (_, item: NewRecord<EInvoiceQueue>) => {
    try {
      const id = getDB().einvoices.createQueueItem(item);
      return { success: true, data: id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('einvoice:getPendingQueue', async (_, limit: number = 100) => {
    try {
      const items = getDB().einvoices.findPendingQueue(limit);
      return { success: true, data: items };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('einvoice:getPendingEInvoices', async () => {
    try {
      const items = getDB().einvoices.getPendingEInvoices();
      return { success: true, data: items };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Statistics
  ipcMain.handle('einvoice:getComplianceStats', async () => {
    try {
      const stats = getDB().einvoices.getComplianceStats();
      return { success: true, data: stats };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('einvoice:getTransmissionStats', async () => {
    try {
      const stats = getDB().einvoices.getTransmissionStats();
      return { success: true, data: stats };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

// ============================================================================
// DATABASE HANDLERS
// ============================================================================

function registerDatabaseHandlers(): void {
  // Get database info
  ipcMain.handle('db:getInfo', async () => {
    try {
      const info = getDB().getInfo();
      return { success: true, data: info };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get database stats
  ipcMain.handle('db:getStats', async () => {
    try {
      const stats = getDB().getStats();
      return { success: true, data: stats };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Backup database
  ipcMain.handle('db:backup', async (_, path: string) => {
    try {
      await getDB().backup(path);
      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Restore database
  ipcMain.handle('db:restore', async (_, path: string) => {
    try {
      await getDB().restore(path);
      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

/**
 * Close database connection (call on app quit)
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    console.log('Database closed');
  }
}
