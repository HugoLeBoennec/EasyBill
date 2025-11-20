-- EasyBill E-Invoicing Database Schema
-- SQLite Database for French E-Invoicing Compliance
-- Version: 1.0.0

-- ============================================================================
-- CORE INVOICE TABLES
-- ============================================================================

-- Main invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Invoice identification
  invoice_number TEXT NOT NULL UNIQUE,
  invoice_date TEXT NOT NULL, -- ISO 8601 date
  due_date TEXT,
  invoice_type TEXT NOT NULL DEFAULT 'invoice', -- invoice, credit_note, debit_note

  -- Amounts (stored in cents to avoid floating point issues)
  subtotal_amount INTEGER NOT NULL, -- Amount excluding VAT
  tax_amount INTEGER NOT NULL,      -- Total VAT amount
  total_amount INTEGER NOT NULL,    -- Amount including VAT
  paid_amount INTEGER DEFAULT 0,    -- Amount already paid
  currency TEXT NOT NULL DEFAULT 'EUR',

  -- Parties
  seller_id INTEGER,
  buyer_id INTEGER,

  -- Status
  status TEXT NOT NULL DEFAULT 'draft', -- draft, finalized, sent, paid, cancelled
  payment_status TEXT DEFAULT 'unpaid', -- unpaid, partial, paid, overdue

  -- Notes and references
  notes TEXT,
  buyer_reference TEXT,
  purchase_order_ref TEXT,

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finalized_at TEXT,
  sent_at TEXT,

  FOREIGN KEY (seller_id) REFERENCES parties(id),
  FOREIGN KEY (buyer_id) REFERENCES parties(id)
);

-- Invoice line items
CREATE TABLE IF NOT EXISTS invoice_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,

  -- Line identification
  line_number INTEGER NOT NULL,

  -- Item details
  item_name TEXT NOT NULL,
  item_description TEXT,
  item_code TEXT, -- Internal product code
  item_gtin TEXT, -- Global Trade Item Number

  -- Quantity and units
  quantity REAL NOT NULL,
  unit_code TEXT NOT NULL DEFAULT 'C62', -- UNECE unit code (C62 = piece)

  -- Pricing (in cents)
  unit_price INTEGER NOT NULL,
  line_amount INTEGER NOT NULL, -- Quantity * unit_price
  discount_amount INTEGER DEFAULT 0,
  line_total INTEGER NOT NULL, -- line_amount - discount_amount

  -- Tax
  vat_category TEXT NOT NULL DEFAULT 'S', -- S=standard, Z=zero, E=exempt, etc.
  vat_rate REAL NOT NULL, -- Percentage (e.g., 20.0 for 20%)
  vat_amount INTEGER NOT NULL,

  -- Period (for services)
  period_start TEXT,
  period_end TEXT,

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  UNIQUE(invoice_id, line_number)
);

-- Parties (customers and company)
CREATE TABLE IF NOT EXISTS parties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Party type
  party_type TEXT NOT NULL, -- 'company', 'customer', 'supplier'

  -- Legal entity information
  legal_name TEXT NOT NULL,
  trading_name TEXT,
  legal_form TEXT, -- SARL, SAS, etc.

  -- Registration numbers
  siren TEXT,
  siret TEXT,
  vat_number TEXT,

  -- Address
  address_line1 TEXT,
  address_line2 TEXT,
  postal_code TEXT,
  city TEXT,
  state_region TEXT,
  country_code TEXT NOT NULL DEFAULT 'FR',

  -- Contact
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,

  -- Electronic address
  electronic_address TEXT,
  electronic_address_scheme TEXT, -- e.g., 'EM' for email

  -- Status
  active INTEGER NOT NULL DEFAULT 1,

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CHECK (party_type IN ('company', 'customer', 'supplier'))
);

-- Payment information
CREATE TABLE IF NOT EXISTS invoice_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,

  -- Payment details
  payment_date TEXT NOT NULL,
  amount INTEGER NOT NULL, -- In cents
  payment_method TEXT NOT NULL, -- transfer, card, check, cash, etc.

  -- Banking details
  payment_reference TEXT,
  transaction_id TEXT,

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

-- ============================================================================
-- E-INVOICING SPECIFIC TABLES
-- ============================================================================

