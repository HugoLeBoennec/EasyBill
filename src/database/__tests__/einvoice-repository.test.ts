import type Database from 'better-sqlite3';
import { createTestDb, insertInvoice } from './test-db';
import { EInvoiceRepository } from '../repositories/einvoice-repository';
import type { EInvoiceQueue, NewRecord, PATransmissionLog } from '../types';

describe('EInvoiceRepository', () => {
  let db: Database.Database;
  let repo: EInvoiceRepository;
  let invoiceId: number;

  const queueItem = (overrides: Partial<NewRecord<EInvoiceQueue>> = {}): NewRecord<EInvoiceQueue> => ({
    invoice_id: invoiceId,
    direction: 'outgoing',
    priority: 5,
    pa_platform: 'chorus-pro',
    queue_status: 'pending',
    attempt_count: 0,
    max_attempts: 3,
    ...overrides,
  });

  const log = (overrides: Partial<NewRecord<PATransmissionLog>> = {}): NewRecord<PATransmissionLog> => ({
    invoice_id: invoiceId,
    direction: 'outgoing',
    pa_platform: 'chorus-pro',
    http_method: 'POST',
    transmission_status: 'success',
    ...overrides,
  });

  beforeEach(() => {
    db = createTestDb();
    repo = new EInvoiceRepository(db);
    invoiceId = insertInvoice(db, { invoice_number: 'INV-2026-001', status: 'finalized' });
  });

  afterEach(() => {
    db.close();
  });

  describe('metadata', () => {
    it('creates metadata with only the required fields', () => {
      const id = repo.createMetadata({
        invoice_id: invoiceId,
        invoice_format: 'facturx-pdf',
        validated: 0,
        pa_enabled: 0,
        einvoice_status: 'generated',
      });

      expect(repo.findMetadataByInvoiceId(invoiceId)).toMatchObject({
        id,
        invoice_format: 'facturx-pdf',
        einvoice_status: 'generated',
        validated: 0,
        xml_file_path: null,
        pa_platform: null,
      });
      expect(repo.findMetadataByInvoiceId(9999)).toBeUndefined();
    });

    it('updates metadata', () => {
      const id = repo.createMetadata({
        invoice_id: invoiceId,
        invoice_format: 'ubl',
        format_profile: 'EN16931',
        xml_file_path: '/tmp/a.xml',
        validated: 0,
        pa_enabled: 1,
        pa_platform: 'chorus-pro',
        einvoice_status: 'generated',
      });

      expect(
        repo.updateMetadata(id, { validated: 1, einvoice_status: 'validated', xml_hash: 'abc' })
      ).toBe(true);
      expect(repo.findMetadataByInvoiceId(invoiceId)).toMatchObject({
        validated: 1,
        einvoice_status: 'validated',
        xml_hash: 'abc',
        xml_file_path: '/tmp/a.xml',
      });
      expect(repo.updateMetadata(id, {})).toBe(false);
      expect(repo.updateMetadata(9999, { validated: 1 })).toBe(false);
    });

    it('allows a single metadata row per invoice and checks format and status', () => {
      const base = {
        invoice_id: invoiceId,
        invoice_format: 'ubl' as const,
        validated: 0,
        pa_enabled: 0,
        einvoice_status: 'draft' as const,
      };
      repo.createMetadata(base);

      expect(() => repo.createMetadata(base)).toThrow(/UNIQUE/i);

      const other = insertInvoice(db, { invoice_number: 'INV-2026-002', status: 'finalized' });
      expect(() =>
        repo.createMetadata({ ...base, invoice_id: other, invoice_format: 'edifact' as 'ubl' })
      ).toThrow(/CHECK/i);
      expect(() => repo.createMetadata({ ...base, invoice_id: 9999 })).toThrow(/FOREIGN KEY/i);
    });
  });

  describe('queue', () => {
    it('creates and reads queue items', () => {
      const id = repo.createQueueItem(queueItem({ pa_endpoint: 'https://pa.example/api' }));

      expect(repo.findQueueItem(id)).toMatchObject({
        id,
        invoice_id: invoiceId,
        direction: 'outgoing',
        queue_status: 'pending',
        attempt_count: 0,
        pa_endpoint: 'https://pa.example/api',
        scheduled_for: null,
      });
      expect(repo.findQueueByInvoiceId(invoiceId)?.id).toBe(id);
      expect(repo.findQueueItem(9999)).toBeUndefined();
    });

    it('returns pending items that are due, by priority', () => {
      const low = repo.createQueueItem(queueItem({ priority: 8 }));
      const high = repo.createQueueItem(queueItem({ priority: 1 }));
      const due = repo.createQueueItem(
        queueItem({ priority: 5, scheduled_for: '2000-01-01 00:00:00' })
      );
      repo.createQueueItem(queueItem({ priority: 1, scheduled_for: '2999-01-01 00:00:00' }));
      repo.createQueueItem(queueItem({ priority: 1, queue_status: 'processing' }));

      expect(repo.findPendingQueue().map((q) => q.id)).toEqual([high, due, low]);
      expect(repo.findPendingQueue(1).map((q) => q.id)).toEqual([high]);
    });

    it('records attempts and errors', () => {
      const id = repo.createQueueItem(queueItem());

      expect(repo.updateQueueStatus(id, 'failed', 'HTTP 503')).toBe(true);
      expect(repo.findQueueItem(id)).toMatchObject({
        queue_status: 'failed',
        last_error: 'HTTP 503',
        attempt_count: 1,
      });
      expect(repo.findQueueItem(id)?.last_attempt_at).toBeTruthy();

      repo.updateQueueStatus(id, 'processing');
      expect(repo.findQueueItem(id)).toMatchObject({ last_error: null, attempt_count: 2 });
      expect(repo.updateQueueStatus(9999, 'failed')).toBe(false);
      expect(() => repo.updateQueueStatus(id, 'unknown')).toThrow(/CHECK/i);
    });

    it('offers failed items for retry until attempts are exhausted', () => {
      const retryNow = repo.createQueueItem(queueItem());
      repo.updateQueueStatus(retryNow, 'failed', 'timeout');

      const retryLater = repo.createQueueItem(queueItem());
      repo.updateQueueStatus(retryLater, 'failed', 'timeout');
      expect(repo.scheduleRetry(retryLater, 30)).toBe(true);

      const exhausted = repo.createQueueItem(queueItem({ max_attempts: 1 }));
      repo.updateQueueStatus(exhausted, 'failed', 'timeout');

      expect(repo.findFailedQueue().map((q) => q.id)).toEqual([retryNow]);

      // Once the retry time has passed, the item comes back
      db.prepare("UPDATE einvoice_queue SET next_retry_at = datetime('now', '-1 minute') WHERE id = ?").run(
        retryLater
      );
      expect(repo.findFailedQueue().map((q) => q.id).sort()).toEqual([retryNow, retryLater].sort());
    });

    it('marks an item as sent', () => {
      const id = repo.createQueueItem(queueItem());

      expect(repo.markQueueSent(id)).toBe(true);
      expect(repo.findQueueItem(id)?.queue_status).toBe('sent');
      expect(repo.findQueueItem(id)?.sent_at).toBeTruthy();
      expect(repo.findPendingQueue()).toEqual([]);
    });
  });

  describe('transmission log', () => {
    it('returns zeroed statistics when nothing was transmitted', () => {
      expect(repo.getTransmissionStats()).toEqual({
        total: 0,
        success: 0,
        failure: 0,
        avg_duration_ms: 0,
      });
    });

    it('stores logs and aggregates them', () => {
      const queueId = repo.createQueueItem(queueItem());
      repo.createTransmissionLog(
        log({ queue_id: queueId, response_status: 200, request_duration_ms: 100, pa_invoice_id: 'PA-1' })
      );
      repo.createTransmissionLog(
        log({
          transmission_status: 'failure',
          response_status: 500,
          request_duration_ms: 300,
          error_message: 'Internal error',
        })
      );
      repo.createTransmissionLog(log({ transmission_status: 'timeout' }));

      expect(repo.findTransmissionLogsByInvoiceId(invoiceId)).toHaveLength(3);
      expect(repo.findFailedTransmissions()).toMatchObject([
        { transmission_status: 'failure', error_message: 'Internal error', queue_id: null },
      ]);
      expect(repo.getTransmissionStats()).toEqual({
        total: 3,
        success: 1,
        failure: 1,
        avg_duration_ms: 200,
      });
    });
  });

  describe('compliance tracking', () => {
    const tracking = (overrides = {}) => ({
      invoice_id: invoiceId,
      requires_einvoice: 1,
      is_compliant: 0,
      reported_to_tax_authority: 0,
      archived: 0,
      ...overrides,
    });

    it('returns zeroed statistics when nothing is tracked', () => {
      expect(repo.getComplianceStats()).toEqual({
        total: 0,
        compliant: 0,
        non_compliant: 0,
        pending: 0,
      });
    });

    it('creates, reads and updates tracking', () => {
      const id = repo.createComplianceTracking(
        tracking({ einvoice_mandatory_date: '2026-09-01', compliance_issues: '["missing SIRET"]' })
      );

      expect(repo.findComplianceByInvoiceId(invoiceId)).toMatchObject({
        id,
        requires_einvoice: 1,
        is_compliant: 0,
        archived: 0,
        einvoice_mandatory_date: '2026-09-01',
      });

      expect(repo.updateCompliance(id, { is_compliant: 1, compliance_issues: undefined })).toBe(true);
      expect(repo.findComplianceByInvoiceId(invoiceId)).toMatchObject({
        is_compliant: 1,
        compliance_issues: null,
      });
      expect(repo.updateCompliance(id, {})).toBe(false);
    });

    it('archives with a ten-year retention period', () => {
      repo.createComplianceTracking(tracking());

      expect(repo.markArchived(invoiceId, '/archive/INV-2026-001.pdf', 'facturx-pdf')).toBe(true);

      const row = repo.findComplianceByInvoiceId(invoiceId);
      expect(row).toMatchObject({
        archived: 1,
        archive_location: '/archive/INV-2026-001.pdf',
        archive_format: 'facturx-pdf',
      });
      expect(row?.archive_date).toBeTruthy();
      expect(new Date(row?.retention_until as string).getFullYear()).toBe(
        new Date().getFullYear() + 10
      );
      expect(repo.markArchived(9999, '/x', 'ubl')).toBe(false);
    });

    it('aggregates compliance statistics', () => {
      const second = insertInvoice(db, { invoice_number: 'INV-2026-002', status: 'finalized' });
      repo.createComplianceTracking(tracking({ is_compliant: 1 }));
      repo.createComplianceTracking(tracking({ invoice_id: second, is_compliant: 0 }));

      expect(repo.getComplianceStats()).toEqual({
        total: 2,
        compliant: 1,
        non_compliant: 1,
        pending: 0,
      });
    });
  });

  describe('pending e-invoices view', () => {
    it('lists validated or queued e-invoices that are not sent yet', () => {
      repo.createMetadata({
        invoice_id: invoiceId,
        invoice_format: 'facturx-pdf',
        validated: 1,
        pa_enabled: 1,
        einvoice_status: 'validated',
      });
      expect(repo.getPendingEInvoices()).toMatchObject([
        { id: invoiceId, invoice_number: 'INV-2026-001', queue_status: null },
      ]);

      const queueId = repo.createQueueItem(queueItem());
      expect(repo.getPendingEInvoices()).toMatchObject([
        { id: invoiceId, queue_status: 'pending', pa_platform: 'chorus-pro' },
      ]);

      repo.markQueueSent(queueId);
      expect(repo.getPendingEInvoices()).toEqual([]);
    });
  });

  it('removes all e-invoicing data when the invoice is deleted', () => {
    repo.createMetadata({
      invoice_id: invoiceId,
      invoice_format: 'ubl',
      validated: 0,
      pa_enabled: 0,
      einvoice_status: 'draft',
    });
    const queueId = repo.createQueueItem(queueItem());
    repo.createTransmissionLog(log({ queue_id: queueId }));
    repo.createComplianceTracking({
      invoice_id: invoiceId,
      requires_einvoice: 1,
      is_compliant: 0,
      reported_to_tax_authority: 0,
      archived: 0,
    });

    db.prepare('DELETE FROM invoices WHERE id = ?').run(invoiceId);

    expect(repo.findMetadataByInvoiceId(invoiceId)).toBeUndefined();
    expect(repo.findQueueItem(queueId)).toBeUndefined();
    expect(repo.findTransmissionLogsByInvoiceId(invoiceId)).toEqual([]);
    expect(repo.findComplianceByInvoiceId(invoiceId)).toBeUndefined();
  });
});
