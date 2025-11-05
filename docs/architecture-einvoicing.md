# E-Invoicing Architecture Design
## EasyBill French Compliance Integration

**Version**: 1.0
**Date**: November 2025
**Status**: Design Complete

---

## Overview

This document describes the technical architecture for integrating French e-invoicing compliance into EasyBill, a cross-platform Electron desktop application.

---

## Architecture Principles

1. **Multi-Platform Support**: Support multiple PAs (not locked to one vendor)
2. **Offline-First**: Queue invoices locally, sync when online
3. **Format Flexibility**: Generate all three required formats
4. **Plugin Architecture**: Easy to add new PAs
5. **Security-First**: Encrypted credentials, audit trails
6. **User Choice**: Let users select their preferred PA

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        EASYBILL APP                              │
│                    (Electron + React)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Billing    │  │  Settings    │  │  Dashboard   │         │
│  │     UI       │  │      UI      │  │  Compliance  │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│         │                  │                  │                  │
│         └──────────────────┼──────────────────┘                 │
│                            │                                     │
│  ┌─────────────────────────▼──────────────────────────┐        │
│  │         E-INVOICING SERVICE LAYER                   │        │
│  ├─────────────────────────────────────────────────────┤        │
│  │                                                      │        │
│  │  ┌────────────────┐  ┌──────────────────────────┐ │        │
│  │  │ Invoice Queue  │  │  Format Generators       │ │        │
│  │  │   Manager      │  │  - Factur-X (PDF+XML)    │ │        │
│  │  │                │  │  - UBL (XML)             │ │        │
│  │  │ - SQLite DB    │  │  - CII (XML)             │ │        │
│  │  │ - Retry Logic  │  │  - EN16931 Validation    │ │        │
│  │  └────────┬───────┘  └──────────┬───────────────┘ │        │
│  │           │                      │                  │        │
│  │  ┌────────▼──────────────────────▼───────────────┐ │        │
│  │  │      PA Client Factory & Router               │ │        │
│  │  │      (XP Z12-013 Standard API)                │ │        │
│  │  └────────┬──────────────────────────────────────┘ │        │
│  │           │                                         │        │
│  │  ┌────────▼─────────┐  ┌──────────┐  ┌─────────┐ │        │
│  │  │ Chorus Pro/PPF   │  │  Tiime   │  │ Others  │ │        │
│  │  │    Adapter       │  │ Adapter  │  │ Adapter │ │        │
│  │  └──────────────────┘  └──────────┘  └─────────┘ │        │
│  │                                                      │        │
│  │  ┌──────────────────────────────────────────────┐ │        │
│  │  │     Validation & Compliance Services         │ │        │
│  │  │  - SIREN/SIRET Validator                     │ │        │
│  │  │  - Directory Lookup                          │ │        │
│  │  │  - E-Reporting Generator                     │ │        │
│  │  └──────────────────────────────────────────────┘ │        │
│  │                                                      │        │
│  │  ┌──────────────────────────────────────────────┐ │        │
│  │  │          Audit & Logging System              │ │        │
│  │  │  - Immutable Transmission Log                │ │        │
│  │  │  - Compliance Status Tracker                 │ │        │
│  │  └──────────────────────────────────────────────┘ │        │
│  └─────────────────────────────────────────────────────┘        │
│                            │                                     │
│  ┌─────────────────────────▼──────────────────────────┐        │
│  │              LOCAL STORAGE                          │        │
│  │  - SQLite: Invoices, Queue, Audit Logs             │        │
│  │  - Encrypted: PA Credentials (safeStorage API)     │        │
│  └─────────────────────────────────────────────────────┘        │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ HTTPS (TLS 1.3)
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                  EXTERNAL SERVICES                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐  ┌─────────────┐  ┌──────────────────┐   │
│  │  Chorus Pro/PPF  │  │    Tiime    │  │   Pennylane      │   │
│  │   (Free, DGFiP)  │  │  (PA API)   │  │    (PA API)      │   │
│  └──────────────────┘  └─────────────┘  └──────────────────┘   │
│                                                                   │
│  ┌──────────────────┐  ┌─────────────┐                          │
│  │  SIREN Directory │  │  PEPPOL     │                          │
│  │   Validation     │  │  Network    │                          │
│  └──────────────────┘  └─────────────┘                          │
└───────────────────────────────────────────────────────────────────┘
```

---

## Component Specifications

### 1. Format Generators

#### 1.1 Factur-X Generator

**Location**: `src/services/einvoicing/formats/facturx/`

**Responsibilities**:
- Generate PDF/A-3 compliant invoices
- Embed CII XML (UN/CEFACT D16B/D22B)
- Support all 5 profiles (focus on EN16931/COMFORT)
- Validate against XSD schemas and schematrons

**Dependencies**:
```json
{
  "pdf-lib": "^1.17.1",           // PDF manipulation
  "fast-xml-parser": "^4.5.0",    // XML generation
  "ajv": "^8.17.1",                // JSON schema validation
  "dayjs": "^1.11.13"             // Date formatting
}
```

**Key Files**:
```typescript
// facturx-generator.ts
export class FacturXGenerator {
  async generate(invoice: Invoice): Promise<Buffer> {
    const xml = await this.generateCIIXML(invoice);
    const pdf = await this.generatePDFA3(invoice);
    return this.embedXMLInPDF(pdf, xml);
  }