-- E-invoice metadata for compliance
CREATE TABLE IF NOT EXISTS einvoice_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL UNIQUE,

  -- Format and compliance
  invoice_format TEXT NOT NULL, -- 'facturx-pdf', 'facturx-xml', 'ubl'
  format_profile TEXT, -- 'EN16931', 'BASIC', 'EXTENDED'
  customization_id TEXT, -- EN16931 customization ID
  profile_id TEXT, -- Business process profile

  -- Generated files
  xml_file_path TEXT, -- Path to generated XML
  pdf_file_path TEXT, -- Path to generated PDF
  xml_hash TEXT, -- SHA-256 of XML for integrity
  pdf_hash TEXT, -- SHA-256 of PDF for integrity

  -- Validation
  validated INTEGER DEFAULT 0,
  validation_errors TEXT, -- JSON array of errors
  validation_date TEXT,

  -- PA (Plateforme Agréée) information
  pa_platform TEXT, -- 'chorus-pro', 'tiime', 'pennylane', etc.
  pa_enabled INTEGER DEFAULT 0,

  -- Status
  einvoice_status TEXT DEFAULT 'draft', -- draft, generated, validated, queued, sent, accepted, rejected

  -- Timestamps
  generated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  CHECK (invoice_format IN ('facturx-pdf', 'facturx-xml', 'ubl', 'cii')),
  CHECK (einvoice_status IN ('draft', 'generated', 'validated', 'queued', 'sent', 'accepted', 'rejected', 'error'))
);

-- Invoice queue for PA transmission
CREATE TABLE IF NOT EXISTS einvoice_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,

  -- Queue information
  direction TEXT NOT NULL, -- 'outgoing', 'incoming'
  priority INTEGER DEFAULT 5, -- 1=highest, 10=lowest

  -- Transmission details
  pa_platform TEXT NOT NULL,
  pa_endpoint TEXT,

  -- Status
  queue_status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, sent, failed, cancelled
  attempt_count INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,

  -- Error handling
  last_error TEXT,
  last_error_code TEXT,
  last_attempt_at TEXT,
  next_retry_at TEXT,

  -- Scheduling
  scheduled_for TEXT, -- Scheduled transmission time
  sent_at TEXT,
  acknowledged_at TEXT,

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  CHECK (direction IN ('outgoing', 'incoming')),
  CHECK (queue_status IN ('pending', 'processing', 'sent', 'failed', 'cancelled'))
);

-- PA transmission log (audit trail)
CREATE TABLE IF NOT EXISTS pa_transmission_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_id INTEGER,
  invoice_id INTEGER NOT NULL,

  -- Transmission details
  direction TEXT NOT NULL,
  pa_platform TEXT NOT NULL,
  endpoint_url TEXT,
  http_method TEXT DEFAULT 'POST',

  -- Request/Response
  request_headers TEXT, -- JSON
  request_body TEXT,
  response_status INTEGER,
  response_headers TEXT, -- JSON
  response_body TEXT,

  -- Timing
  request_duration_ms INTEGER,

  -- Status
  transmission_status TEXT NOT NULL, -- success, failure, timeout, error
  error_message TEXT,
  error_code TEXT,

  -- PA-specific IDs
  pa_invoice_id TEXT, -- ID assigned by PA platform
  pa_tracking_number TEXT,

  -- Timestamps
  transmitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (queue_id) REFERENCES einvoice_queue(id) ON DELETE SET NULL,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  CHECK (direction IN ('outgoing', 'incoming')),
  CHECK (transmission_status IN ('success', 'failure', 'timeout', 'error'))
);

-- Compliance tracking
CREATE TABLE IF NOT EXISTS compliance_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,

  -- Compliance requirements
  requires_einvoice INTEGER DEFAULT 0, -- Based on date and parties
  einvoice_mandatory_date TEXT, -- When e-invoicing became mandatory for this

  -- Compliance status
  is_compliant INTEGER DEFAULT 0,
  compliance_issues TEXT, -- JSON array of issues

  -- Reporting
  reported_to_tax_authority INTEGER DEFAULT 0,
  reporting_date TEXT,
  reporting_reference TEXT,

  -- Archive requirements
  archived INTEGER DEFAULT 0,
  archive_location TEXT,
  archive_format TEXT,
  archive_date TEXT,
  retention_until TEXT, -- Legal retention period (typically 10 years)

  -- Audit
  audit_trail TEXT, -- JSON array of audit events

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

-- ============================================================================
-- CONFIGURATION AND SETTINGS
-- ============================================================================

