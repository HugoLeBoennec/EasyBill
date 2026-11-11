-- Migration: Credit notes (avoirs)
-- Version: 004
-- Description: Links a credit note to the invoice it corrects and keeps, on
--   the original invoice, the total already credited by ISSUED credit notes.
--   Amounts of a credit note are stored POSITIVE (invoice_type = 'credit_note',
--   EN 16931 type code 381); statistics subtract them.
--
-- NOTE: one ALTER per statement, no semicolon inside a statement: the migration
--   runner skips the ALTERs whose column already exists.

-- Credit note -> original invoice (EN 16931 BG-3, preceding invoice reference)
ALTER TABLE invoices ADD COLUMN credited_invoice_id INTEGER REFERENCES invoices(id);

-- Original invoice: total (TTC, cents) of the credit notes issued against it
ALTER TABLE invoices ADD COLUMN credited_amount INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_invoices_credited_invoice ON invoices(credited_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_type ON invoices(invoice_type);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);

-- The complete view now exposes the number of the credited invoice and a
-- balance that takes credit notes into account (a credit note is never "due").
DROP VIEW IF EXISTS v_invoices_complete;

CREATE VIEW v_invoices_complete AS
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
  o.invoice_number as credited_invoice_number,
  CASE
    WHEN i.invoice_type = 'credit_note' THEN 0
    ELSE MAX(i.total_amount - COALESCE(i.credited_amount, 0) - COALESCE(i.paid_amount, 0), 0)
  END as balance_due
FROM invoices i
LEFT JOIN parties s ON i.seller_id = s.id
LEFT JOIN parties b ON i.buyer_id = b.id
LEFT JOIN einvoice_metadata em ON i.id = em.invoice_id
LEFT JOIN invoices o ON i.credited_invoice_id = o.id;

INSERT OR IGNORE INTO schema_migrations (version, name, checksum)
VALUES ('004', 'add_credit_notes', 'sha256_004_placeholder');