  private async generateCIIXML(invoice: Invoice): Promise<string> {
    // CII XML structure generation
    // EN16931 profile compliance
  }

  private async generatePDFA3(invoice: Invoice): Promise<Buffer> {
    // PDF/A-3 generation with pdf-lib
    // Visual invoice layout
  }

  private async embedXMLInPDF(pdf: Buffer, xml: string): Promise<Buffer> {
    // Attach XML as file attachment to PDF
    // Metadata: /Type /Filespec, /AFRelationship /Data
  }
}
```

#### 1.2 UBL Generator

**Location**: `src/services/einvoicing/formats/ubl/`

**Responsibilities**:
- Generate UBL 2.1 XML
- PEPPOL BIS Billing 3.0 profile
- EN16931 compliance

**Output**: Pure XML file

#### 1.3 CII Generator

**Location**: `src/services/einvoicing/formats/cii/`

**Responsibilities**:
- Generate pure CII XML (without PDF)
- Reuses XML logic from Factur-X
- Standalone XML invoices

---

### 2. PA Client System

#### 2.1 Base PA Client (Abstract)

**Location**: `src/services/einvoicing/platforms/base-client.ts`

**Interface** (aligned with AFNOR XP Z12-013):
```typescript
export interface IPAClient {
  // Authentication
  authenticate(): Promise<void>;
  refreshToken(): Promise<void>;

  // Invoice operations
  sendInvoice(invoice: Buffer, format: InvoiceFormat): Promise<TransmissionResult>;
  getInvoiceStatus(transmissionId: string): Promise<InvoiceStatus>;
  receiveInvoices(since?: Date): Promise<ReceivedInvoice[]>;

  // Directory operations
  validateSIREN(siren: string): Promise<ValidationResult>;
  lookupDirectory(siren: string): Promise<CompanyInfo>;

  // Reporting
  sendEReport(report: EReportData): Promise<void>;
}

export interface TransmissionResult {
  success: boolean;
  transmissionId?: string;
  timestamp: Date;
  error?: string;
}

export interface InvoiceStatus {
  transmissionId: string;
  status: 'pending' | 'delivered' | 'rejected' | 'failed';
  timestamp: Date;
  recipientAck?: Date;
  rejectReason?: string;
}
```

#### 2.2 Chorus Pro/PPF Client

**Location**: `src/services/einvoicing/platforms/chorus-pro/`

**Endpoints** (PISTE API):
```typescript
const CHORUS_PRO_CONFIG = {
  production: {
    baseUrl: 'https://api.piste.gouv.fr/cpro/v1',
    authUrl: 'https://oauth.piste.gouv.fr/api/oauth/token',
  },
  qualification: {
    baseUrl: 'https://api-qualif.piste.gouv.fr/cpro/v1',
    authUrl: 'https://oauth-qualif.piste.gouv.fr/api/oauth/token',
  },
};

