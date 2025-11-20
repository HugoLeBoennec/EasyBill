/**
 * E-Invoice Repository
 *
 * Data access layer for e-invoicing metadata, queue, and transmission logs
 */

import type Database from 'better-sqlite3';
import type {
  EInvoiceMetadata,
  EInvoiceQueue,
  PATransmissionLog,
  ComplianceTracking,
  EInvoicePending,
  EInvoiceFilter,
  NewRecord,
  UpdateRecord,
} from '../types';

export class EInvoiceRepository {
  constructor(private db: Database.Database) {}

  // ========================================================================
  // E-INVOICE METADATA OPERATIONS
  // ========================================================================

  createMetadata(metadata: NewRecord<EInvoiceMetadata>): number {
    const stmt = this.db.prepare(`
      INSERT INTO einvoice_metadata (
        invoice_id, invoice_format, format_profile, customization_id, profile_id,
        xml_file_path, pdf_file_path, xml_hash, pdf_hash,
        validated, validation_errors, validation_date,
        pa_platform, pa_enabled, einvoice_status, generated_at
      ) VALUES (
        @invoice_id, @invoice_format, @format_profile, @customization_id, @profile_id,
        @xml_file_path, @pdf_file_path, @xml_hash, @pdf_hash,
        @validated, @validation_errors, @validation_date,
        @pa_platform, @pa_enabled, @einvoice_status, @generated_at
      )
    `);
    const result = stmt.run(metadata);
    return result.lastInsertRowid as number;
  }

  findMetadataByInvoiceId(invoiceId: number): EInvoiceMetadata | undefined {
    const stmt = this.db.prepare(
      'SELECT * FROM einvoice_metadata WHERE invoice_id = ?'
    );
    return stmt.get(invoiceId) as EInvoiceMetadata | undefined;
  }

  updateMetadata(id: number, updates: UpdateRecord<EInvoiceMetadata>): boolean {
    const fields = Object.keys(updates);
    if (fields.length === 0) return false;

    const setClause = fields.map((field) => `${field} = @${field}`).join(', ');
    const stmt = this.db.prepare(
      `UPDATE einvoice_metadata SET ${setClause} WHERE id = @id`
    );
    const result = stmt.run({ ...updates, id });
    return result.changes > 0;
  }

  // ========================================================================
  // QUEUE OPERATIONS
  // ========================================================================

  createQueueItem(item: NewRecord<EInvoiceQueue>): number {
    const stmt = this.db.prepare(`
      INSERT INTO einvoice_queue (
        invoice_id, direction, priority, pa_platform, pa_endpoint,
        queue_status, attempt_count, max_attempts, scheduled_for
      ) VALUES (
        @invoice_id, @direction, @priority, @pa_platform, @pa_endpoint,
        @queue_status, @attempt_count, @max_attempts, @scheduled_for
      )
    `);
    const result = stmt.run(item);
    return result.lastInsertRowid as number;
  }

  findQueueItem(id: number): EInvoiceQueue | undefined {
    const stmt = this.db.prepare('SELECT * FROM einvoice_queue WHERE id = ?');
    return stmt.get(id) as EInvoiceQueue | undefined;
  }

  findQueueByInvoiceId(invoiceId: number): EInvoiceQueue | undefined {
    const stmt = this.db.prepare(
      'SELECT * FROM einvoice_queue WHERE invoice_id = ? ORDER BY created_at DESC LIMIT 1'
    );
    return stmt.get(invoiceId) as EInvoiceQueue | undefined;
  }

  findPendingQueue(limit: number = 100): EInvoiceQueue[] {
    const stmt = this.db.prepare(`
      SELECT * FROM einvoice_queue
      WHERE queue_status = 'pending'
        AND (scheduled_for IS NULL OR scheduled_for <= datetime('now'))
      ORDER BY priority, created_at
      LIMIT ?
    `);
    return stmt.all(limit) as EInvoiceQueue[];
  }

  findFailedQueue(): EInvoiceQueue[] {
    const stmt = this.db.prepare(`
      SELECT * FROM einvoice_queue
      WHERE queue_status = 'failed'
        AND attempt_count < max_attempts
        AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
      ORDER BY next_retry_at, created_at
    `);
    return stmt.all() as EInvoiceQueue[];
  }

