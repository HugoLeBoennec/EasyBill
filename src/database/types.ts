/**
 * Database Types for EasyBill E-Invoicing
 *
 * TypeScript interfaces matching the database schema
 */

// ============================================================================
// CORE INVOICE TYPES
// ============================================================================

export interface Invoice {
  id?: number;
  invoice_number: string;
  invoice_date: string;
  due_date?: string;
  invoice_type: InvoiceType;

  // Amounts (in cents)
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount?: number;
  currency: string;

  // Parties
  seller_id?: number;
  buyer_id?: number;

  // Status
  status: InvoiceStatus;
  payment_status?: PaymentStatus;

  // Notes
  notes?: string;
  buyer_reference?: string;
  purchase_order_ref?: string;

  // Timestamps
  created_at?: string;
  updated_at?: string;
  finalized_at?: string;
  sent_at?: string;
}

export interface InvoiceLine {
  id?: number;
  invoice_id: number;
  line_number: number;

  // Item details
  item_name: string;
  item_description?: string;
  item_code?: string;
  item_gtin?: string;

  // Quantity
  quantity: number;
  unit_code: string;

  // Pricing (in cents)
  unit_price: number;
  line_amount: number;
  discount_amount?: number;
  line_total: number;

  // Tax
  vat_category: string;
  vat_rate: number;
  vat_amount: number;

  // Period
  period_start?: string;
  period_end?: string;

  // Timestamps
  created_at?: string;
  updated_at?: string;
}

export interface Party {
  id?: number;
  party_type: PartyType;

  // Legal entity
  legal_name: string;
  trading_name?: string;
  legal_form?: string;

  // Registration
  siren?: string;
  siret?: string;
  vat_number?: string;

  // Address
  address_line1?: string;
  address_line2?: string;
  postal_code?: string;
  city?: string;
  state_region?: string;
  country_code: string;

  // Contact
  contact_name?: string;
  phone?: string;
  email?: string;
  website?: string;

  // Electronic
  electronic_address?: string;
  electronic_address_scheme?: string;

  // Status
  active: number;

  // Timestamps
  created_at?: string;
  updated_at?: string;
}

export interface InvoicePayment {
  id?: number;
  invoice_id: number;
  payment_date: string;
  amount: number;
  payment_method: string;
  payment_reference?: string;
  transaction_id?: string;
  notes?: string;
  created_at?: string;
}

// ============================================================================
// E-INVOICING TYPES
// ============================================================================

export interface EInvoiceMetadata {
  id?: number;
  invoice_id: number;

  // Format
  invoice_format: EInvoiceFormat;
  format_profile?: string;
  customization_id?: string;
  profile_id?: string;

  // Files
  xml_file_path?: string;
  pdf_file_path?: string;
  xml_hash?: string;
  pdf_hash?: string;

  // Validation
  validated: number;
  validation_errors?: string;
  validation_date?: string;

  // PA
  pa_platform?: string;
  pa_enabled: number;

  // Status
  einvoice_status: EInvoiceStatus;

  // Timestamps
  generated_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface EInvoiceQueue {
  id?: number;
  invoice_id: number;
  direction: QueueDirection;
  priority: number;

  // Transmission
  pa_platform: string;
  pa_endpoint?: string;

  // Status
  queue_status: QueueStatus;
  attempt_count: number;
  max_attempts: number;

  // Error handling
  last_error?: string;
  last_error_code?: string;
  last_attempt_at?: string;
  next_retry_at?: string;

  // Scheduling
  scheduled_for?: string;
  sent_at?: string;
  acknowledged_at?: string;

  // Timestamps
  created_at?: string;
  updated_at?: string;
}

export interface PATransmissionLog {
  id?: number;
  queue_id?: number;
  invoice_id: number;

  // Transmission
  direction: QueueDirection;
  pa_platform: string;
  endpoint_url?: string;
  http_method: string;

  // Request/Response
  request_headers?: string;
  request_body?: string;
  response_status?: number;
  response_headers?: string;
  response_body?: string;

  // Timing
  request_duration_ms?: number;

  // Status
  transmission_status: TransmissionStatus;
  error_message?: string;
  error_code?: string;

  // PA IDs
  pa_invoice_id?: string;
  pa_tracking_number?: string;

  // Timestamp
  transmitted_at?: string;
}

export interface ComplianceTracking {
  id?: number;
  invoice_id: number;

  // Requirements
  requires_einvoice: number;
  einvoice_mandatory_date?: string;

  // Status
  is_compliant: number;
  compliance_issues?: string;

  // Reporting
  reported_to_tax_authority: number;
  reporting_date?: string;
  reporting_reference?: string;