export class ChorusProClient extends BasePAClient {
  async authenticate() {
    // OAuth2 client credentials flow
    // Technical user authentication
  }

  async sendInvoice(invoice: Buffer, format: InvoiceFormat) {
    // POST /invoices/submit
    // Content-Type: multipart/form-data
    // Formats: facturx, ubl, cii
  }

  async getInvoiceStatus(transmissionId: string) {
    // GET /invoices/{transmissionId}/status
  }
}
```

**Authentication**:
- OAuth2 Client Credentials
- Technical user creation in Chorus Pro UI
- Client ID + Client Secret
- Token refresh (15min expiry)

#### 2.3 Commercial PA Adapters

**Tiime, Pennylane, Sage**: Similar structure, different endpoints

---

### 3. Invoice Queue System

**Location**: `src/services/einvoicing/queue/`

**Purpose**: Handle offline mode, retries, and async transmission

#### 3.1 Queue Manager

```typescript
export class InvoiceQueueManager {
  private db: Database; // SQLite

  async enqueue(invoice: Invoice, format: InvoiceFormat, priority: number = 0) {
    // Add to queue with status 'pending'
    await this.db.run(`
      INSERT INTO invoice_queue
      (invoice_id, format, priority, status, created_at, retry_count)
      VALUES (?, ?, ?, 'pending', ?, 0)
    `, [invoice.id, format, priority, Date.now()]);
  }

  async processQueue() {
    const items = await this.getQueuedItems();

    for (const item of items) {
      try {
        await this.processItem(item);
      } catch (error) {
        await this.handleFailure(item, error);
      }
    }
  }

  private async handleFailure(item: QueueItem, error: Error) {
    // Exponential backoff: 1min, 5min, 30min, 2h, 24h
    const delays = [60, 300, 1800, 7200, 86400];
    const nextRetry = delays[item.retry_count] || 86400;

    await this.db.run(`
      UPDATE invoice_queue
      SET retry_count = retry_count + 1,
          next_retry_at = ?,
          last_error = ?
      WHERE id = ?
    `, [Date.now() + nextRetry * 1000, error.message, item.id]);
  }
}
```

#### 3.2 Database Schema

```sql
-- Invoice queue table
CREATE TABLE invoice_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id TEXT NOT NULL,
  format TEXT NOT NULL,  -- 'facturx', 'ubl', 'cii'
  priority INTEGER DEFAULT 0,
  status TEXT NOT NULL,  -- 'pending', 'processing', 'sent', 'failed'
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  retry_count INTEGER DEFAULT 0,
  next_retry_at INTEGER,
  last_error TEXT,
  transmission_id TEXT,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

CREATE INDEX idx_queue_status ON invoice_queue(status, next_retry_at);
CREATE INDEX idx_queue_invoice ON invoice_queue(invoice_id);
```

---

### 4. Enhanced Invoice Data Model

#### 4.1 Database Schema Updates

```sql
-- Add e-invoicing columns to invoices table
ALTER TABLE invoices ADD COLUMN einvoicing_enabled INTEGER DEFAULT 0;
ALTER TABLE invoices ADD COLUMN einvoicing_format TEXT;
ALTER TABLE invoices ADD COLUMN einvoicing_status TEXT DEFAULT 'draft';
ALTER TABLE invoices ADD COLUMN einvoicing_platform TEXT;
ALTER TABLE invoices ADD COLUMN transmission_id TEXT;
ALTER TABLE invoices ADD COLUMN transmission_date INTEGER;
ALTER TABLE invoices ADD COLUMN delivery_date INTEGER;
ALTER TABLE invoices ADD COLUMN rejection_reason TEXT;
ALTER TABLE invoices ADD COLUMN file_hash TEXT;
ALTER TABLE invoices ADD COLUMN siren_seller TEXT;
ALTER TABLE invoices ADD COLUMN siret_seller TEXT;
ALTER TABLE invoices ADD COLUMN siren_buyer TEXT;
ALTER TABLE invoices ADD COLUMN siret_buyer TEXT;