-- PA platform configurations
CREATE TABLE IF NOT EXISTS pa_configurations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Platform identification
  platform_name TEXT NOT NULL UNIQUE, -- 'chorus-pro', 'tiime', etc.
  display_name TEXT NOT NULL,

  -- Connection settings
  enabled INTEGER DEFAULT 0,
  api_endpoint TEXT NOT NULL,
  api_endpoint_qualification TEXT, -- Test/qualification endpoint
  environment TEXT DEFAULT 'production', -- production, qualification, sandbox

  -- Authentication
  auth_type TEXT DEFAULT 'oauth2', -- oauth2, api_key, basic
  client_id TEXT,
  client_secret TEXT, -- Should be encrypted
  api_key TEXT, -- Should be encrypted

  -- OAuth tokens
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TEXT,

  -- Additional settings (JSON)
  additional_settings TEXT,

  -- Status
  connection_status TEXT DEFAULT 'disconnected',
  last_connection_test TEXT,
  last_connection_success INTEGER DEFAULT 0,

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CHECK (environment IN ('production', 'qualification', 'sandbox')),
  CHECK (auth_type IN ('oauth2', 'api_key', 'basic', 'none'))
);

-- ============================================================================
-- AUDIT AND SYSTEM TABLES
-- ============================================================================

-- System audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Event information
  event_type TEXT NOT NULL, -- invoice_created, invoice_sent, payment_received, etc.
  entity_type TEXT NOT NULL, -- invoice, payment, einvoice, etc.
  entity_id INTEGER,

  -- User/system information
  user_id TEXT,
  user_name TEXT,
  ip_address TEXT,

  -- Event details
  action TEXT NOT NULL, -- create, read, update, delete, send, receive
  old_values TEXT, -- JSON of old values
  new_values TEXT, -- JSON of new values
  changes_summary TEXT,

  -- Additional context
  metadata TEXT, -- JSON with additional information

  -- Timestamp
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Database migrations tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checksum TEXT
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Invoice indexes
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_seller ON invoices(seller_id);
CREATE INDEX IF NOT EXISTS idx_invoices_buyer ON invoices(buyer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at);

-- Invoice lines indexes
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);

-- Parties indexes
CREATE INDEX IF NOT EXISTS idx_parties_type ON parties(party_type);
CREATE INDEX IF NOT EXISTS idx_parties_siret ON parties(siret);
CREATE INDEX IF NOT EXISTS idx_parties_vat ON parties(vat_number);

-- E-invoice indexes
CREATE INDEX IF NOT EXISTS idx_einvoice_metadata_invoice ON einvoice_metadata(invoice_id);
CREATE INDEX IF NOT EXISTS idx_einvoice_metadata_status ON einvoice_metadata(einvoice_status);
CREATE INDEX IF NOT EXISTS idx_einvoice_metadata_platform ON einvoice_metadata(pa_platform);

-- Queue indexes
CREATE INDEX IF NOT EXISTS idx_einvoice_queue_status ON einvoice_queue(queue_status);
CREATE INDEX IF NOT EXISTS idx_einvoice_queue_invoice ON einvoice_queue(invoice_id);
CREATE INDEX IF NOT EXISTS idx_einvoice_queue_retry ON einvoice_queue(next_retry_at) WHERE queue_status = 'failed';
CREATE INDEX IF NOT EXISTS idx_einvoice_queue_scheduled ON einvoice_queue(scheduled_for) WHERE queue_status = 'pending';

-- Transmission log indexes
CREATE INDEX IF NOT EXISTS idx_pa_transmission_invoice ON pa_transmission_log(invoice_id);
CREATE INDEX IF NOT EXISTS idx_pa_transmission_queue ON pa_transmission_log(queue_id);
CREATE INDEX IF NOT EXISTS idx_pa_transmission_date ON pa_transmission_log(transmitted_at);
CREATE INDEX IF NOT EXISTS idx_pa_transmission_status ON pa_transmission_log(transmission_status);

-- Compliance indexes
CREATE INDEX IF NOT EXISTS idx_compliance_invoice ON compliance_tracking(invoice_id);
CREATE INDEX IF NOT EXISTS idx_compliance_status ON compliance_tracking(is_compliant);
CREATE INDEX IF NOT EXISTS idx_compliance_mandatory ON compliance_tracking(einvoice_mandatory_date);