  // Archive
  archived: number;
  archive_location?: string;
  archive_format?: string;
  archive_date?: string;
  retention_until?: string;

  // Audit
  audit_trail?: string;

  // Timestamps
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface PAConfiguration {
  id?: number;
  platform_name: string;
  display_name: string;

  // Connection
  enabled: number;
  api_endpoint: string;
  api_endpoint_qualification?: string;
  environment: PAEnvironment;

  // Authentication
  auth_type: AuthType;
  client_id?: string;
  client_secret?: string;
  api_key?: string;

  // OAuth tokens
  access_token?: string;
  refresh_token?: string;
  token_expires_at?: string;

  // Additional
  additional_settings?: string;

  // Status
  connection_status: string;
  last_connection_test?: string;
  last_connection_success: number;

  // Timestamps
  created_at?: string;
  updated_at?: string;
}

export interface AuditLog {
  id?: number;
  event_type: string;
  entity_type: string;
  entity_id?: number;

  user_id?: string;
  user_name?: string;
  ip_address?: string;

  action: AuditAction;
  old_values?: string;
  new_values?: string;
  changes_summary?: string;

  metadata?: string;
  created_at?: string;
}

export interface SchemaMigration {
  id?: number;
  version: string;
  name: string;
  applied_at?: string;
  checksum?: string;
}

// ============================================================================
// VIEW TYPES
// ============================================================================

export interface InvoiceComplete extends Invoice {
  seller_name?: string;
  seller_siret?: string;
  seller_vat?: string;
  buyer_name?: string;
  buyer_siret?: string;
  buyer_vat?: string;
  invoice_format?: string;
  einvoice_status?: string;
  pa_platform?: string;
  balance_due?: number;
}

export interface EInvoicePending {
  id: number;
  invoice_number: string;
  invoice_date: string;
  invoice_format?: string;
  einvoice_status?: string;
  queue_status?: string;
  pa_platform?: string;
  attempt_count?: number;
  last_error?: string;
  next_retry_at?: string;
}

export interface ComplianceDashboard {
  invoice_month: string;
  total_invoices: number;
  einvoice_required: number;
  compliant_invoices: number;
  sent_einvoices: number;
  accepted_einvoices: number;
  rejected_einvoices: number;
}

// ============================================================================
// ENUMS AND CONSTANTS
// ============================================================================

export type InvoiceType = 'invoice' | 'credit_note' | 'debit_note';

export type InvoiceStatus =
  | 'draft'
  | 'finalized'
  | 'sent'
  | 'paid'
  | 'cancelled';

export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'overdue';

export type PartyType = 'company' | 'customer' | 'supplier';

export type EInvoiceFormat =
  | 'facturx-pdf'
  | 'facturx-xml'
  | 'ubl'
  | 'cii';

export type EInvoiceStatus =
  | 'draft'
  | 'generated'
  | 'validated'
  | 'queued'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'error';

export type QueueDirection = 'outgoing' | 'incoming';

export type QueueStatus =
  | 'pending'
  | 'processing'
  | 'sent'
  | 'failed'
  | 'cancelled';

export type TransmissionStatus = 'success' | 'failure' | 'timeout' | 'error';

export type PAEnvironment = 'production' | 'qualification' | 'sandbox';

export type AuthType = 'oauth2' | 'api_key' | 'basic' | 'none';

export type AuditAction = 'create' | 'read' | 'update' | 'delete' | 'send' | 'receive';

// ============================================================================
// FILTER AND QUERY TYPES
// ============================================================================

export interface InvoiceFilter {
  status?: InvoiceStatus;
  payment_status?: PaymentStatus;
  seller_id?: number;
  buyer_id?: number;
  from_date?: string;
  to_date?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface EInvoiceFilter {
  einvoice_status?: EInvoiceStatus;
  queue_status?: QueueStatus;
  pa_platform?: string;
  requires_retry?: boolean;
  limit?: number;
  offset?: number;
}

export interface PartyFilter {
  party_type?: PartyType;
  active?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface DatabaseInfo {
  version: string;
  path: string;
  size: number;
  tables: string[];
  last_migration?: string;
}

export interface DatabaseStats {
  total_invoices: number;
  draft_invoices: number;
  finalized_invoices: number;
  total_parties: number;
  total_customers: number;
  pending_einvoices: number;
  failed_transmissions: number;
}

// Helper type for partial updates
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Helper type for creating new records (without id and timestamps)
export type NewRecord<T> = Omit<
  T,
  'id' | 'created_at' | 'updated_at'
>;

// Helper type for updates (without timestamps)
export type UpdateRecord<T> = Partial<
  Omit<T, 'id' | 'created_at' | 'updated_at'>
>;
