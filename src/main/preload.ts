/**
 * Preload Script
 *
 * Exposes IPC API to renderer process in a secure way
 */

import { contextBridge, ipcRenderer } from 'electron';
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
  QuoteComplete,
  QuoteInput,
  QuoteLineInput,
  QuoteStatus,
  QuoteWithLines,
  QuoteConversionResult,
  NewRecord,
  UpdateRecord,
} from '../database/types';
import type { InvoicePayment } from '../database/types';
import type {
  InvoiceDraftInput,
  InvoiceDraftLineInput,
} from '../database/repositories/invoice-repository';
import type { InvoiceExportFormat } from './invoice-mapper';
import type { InvoiceExportResult } from './export-handlers';

// Type for IPC response
interface IPCResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// Invoice API
const invoiceAPI = {
  create: (invoice: NewRecord<Invoice>): Promise<IPCResponse<number>> =>
    ipcRenderer.invoke('invoice:create', invoice),

  get: (id: number): Promise<IPCResponse<Invoice>> =>
    ipcRenderer.invoke('invoice:get', id),

  getComplete: (id: number): Promise<IPCResponse<any>> =>
    ipcRenderer.invoke('invoice:getComplete', id),

  list: (filter?: InvoiceFilter): Promise<IPCResponse<{ invoices: Invoice[]; count: number }>> =>
    ipcRenderer.invoke('invoice:list', filter),

  update: (id: number, updates: UpdateRecord<Invoice>): Promise<IPCResponse<boolean>> =>
    ipcRenderer.invoke('invoice:update', id, updates),

  delete: (id: number): Promise<IPCResponse<boolean>> =>
    ipcRenderer.invoke('invoice:delete', id),

  finalize: (id: number): Promise<IPCResponse<boolean>> =>
    ipcRenderer.invoke('invoice:finalize', id),

  markSent: (id: number): Promise<IPCResponse<boolean>> =>
    ipcRenderer.invoke('invoice:markSent', id),

  getNextNumber: (prefix?: string): Promise<IPCResponse<string>> =>
    ipcRenderer.invoke('invoice:getNextNumber', prefix),

  // Line operations
  createLine: (line: NewRecord<InvoiceLine>): Promise<IPCResponse<number>> =>
    ipcRenderer.invoke('invoice:createLine', line),

  getLines: (invoiceId: number): Promise<IPCResponse<InvoiceLine[]>> =>
    ipcRenderer.invoke('invoice:getLines', invoiceId),

  updateLine: (id: number, updates: UpdateRecord<InvoiceLine>): Promise<IPCResponse<boolean>> =>
    ipcRenderer.invoke('invoice:updateLine', id, updates),

  deleteLine: (id: number): Promise<IPCResponse<boolean>> =>
    ipcRenderer.invoke('invoice:deleteLine', id),

  getOverdue: (): Promise<IPCResponse<Invoice[]>> =>
    ipcRenderer.invoke('invoice:getOverdue'),

  getRecent: (limit?: number): Promise<IPCResponse<Invoice[]>> =>
    ipcRenderer.invoke('invoice:getRecent', limit),

  getFinancialMetrics: (paymentTermsDays?: number): Promise<IPCResponse<any>> =>
    ipcRenderer.invoke('invoice:getFinancialMetrics', paymentTermsDays),

  // Create (id = null) or update a draft with its lines, atomically
  saveDraft: (
    id: number | null,
    header: InvoiceDraftInput,
    lines: InvoiceDraftLineInput[]
  ): Promise<IPCResponse<number>> =>
    ipcRenderer.invoke('invoice:saveDraft', id, header, lines),

  markPaid: (id: number, paymentDate?: string): Promise<IPCResponse<boolean>> =>
    ipcRenderer.invoke('invoice:markPaid', id, paymentDate),

  getPayments: (invoiceId: number): Promise<IPCResponse<InvoicePayment[]>> =>
    ipcRenderer.invoke('invoice:getPayments', invoiceId),

  // Generate the document and save it through a native dialog
  export: (
    id: number,
    format: InvoiceExportFormat
  ): Promise<IPCResponse<InvoiceExportResult>> =>
    ipcRenderer.invoke('invoice:export', id, format),
};

// Party API
const partyAPI = {
  create: (party: NewRecord<Party>): Promise<IPCResponse<number>> =>
    ipcRenderer.invoke('party:create', party),

  get: (id: number): Promise<IPCResponse<Party>> =>
    ipcRenderer.invoke('party:get', id),

  list: (filter?: PartyFilter): Promise<IPCResponse<{ parties: Party[]; count: number }>> =>
    ipcRenderer.invoke('party:list', filter),

  getCustomers: (activeOnly?: boolean): Promise<IPCResponse<Party[]>> =>
    ipcRenderer.invoke('party:getCustomers', activeOnly),

  getCompany: (): Promise<IPCResponse<Party>> =>
    ipcRenderer.invoke('party:getCompany'),

  update: (id: number, updates: UpdateRecord<Party>): Promise<IPCResponse<boolean>> =>
    ipcRenderer.invoke('party:update', id, updates),

  delete: (id: number): Promise<IPCResponse<boolean>> =>
    ipcRenderer.invoke('party:delete', id),

  checkSiret: (siret: string, excludeId?: number): Promise<IPCResponse<boolean>> =>
    ipcRenderer.invoke('party:checkSiret', siret, excludeId),
};

