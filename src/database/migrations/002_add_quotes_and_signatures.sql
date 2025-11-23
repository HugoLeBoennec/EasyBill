-- Migration: Add Quotes and Signature Support
-- Version: 002
-- Description: Adds quotes table, signature fields, and payment terms

-- ============================================================================
-- ADD QUOTES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Quote identification
  quote_number TEXT NOT NULL UNIQUE,
  quote_date TEXT NOT NULL, -- ISO 8601 date
  valid_until TEXT, -- Quote expiration date

  -- Amounts (stored in cents)
  subtotal_amount INTEGER NOT NULL,
  tax_amount INTEGER NOT NULL,
  total_amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',

  -- Customer
  customer_id INTEGER,

  -- Status
  status TEXT NOT NULL DEFAULT 'draft', -- draft, sent, accepted, rejected, expired, converted

  -- Conversion tracking
  converted_to_invoice_id INTEGER,
  converted_at TEXT,

  -- Notes and references
  notes TEXT,
  customer_reference TEXT,

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  accepted_at TEXT,

  FOREIGN KEY (customer_id) REFERENCES parties(id),
  FOREIGN KEY (converted_to_invoice_id) REFERENCES invoices(id),
  CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'))
);

-- Quote line items
CREATE TABLE IF NOT EXISTS quote_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL,

  -- Line identification
  line_number INTEGER NOT NULL,

  -- Item details
  item_name TEXT NOT NULL,
  item_description TEXT,
  item_code TEXT,

  -- Quantity and units
  quantity REAL NOT NULL,
  unit_code TEXT NOT NULL DEFAULT 'C62',

  -- Pricing (in cents)
  unit_price INTEGER NOT NULL,
  line_amount INTEGER NOT NULL,
  discount_amount INTEGER DEFAULT 0,
  line_total INTEGER NOT NULL,

  -- Tax
  vat_category TEXT NOT NULL DEFAULT 'S',
  vat_rate REAL NOT NULL,
  vat_amount INTEGER NOT NULL,

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE,
  UNIQUE(quote_id, line_number)
);

-- ============================================================================
-- ADD SIGNATURE FIELDS TO INVOICES
-- ============================================================================

-- Add signature columns to invoices table
ALTER TABLE invoices ADD COLUMN signature_type TEXT DEFAULT 'none';
-- Values: 'none', 'manual', 'drawn', 'digital_certificate'

ALTER TABLE invoices ADD COLUMN signature_data TEXT;
-- JSON with signature information (image path, certificate info, etc.)

ALTER TABLE invoices ADD COLUMN is_signed INTEGER DEFAULT 0;
-- Boolean: 0 = not signed, 1 = signed

ALTER TABLE invoices ADD COLUMN signed_at TEXT;
-- ISO 8601 timestamp when signed

ALTER TABLE invoices ADD COLUMN signed_by TEXT;
-- Name or identifier of signer

ALTER TABLE invoices ADD COLUMN signature_file_path TEXT;
-- Path to signature file (image/PDF)

-- ============================================================================
-- ADD PAYMENT TERMS FIELD
-- ============================================================================

-- Add payment terms to invoices
ALTER TABLE invoices ADD COLUMN payment_terms_days INTEGER DEFAULT 30;
-- Number of days until payment is due (default 30)

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Quote indexes
CREATE INDEX IF NOT EXISTS idx_quotes_number ON quotes(quote_number);
CREATE INDEX IF NOT EXISTS idx_quotes_date ON quotes(quote_date);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_created ON quotes(created_at);

-- Quote lines indexes
CREATE INDEX IF NOT EXISTS idx_quote_lines_quote ON quote_lines(quote_id);

-- Invoice signature indexes
CREATE INDEX IF NOT EXISTS idx_invoices_signed ON invoices(is_signed);
CREATE INDEX IF NOT EXISTS idx_invoices_signature_type ON invoices(signature_type);

-- ============================================================================
-- TRIGGERS FOR AUTOMATED UPDATES
-- ============================================================================

-- Update quotes updated_at timestamp
CREATE TRIGGER IF NOT EXISTS trg_quotes_updated_at
AFTER UPDATE ON quotes
BEGIN
  UPDATE quotes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Update quote_lines updated_at timestamp
CREATE TRIGGER IF NOT EXISTS trg_quote_lines_updated_at
AFTER UPDATE ON quote_lines
BEGIN
  UPDATE quote_lines SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Audit log trigger for quote creation
CREATE TRIGGER IF NOT EXISTS trg_audit_quote_insert
AFTER INSERT ON quotes
BEGIN
  INSERT INTO audit_log (event_type, entity_type, entity_id, action, new_values)
  VALUES ('quote_created', 'quote', NEW.id, 'create',
          json_object('quote_number', NEW.quote_number, 'total_amount', NEW.total_amount));
END;

-- Audit log trigger for invoice signature
CREATE TRIGGER IF NOT EXISTS trg_audit_invoice_signed
AFTER UPDATE OF is_signed ON invoices
WHEN NEW.is_signed = 1 AND OLD.is_signed = 0
BEGIN
  INSERT INTO audit_log (event_type, entity_type, entity_id, action, new_values)
  VALUES ('invoice_signed', 'invoice', NEW.id, 'update',
          json_object('signed_by', NEW.signed_by, 'signed_at', NEW.signed_at, 'signature_type', NEW.signature_type));
END;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Complete quotes view with customer information
CREATE VIEW IF NOT EXISTS v_quotes_complete AS
SELECT
  q.*,
  c.legal_name as customer_name,
  c.siret as customer_siret,
  c.email as customer_email,
  c.phone as customer_phone
FROM quotes q
LEFT JOIN parties c ON q.customer_id = c.id;

-- ============================================================================
-- MIGRATION TRACKING
-- ============================================================================

INSERT INTO schema_migrations (version, name, checksum)
VALUES ('002', 'add_quotes_and_signatures', 'sha256_002_placeholder');