  updateQueueStatus(id: number, status: string, error?: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE einvoice_queue
      SET queue_status = ?,
          last_error = ?,
          last_attempt_at = CURRENT_TIMESTAMP,
          attempt_count = attempt_count + 1
      WHERE id = ?
    `);
    const result = stmt.run(status, error || null, id);
    return result.changes > 0;
  }

  markQueueSent(id: number): boolean {
    const stmt = this.db.prepare(`
      UPDATE einvoice_queue
      SET queue_status = 'sent',
          sent_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  scheduleRetry(id: number, retryAfterMinutes: number): boolean {
    const stmt = this.db.prepare(`
      UPDATE einvoice_queue
      SET queue_status = 'failed',
          next_retry_at = datetime('now', '+' || ? || ' minutes')
      WHERE id = ?
    `);
    const result = stmt.run(retryAfterMinutes, id);
    return result.changes > 0;
  }

  // ========================================================================
  // TRANSMISSION LOG OPERATIONS
  // ========================================================================

  createTransmissionLog(log: NewRecord<PATransmissionLog>): number {
    const stmt = this.db.prepare(`
      INSERT INTO pa_transmission_log (
        queue_id, invoice_id, direction, pa_platform, endpoint_url, http_method,
        request_headers, request_body, response_status, response_headers, response_body,
        request_duration_ms, transmission_status, error_message, error_code,
        pa_invoice_id, pa_tracking_number
      ) VALUES (
        @queue_id, @invoice_id, @direction, @pa_platform, @endpoint_url, @http_method,
        @request_headers, @request_body, @response_status, @response_headers, @response_body,
        @request_duration_ms, @transmission_status, @error_message, @error_code,
        @pa_invoice_id, @pa_tracking_number
      )
    `);
    const result = stmt.run(log);
    return result.lastInsertRowid as number;
  }

  findTransmissionLogsByInvoiceId(invoiceId: number): PATransmissionLog[] {
    const stmt = this.db.prepare(`
      SELECT * FROM pa_transmission_log
      WHERE invoice_id = ?
      ORDER BY transmitted_at DESC
    `);
    return stmt.all(invoiceId) as PATransmissionLog[];
  }

  findFailedTransmissions(limit: number = 50): PATransmissionLog[] {
    const stmt = this.db.prepare(`
      SELECT * FROM pa_transmission_log
      WHERE transmission_status = 'failure'
      ORDER BY transmitted_at DESC
      LIMIT ?
    `);
    return stmt.all(limit) as PATransmissionLog[];
  }

  // ========================================================================
  // COMPLIANCE TRACKING OPERATIONS
  // ========================================================================

  createComplianceTracking(tracking: NewRecord<ComplianceTracking>): number {
    const stmt = this.db.prepare(`
      INSERT INTO compliance_tracking (
        invoice_id, requires_einvoice, einvoice_mandatory_date,
        is_compliant, compliance_issues, retention_until
      ) VALUES (
        @invoice_id, @requires_einvoice, @einvoice_mandatory_date,
        @is_compliant, @compliance_issues, @retention_until
      )
    `);
    const result = stmt.run(tracking);
    return result.lastInsertRowid as number;
  }

  findComplianceByInvoiceId(invoiceId: number): ComplianceTracking | undefined {
    const stmt = this.db.prepare(
      'SELECT * FROM compliance_tracking WHERE invoice_id = ?'
    );
    return stmt.get(invoiceId) as ComplianceTracking | undefined;
  }

  updateCompliance(id: number, updates: UpdateRecord<ComplianceTracking>): boolean {
    const fields = Object.keys(updates);
    if (fields.length === 0) return false;

    const setClause = fields.map((field) => `${field} = @${field}`).join(', ');
    const stmt = this.db.prepare(
      `UPDATE compliance_tracking SET ${setClause} WHERE id = @id`
    );
    const result = stmt.run({ ...updates, id });
    return result.changes > 0;
  }

  markArchived(invoiceId: number, location: string, format: string): boolean {
    const retentionDate = new Date();
    retentionDate.setFullYear(retentionDate.getFullYear() + 10); // 10 year retention

    const stmt = this.db.prepare(`
      UPDATE compliance_tracking
      SET archived = 1,
          archive_location = ?,
          archive_format = ?,
          archive_date = CURRENT_TIMESTAMP,
          retention_until = ?
      WHERE invoice_id = ?
    `);
    const result = stmt.run(
      location,
      format,
      retentionDate.toISOString(),
      invoiceId
    );
    return result.changes > 0;
  }

  // ========================================================================
  // DASHBOARD AND STATISTICS
  // ========================================================================

  getPendingEInvoices(): EInvoicePending[] {
    const stmt = this.db.prepare('SELECT * FROM v_einvoices_pending');
    return stmt.all() as EInvoicePending[];
  }

  getComplianceStats(): {
    total: number;
    compliant: number;
    non_compliant: number;
    pending: number;
  } {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_compliant = 1 THEN 1 ELSE 0 END) as compliant,
        SUM(CASE WHEN is_compliant = 0 THEN 1 ELSE 0 END) as non_compliant,
        SUM(CASE WHEN is_compliant IS NULL THEN 1 ELSE 0 END) as pending
      FROM compliance_tracking
    `);
    return stmt.get() as any;
  }

  getTransmissionStats(): {
    total: number;
    success: number;
    failure: number;
    avg_duration_ms: number;
  } {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN transmission_status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN transmission_status = 'failure' THEN 1 ELSE 0 END) as failure,
        COALESCE(AVG(request_duration_ms), 0) as avg_duration_ms
      FROM pa_transmission_log
    `);
    return stmt.get() as any;
  }
}