-- Create audit log table
CREATE TABLE einvoicing_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id TEXT NOT NULL,
  event_type TEXT NOT NULL,  -- 'generated', 'queued', 'sent', 'delivered', 'rejected', 'error'
  timestamp INTEGER NOT NULL,
  platform TEXT,
  transmission_id TEXT,
  format TEXT,
  file_hash TEXT,
  details TEXT,  -- JSON
  FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

CREATE INDEX idx_audit_invoice ON einvoicing_audit_log(invoice_id, timestamp);
CREATE INDEX idx_audit_timestamp ON einvoicing_audit_log(timestamp);

-- Create settings table for e-invoicing configuration
CREATE TABLE einvoicing_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),  -- Singleton
  enabled INTEGER DEFAULT 0,
  platform TEXT,  -- 'chorus-pro', 'tiime', 'pennylane', etc.
  api_endpoint TEXT,
  auth_type TEXT,  -- 'oauth2', 'certificate', 'api-key'
  client_id TEXT,
  encrypted_credentials TEXT,  -- JSON, encrypted with safeStorage
  default_format TEXT DEFAULT 'facturx',
  auto_send INTEGER DEFAULT 0,
  offline_mode INTEGER DEFAULT 1,
  created_at INTEGER,
  updated_at INTEGER
);
```

#### 4.2 TypeScript Models

```typescript
// src/models/einvoicing.ts
export enum EInvoiceFormat {
  FACTURX = 'facturx',
  UBL = 'ubl',
  CII = 'cii',
}

export enum EInvoiceStatus {
  DRAFT = 'draft',
  QUEUED = 'queued',
  PROCESSING = 'processing',
  SENT = 'sent',
  DELIVERED = 'delivered',
  REJECTED = 'rejected',
  FAILED = 'failed',
}

export interface EInvoiceData {
  enabled: boolean;
  format: EInvoiceFormat;
  status: EInvoiceStatus;
  platform?: string;
  transmissionId?: string;
  transmissionDate?: Date;
  deliveryDate?: Date;
  rejectionReason?: string;
  fileHash: string;
}

export interface FrenchCompanyData {
  sirenSeller: string;    // 9 digits, required
  siretSeller?: string;   // 14 digits, optional
  sirenBuyer: string;     // 9 digits, required
  siretBuyer?: string;    // 14 digits, optional
}

export interface Invoice {
  // Existing fields...
  id: string;
  code: string;
  company: string;
  priceHT: number;
  tva: number;
  status: string;