-- Audit log indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log(event_type);

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Complete invoice view with seller/buyer information
CREATE VIEW IF NOT EXISTS v_invoices_complete AS
SELECT
  i.*,
  s.legal_name as seller_name,
  s.siret as seller_siret,
  s.vat_number as seller_vat,
  b.legal_name as buyer_name,
  b.siret as buyer_siret,
  b.vat_number as buyer_vat,
  em.invoice_format,
  em.einvoice_status,
  em.pa_platform,
  (i.total_amount - i.paid_amount) as balance_due
FROM invoices i
LEFT JOIN parties s ON i.seller_id = s.id
LEFT JOIN parties b ON i.buyer_id = b.id
LEFT JOIN einvoice_metadata em ON i.id = em.invoice_id;

-- E-invoices pending transmission
CREATE VIEW IF NOT EXISTS v_einvoices_pending AS
SELECT
  i.id,
  i.invoice_number,
  i.invoice_date,
  em.invoice_format,
  em.einvoice_status,
  eq.queue_status,
  eq.pa_platform,
  eq.attempt_count,
  eq.last_error,
  eq.next_retry_at
FROM invoices i
JOIN einvoice_metadata em ON i.id = em.invoice_id
LEFT JOIN einvoice_queue eq ON i.id = eq.invoice_id
WHERE em.einvoice_status IN ('validated', 'queued')
  AND (eq.queue_status IS NULL OR eq.queue_status IN ('pending', 'failed'));

-- Compliance dashboard view
CREATE VIEW IF NOT EXISTS v_compliance_dashboard AS
SELECT
  DATE(i.invoice_date) as invoice_month,
  COUNT(*) as total_invoices,
  SUM(CASE WHEN ct.requires_einvoice = 1 THEN 1 ELSE 0 END) as einvoice_required,
  SUM(CASE WHEN ct.is_compliant = 1 THEN 1 ELSE 0 END) as compliant_invoices,
  SUM(CASE WHEN em.einvoice_status = 'sent' THEN 1 ELSE 0 END) as sent_einvoices,
  SUM(CASE WHEN em.einvoice_status = 'accepted' THEN 1 ELSE 0 END) as accepted_einvoices,
  SUM(CASE WHEN em.einvoice_status = 'rejected' THEN 1 ELSE 0 END) as rejected_einvoices
FROM invoices i
LEFT JOIN compliance_tracking ct ON i.id = ct.invoice_id
LEFT JOIN einvoice_metadata em ON i.id = em.invoice_id
GROUP BY DATE(i.invoice_date);

-- ============================================================================
-- TRIGGERS FOR AUTOMATED UPDATES
-- ============================================================================

-- Update invoice updated_at timestamp
CREATE TRIGGER IF NOT EXISTS trg_invoices_updated_at
AFTER UPDATE ON invoices
BEGIN
  UPDATE invoices SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Update einvoice_metadata updated_at timestamp
CREATE TRIGGER IF NOT EXISTS trg_einvoice_metadata_updated_at
AFTER UPDATE ON einvoice_metadata
BEGIN
  UPDATE einvoice_metadata SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Update parties updated_at timestamp
CREATE TRIGGER IF NOT EXISTS trg_parties_updated_at
AFTER UPDATE ON parties
BEGIN
  UPDATE parties SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Audit log trigger for invoice changes
CREATE TRIGGER IF NOT EXISTS trg_audit_invoice_insert
AFTER INSERT ON invoices
BEGIN
  INSERT INTO audit_log (event_type, entity_type, entity_id, action, new_values)
  VALUES ('invoice_created', 'invoice', NEW.id, 'create',
          json_object('invoice_number', NEW.invoice_number, 'total_amount', NEW.total_amount));
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_invoice_update
AFTER UPDATE ON invoices
BEGIN
  INSERT INTO audit_log (event_type, entity_type, entity_id, action, old_values, new_values)
  VALUES ('invoice_updated', 'invoice', NEW.id, 'update',
          json_object('status', OLD.status, 'total_amount', OLD.total_amount),
          json_object('status', NEW.status, 'total_amount', NEW.total_amount));
END;

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Insert initial schema migration
INSERT OR IGNORE INTO schema_migrations (version, name, checksum)
VALUES ('1.0.0', 'initial_schema', 'sha256_placeholder');

-- Insert placeholder for company party (to be configured by user)
INSERT OR IGNORE INTO parties (id, party_type, legal_name, country_code, active)
VALUES (1, 'company', 'Your Company Name', 'FR', 1);
