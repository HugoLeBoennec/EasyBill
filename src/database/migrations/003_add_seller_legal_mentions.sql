-- Migration: Seller legal mentions and invoice-wide payment conditions
-- Version: 003
-- Description: Adds to `parties` the mentions French invoices must carry
--   (share capital, RCS / RM registration, APE code, VAT franchise flag),
--   the bank details and the default payment conditions of the seller.
--   The conditions live on the company party rather than in a settings table:
--   the export already loads the seller row, so they follow it everywhere.
--
-- NOTE: one ALTER per statement, no semicolon inside a statement: the migration
--   runner skips the ALTERs whose column already exists.

-- ============================================================================
-- LEGAL MENTIONS
-- ============================================================================

-- Share capital in euros (companies only: SARL, SAS, SA...)
ALTER TABLE parties ADD COLUMN share_capital REAL;

-- Register the seller is listed in: 'RCS' (commerce) or 'RM' (artisans)
ALTER TABLE parties ADD COLUMN registration_type TEXT;

-- City of the registry (greffe / chambre de métiers), the number is the SIREN
ALTER TABLE parties ADD COLUMN registration_city TEXT;

-- APE / NAF activity code, e.g. 6201Z
ALTER TABLE parties ADD COLUMN ape_code TEXT;

-- VAT franchise (art. 293 B du CGI): 1 = invoices are issued without VAT
ALTER TABLE parties ADD COLUMN vat_franchise INTEGER NOT NULL DEFAULT 0;

-- ============================================================================
-- BANK DETAILS
-- ============================================================================

ALTER TABLE parties ADD COLUMN iban TEXT;

ALTER TABLE parties ADD COLUMN bic TEXT;

-- ============================================================================
-- DEFAULT PAYMENT CONDITIONS (printed on every invoice)
-- ============================================================================

-- Default payment term in days for new invoices (NULL = application default)
ALTER TABLE parties ADD COLUMN default_payment_terms_days INTEGER;

-- Late-payment penalty mention (NULL = standard legal text)
ALTER TABLE parties ADD COLUMN late_penalty_text TEXT;

-- Print the 40 EUR fixed recovery fee mention (mandatory between professionals)
ALTER TABLE parties ADD COLUMN recovery_fee_enabled INTEGER NOT NULL DEFAULT 1;

-- Early-payment discount mention (NULL = "Pas d'escompte pour paiement anticipé")
ALTER TABLE parties ADD COLUMN early_payment_discount_text TEXT;

-- ============================================================================
-- EXISTING DATA
-- ============================================================================

-- Until now a configured company without VAT number was treated as being under
-- the VAT franchise: make that explicit so existing invoices keep their mention.
UPDATE parties
SET vat_franchise = 1
WHERE party_type = 'company'
  AND TRIM(COALESCE(vat_number, '')) = ''
  AND legal_name <> 'Your Company Name'
  AND TRIM(COALESCE(siret, siren, '')) <> ''
  AND country_code = 'FR';

-- ============================================================================
-- MIGRATION TRACKING
-- ============================================================================

INSERT OR IGNORE INTO schema_migrations (version, name, checksum)
VALUES ('003', 'add_seller_legal_mentions', 'sha256_003_placeholder');