  // E-Invoicing extensions
  eInvoicing: EInvoiceData;
  frenchCompany: FrenchCompanyData;
}
```

---

### 5. Validation Services

#### 5.1 SIREN/SIRET Validator

**Location**: `src/services/einvoicing/validation/siren-validator.ts`

```typescript
export class SIRENValidator {
  // Luhn algorithm for SIREN (9 digits)
  validateSIREN(siren: string): boolean {
    if (!/^\d{9}$/.test(siren)) return false;

    let sum = 0;
    for (let i = 0; i < 9; i++) {
      let digit = parseInt(siren[i]);
      if (i % 2 === 1) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    return sum % 10 === 0;
  }

  // SIRET = SIREN + 5 digits establishment code (14 total)
  validateSIRET(siret: string): boolean {
    if (!/^\d{14}$/.test(siret)) return false;

    const siren = siret.substring(0, 9);
    if (!this.validateSIREN(siren)) return false;

    // Luhn on full 14 digits
    let sum = 0;
    for (let i = 0; i < 14; i++) {
      let digit = parseInt(siret[i]);
      if (i % 2 === 0) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    return sum % 10 === 0;
  }

  extractSIREN(siret: string): string {
    return siret.substring(0, 9);
  }
}
```

#### 5.2 Format Validator

**Location**: `src/services/einvoicing/validation/format-validator.ts`

```typescript
export class FormatValidator {
  async validateFacturX(file: Buffer): Promise<ValidationResult> {
    // 1. Check PDF/A-3 compliance
    // 2. Extract embedded XML
    // 3. Validate XML against CII XSD
    // 4. Validate against EN16931 schematron
    // 5. Check required fields
  }

  async validateUBL(xml: string): Promise<ValidationResult> {
    // 1. Validate against UBL 2.1 XSD
    // 2. Validate against PEPPOL BIS schematron
    // 3. Validate against EN16931 rules
  }

  async validateCII(xml: string): Promise<ValidationResult> {
    // 1. Validate against CII D16B XSD
    // 2. Validate against EN16931 schematron
  }
}
```

---

### 6. User Interface Components

#### 6.1 Settings Page - E-Invoicing Configuration

**Location**: `src/renderer/pages/EInvoicingSettings.tsx`

**UI Elements**:
```
┌─────────────────────────────────────────────────────────┐
│  Facturation Électronique / E-Invoicing                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ☑ Activer la facturation électronique                  │
│                                                          │
│  Plateforme Agréée (PA):                                │
│  ┌─────────────────────────────────────────────┐       │
│  │  ● Chorus Pro / PPF (Gratuit)               │       │
│  │  ○ Tiime                                     │       │
│  │  ○ Pennylane                                 │       │
│  │  ○ Sage                                      │       │
│  │  ○ Autre...                                  │       │
│  └─────────────────────────────────────────────┘       │
│                                                          │
│  Configuration API:                                     │
│  Client ID:      [________________________]            │
│  Client Secret:  [************************] [🔒]       │
│  Environnement:  [ Qualification ▾ ]                   │
│                                                          │
│  Format par défaut:                                     │
│  ◉ Factur-X (PDF + XML)                                │
│  ○ UBL (XML)                                            │
│  ○ CII (XML)                                            │
│                                                          │
│  Options:                                               │
│  ☑ Transmission automatique                             │
│  ☑ Mode hors ligne (avec file d'attente)               │
│                                                          │
│  [Tester la connexion]  [Sauvegarder]                  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

#### 6.2 Compliance Dashboard

**Location**: `src/renderer/pages/ComplianceDashboard.tsx`

```
┌─────────────────────────────────────────────────────────┐
│  📊 Tableau de Bord Conformité 2026                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Échéance: 1er septembre 2026                           │
│  Temps restant: [████████░░] 8 mois                     │
│                                                          │
│  ┌────────────────┐  ┌────────────────┐               │
│  │  Factures      │  │  File d'attente │               │
│  │  Conformes     │  │                 │               │
│  │     85%        │  │    12 en cours  │               │
│  └────────────────┘  └────────────────┘               │
│                                                          │
│  Statut des factures ce mois:                           │
│  ✅ Envoyées:    42                                     │
│  ⏳ En attente:  12                                     │
│  ❌ Rejetées:    3                                      │
│                                                          │
│  Dernières transmissions:                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │ INV-2025-001  ✅ Délivrée    05/11 14:23        │  │
│  │ INV-2025-002  ⏳ En cours    05/11 14:45        │  │
│  │ INV-2025-003  ❌ Rejetée     05/11 15:02        │  │
│  │   └─ Erreur: SIREN invalide                    │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

#### 6.3 Invoice Form - Enhanced Fields

**Location**: `src/renderer/Billing.tsx` (update)

```
Informations Entreprise:
┌───────────────────────────────────────────┐
│ SIREN Vendeur:  [_________] (9 chiffres) │
│ SIRET Vendeur:  [______________] (opt.)  │
│                                            │
│ SIREN Acheteur: [_________] [🔍 Valider] │
│ SIRET Acheteur: [______________] (opt.)  │
└───────────────────────────────────────────┘

Facturation Électronique:
☑ Activer pour cette facture
Format: [Factur-X ▾]
□ Envoyer immédiatement
```

---

### 7. Background Services

#### 7.1 Queue Processor (Main Process)

**Location**: `src/main/services/queue-processor.ts`

```typescript
export class QueueProcessor {
  private intervalId?: NodeJS.Timeout;
  private isProcessing = false;

  start() {
    // Process queue every 5 minutes
    this.intervalId = setInterval(() => {
      this.processQueue();
    }, 5 * 60 * 1000);

    // Process immediately on startup
    this.processQueue();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private async processQueue() {
    if (this.isProcessing) return;

    this.isProcessing = true;
    try {
      const queueManager = new InvoiceQueueManager();
      await queueManager.processQueue();
    } catch (error) {
      console.error('Queue processing error:', error);
    } finally {
      this.isProcessing = false;
    }
  }
}
```

**Integration** in `src/main/main.ts`:
```typescript
const queueProcessor = new QueueProcessor();

app.whenReady().then(() => {
  createWindow();
  queueProcessor.start();
});

app.on('before-quit', () => {
  queueProcessor.stop();
});
```

---

## Security Implementation

### 1. Credential Storage

```typescript
// src/services/einvoicing/security/credential-manager.ts
import { safeStorage } from 'electron';

export class CredentialManager {
  encryptCredentials(credentials: PACredentials): string {
    const json = JSON.stringify(credentials);
    const buffer = safeStorage.encryptString(json);
    return buffer.toString('base64');
  }

  decryptCredentials(encrypted: string): PACredentials {
    const buffer = Buffer.from(encrypted, 'base64');
    const json = safeStorage.decryptString(buffer);
    return JSON.parse(json);
  }
}
```

### 2. Audit Logging

```typescript
// src/services/einvoicing/audit/audit-logger.ts
export class AuditLogger {
  async logEvent(event: AuditEvent) {
    const db = await getDatabase();

    await db.run(`
      INSERT INTO einvoicing_audit_log
      (invoice_id, event_type, timestamp, platform, transmission_id, format, file_hash, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      event.invoiceId,
      event.type,
      Date.now(),
      event.platform,
      event.transmissionId,
      event.format,
      event.fileHash,
      JSON.stringify(event.details),
    ]);
  }

  async getAuditTrail(invoiceId: string): Promise<AuditEvent[]> {
    const db = await getDatabase();
    return db.all(`
      SELECT * FROM einvoicing_audit_log
      WHERE invoice_id = ?
      ORDER BY timestamp DESC
    `, [invoiceId]);
  }
}
```

### 3. File Hashing

```typescript
// src/services/einvoicing/security/hasher.ts
import crypto from 'crypto';

export function calculateFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
```

---

## Error Handling Strategy

### Error Types

```typescript
export class EInvoicingError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = false,
  ) {
    super(message);
  }
}

// Specific error types
export class AuthenticationError extends EInvoicingError {
  constructor(message: string) {
    super(message, 'AUTH_ERROR', true);
  }
}

export class ValidationError extends EInvoicingError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', false);
  }
}

export class NetworkError extends EInvoicingError {
  constructor(message: string) {
    super(message, 'NETWORK_ERROR', true);
  }
}

export class FormatError extends EInvoicingError {
  constructor(message: string) {
    super(message, 'FORMAT_ERROR', false);
  }
}
```

### Retry Logic

```typescript
export class RetryHandler {
  async withRetry<T>(
    fn: () => Promise<T>,
    options: {
      maxAttempts: number;
      delayMs: number;
      backoff: 'exponential' | 'linear';
    },
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (attempt < options.maxAttempts) {
          const delay = options.backoff === 'exponential'
            ? options.delayMs * Math.pow(2, attempt - 1)
            : options.delayMs * attempt;

          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// __tests__/einvoicing/facturx-generator.test.ts
describe('FacturXGenerator', () => {
  it('should generate valid Factur-X PDF+XML', async () => {
    const generator = new FacturXGenerator();
    const invoice = createTestInvoice();

    const result = await generator.generate(invoice);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);

    // Validate PDF structure
    const pdf = await PDFDocument.load(result);
    expect(pdf.getPageCount()).toBeGreaterThan(0);

    // Validate embedded XML
    const attachments = pdf.getEmbeddedFiles();
    expect(attachments).toHaveProperty('factur-x.xml');
  });

  it('should validate SIREN numbers correctly', () => {
    const validator = new SIRENValidator();

    expect(validator.validateSIREN('732829320')).toBe(true);  // Valid
    expect(validator.validateSIREN('123456789')).toBe(false); // Invalid checksum
  });
});
```

### Integration Tests

```typescript
// __tests__/einvoicing/chorus-pro-client.test.ts
describe('ChorusProClient', () => {
  it('should authenticate and send invoice', async () => {
    const client = new ChorusProClient({
      environment: 'qualification',
      clientId: process.env.TEST_CLIENT_ID,
      clientSecret: process.env.TEST_CLIENT_SECRET,
    });

    await client.authenticate();

    const invoice = await generateTestFacturX();
    const result = await client.sendInvoice(invoice, EInvoiceFormat.FACTURX);

    expect(result.success).toBe(true);
    expect(result.transmissionId).toBeDefined();
  });
});
```

---

## Performance Considerations

### 1. PDF Generation
- Use workers for PDF generation (don't block main thread)
- Cache font files and templates
- Stream large PDFs to disk

### 2. Queue Processing
- Batch process queue items (up to 10 at a time)
- Use connection pooling for API calls
- Implement circuit breaker for PA endpoints

### 3. Database Optimization
- Index on `status`, `next_retry_at` for queue queries
- Index on `timestamp` for audit logs
- Periodic cleanup of old audit logs (keep 2 years)

---

## Deployment & Migration

### Phase 1: Database Migration

```typescript
// migrations/001_add_einvoicing.ts
export async function up(db: Database) {
  await db.exec(`
    -- Add columns to invoices
    ALTER TABLE invoices ADD COLUMN einvoicing_enabled INTEGER DEFAULT 0;
    -- ... (all columns from schema section)

    -- Create new tables
    CREATE TABLE invoice_queue (...);
    CREATE TABLE einvoicing_audit_log (...);
    CREATE TABLE einvoicing_settings (...);
  `);
}
```

### Phase 2: Feature Flag

```typescript
// Enable gradually for testing
const EINVOICING_ENABLED = process.env.ENABLE_EINVOICING === 'true' || false;
```

### Phase 3: User Communication

- In-app banner: "Prepare for Sept 2026 - Enable E-Invoicing"
- Settings wizard to configure PA
- Migration tool for existing invoices

---

## Monitoring & Observability

### Metrics to Track

1. **Queue Health**
   - Queue length
   - Average processing time
   - Retry rate
   - Failure rate by error type

2. **Transmission Success**
   - Success rate per PA
   - Average transmission time
   - Rejection rate and reasons

3. **Format Generation**
   - Generation time per format
   - Validation failure rate
   - File sizes

### Logging

```typescript
// Use electron-log for structured logging
import log from 'electron-log';

log.info('[EInvoicing] Invoice queued', {
  invoiceId: 'INV-001',
  format: 'facturx',
  platform: 'chorus-pro',
});

log.error('[EInvoicing] Transmission failed', {
  invoiceId: 'INV-001',
  error: error.message,
  code: error.code,
  recoverable: error.recoverable,
});
```

---

## Future Enhancements

1. **Bulk Operations**: Send multiple invoices in batch
2. **Invoice Reception UI**: Show received invoices from partners
3. **Advanced Reporting**: Analytics dashboard for compliance
4. **Multi-Company**: Support multiple SIREN/SIRET in one app
5. **API for External Tools**: Allow ERP integration via local API

---

## Conclusion

This architecture provides:
- ✅ Multi-PA support (no vendor lock-in)
- ✅ Offline-first with queue system
- ✅ All three required formats
- ✅ Security and audit compliance
- ✅ Extensible plugin architecture
- ✅ User-friendly interface
- ✅ Comprehensive error handling

**Next Steps**: Begin implementation of Factur-X generator (highest priority format).

---

**Document Status**: ✅ Design Complete, Ready for Implementation
**Last Updated**: November 2025