// Quote API
const quoteAPI = {
  create: (quote: NewRecord<Quote>): Promise<IPCResponse<number>> =>
    ipcRenderer.invoke('quote:create', quote),

  get: (id: number): Promise<IPCResponse<Quote>> =>
    ipcRenderer.invoke('quote:get', id),

  getComplete: (id: number): Promise<IPCResponse<any>> =>
    ipcRenderer.invoke('quote:getComplete', id),

  list: (filter?: QuoteFilter): Promise<IPCResponse<{ quotes: QuoteComplete[]; count: number }>> =>
    ipcRenderer.invoke('quote:list', filter),

  update: (id: number, updates: UpdateRecord<Quote>): Promise<IPCResponse<boolean>> =>
    ipcRenderer.invoke('quote:update', id, updates),

  delete: (id: number): Promise<IPCResponse<boolean>> =>
    ipcRenderer.invoke('quote:delete', id),

  getNextNumber: (prefix?: string): Promise<IPCResponse<string>> =>
    ipcRenderer.invoke('quote:getNextNumber', prefix),

  // Line operations
  createLine: (line: NewRecord<QuoteLine>): Promise<IPCResponse<number>> =>
    ipcRenderer.invoke('quote:createLine', line),

  getLines: (quoteId: number): Promise<IPCResponse<QuoteLine[]>> =>
    ipcRenderer.invoke('quote:getLines', quoteId),

  updateLine: (id: number, updates: UpdateRecord<QuoteLine>): Promise<IPCResponse<boolean>> =>
    ipcRenderer.invoke('quote:updateLine', id, updates),

  deleteLine: (id: number): Promise<IPCResponse<boolean>> =>
    ipcRenderer.invoke('quote:deleteLine', id),

  getRecent: (limit?: number): Promise<IPCResponse<Quote[]>> =>
    ipcRenderer.invoke('quote:getRecent', limit),

  // Quote + lines (transactional)
  getWithLines: (id: number): Promise<IPCResponse<QuoteWithLines | undefined>> =>
    ipcRenderer.invoke('quote:getWithLines', id),

  createWithLines: (quote: QuoteInput, lines: QuoteLineInput[]): Promise<IPCResponse<number>> =>
    ipcRenderer.invoke('quote:createWithLines', quote, lines),

  updateWithLines: (id: number, quote: QuoteInput, lines: QuoteLineInput[]): Promise<IPCResponse<boolean>> =>
    ipcRenderer.invoke('quote:updateWithLines', id, quote, lines),

  setStatus: (id: number, status: QuoteStatus): Promise<IPCResponse<boolean>> =>
    ipcRenderer.invoke('quote:setStatus', id, status),

  convertToInvoice: (id: number): Promise<IPCResponse<QuoteConversionResult>> =>
    ipcRenderer.invoke('quote:convertToInvoice', id),
};

// E-Invoice API
const einvoiceAPI = {
  createMetadata: (metadata: NewRecord<EInvoiceMetadata>): Promise<IPCResponse<number>> =>
    ipcRenderer.invoke('einvoice:createMetadata', metadata),

  getMetadata: (invoiceId: number): Promise<IPCResponse<EInvoiceMetadata>> =>
    ipcRenderer.invoke('einvoice:getMetadata', invoiceId),

  updateMetadata: (id: number, updates: UpdateRecord<EInvoiceMetadata>): Promise<IPCResponse<boolean>> =>
    ipcRenderer.invoke('einvoice:updateMetadata', id, updates),

  addToQueue: (item: NewRecord<EInvoiceQueue>): Promise<IPCResponse<number>> =>
    ipcRenderer.invoke('einvoice:addToQueue', item),

  getPendingQueue: (limit?: number): Promise<IPCResponse<EInvoiceQueue[]>> =>
    ipcRenderer.invoke('einvoice:getPendingQueue', limit),

  getPendingEInvoices: (): Promise<IPCResponse<any[]>> =>
    ipcRenderer.invoke('einvoice:getPendingEInvoices'),

  getComplianceStats: (): Promise<IPCResponse<any>> =>
    ipcRenderer.invoke('einvoice:getComplianceStats'),

  getTransmissionStats: (): Promise<IPCResponse<any>> =>
    ipcRenderer.invoke('einvoice:getTransmissionStats'),
};

// Database API
const databaseAPI = {
  getInfo: (): Promise<IPCResponse<any>> =>
    ipcRenderer.invoke('db:getInfo'),

  getStats: (): Promise<IPCResponse<any>> =>
    ipcRenderer.invoke('db:getStats'),

  backup: (path: string): Promise<IPCResponse<boolean>> =>
    ipcRenderer.invoke('db:backup', path),

  restore: (path: string): Promise<IPCResponse<boolean>> =>
    ipcRenderer.invoke('db:restore', path),

  // Native file dialogs (the main process asks for the path and confirms)
  backupWithDialog: (): Promise<IPCResponse<{ canceled: boolean; path?: string }>> =>
    ipcRenderer.invoke('db:backupWithDialog'),

  restoreWithDialog: (): Promise<
    IPCResponse<{ canceled: boolean; path?: string; safetyCopy?: string }>
  > => ipcRenderer.invoke('db:restoreWithDialog'),
};

// Expose APIs to renderer
contextBridge.exposeInMainWorld('electron', {
  invoice: invoiceAPI,
  party: partyAPI,
  quote: quoteAPI,
  einvoice: einvoiceAPI,
  database: databaseAPI,
});

// Type definitions for renderer
export type ElectronAPI = {
  invoice: typeof invoiceAPI;
  party: typeof partyAPI;
  quote: typeof quoteAPI;
  einvoice: typeof einvoiceAPI;
  database: typeof databaseAPI;
};

// Declare global type
declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
