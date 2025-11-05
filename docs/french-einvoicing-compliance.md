# French E-Invoicing Compliance Research
## 2026 Mandatory Electronic Invoicing for EasyBill

**Document Date**: November 2025
**Compliance Deadline**: September 1, 2026 (Large/Mid) / September 1, 2027 (SME/Micro)
**Status**: Research Complete

---

## Executive Summary

France will enforce mandatory electronic invoicing (e-invoicing) for all B2B transactions starting September 2026. EasyBill, as a desktop invoicing application, **MUST** integrate with certified platforms to remain legally compliant.

**Critical Requirements:**
- All invoices must transit through certified Plateforme Agréée (PA) or the public PPF
- Three accepted formats: Factur-X, UBL, or CII (EN16931 compliant)
- API integration using AFNOR XP Z12-013 standard
- SIREN/SIRET validation and directory lookup
- e-reporting capability for tax authorities

---

## Timeline

### Phase 1: September 1, 2026
- **Receive**: ALL companies must be able to receive e-invoices
- **Issue**: Large enterprises and ETI (mid-sized) must issue e-invoices

### Phase 2: September 1, 2027
- **Issue**: SMEs and micro-enterprises must issue e-invoices

---

## Certified Platforms (Plateforme Agréée - PA)

### Current Status
- **107 registered PA platforms** (as of October 2025)
- Previously called "PDP" (Plateforme de Dématerialisation Partenaire)
- Renamed "PA" (Plateforme Agréée) in July 2025
- Registration is conditional pending final technical verification (end of 2025)

### Official Registry
- **Source**: Impots.gouv.fr (French Tax Authority - DGFiP)
- **Directory**: https://facturation.chorus-pro.gouv.fr/annuaire
- Regularly updated with new platforms

### Popular PA Providers for SMEs/Freelancers

1. **Tiime**
   - Free for micro-enterprises/independents
   - Factur-X compliant
   - User rating: 4.8/5
   - Strong automation features

2. **Pennylane**
   - Complete offering for SMEs
   - Enterprise API (2025-2026)
   - Advanced integrations
   - Robust financial tools

3. **Sage**
   - Established player
   - Strong ERP integrations
   - Enterprise-focused

4. **Chorus Pro / PPF (Public Portal)**
   - Government-operated option
   - Free access
   - Based on existing Chorus Pro
   - PISTE platform for API (developer.aife.economie.gouv.fr)

---

## Invoice Format Requirements

All three formats must be **EN16931 compliant** (European standard for electronic invoicing).

### 1. Factur-X (Recommended Primary Format)

**Latest Version**: Factur-X 1.07.3 / ZUGFeRD 2.3.3 (May 15, 2025)

**Structure**:
- PDF/A-3 format (human-readable)
- Embedded XML file (machine-readable)
- XML syntax: UN/CEFACT CII D22B (backward compatible with D16B)

**Five Profiles**:
1. MINIMUM
2. BASIC WL (Without Lines)
3. BASIC
4. EN16931 (COMFORT) ← **Standard profile for most businesses**
5. EXTENDED

**Resources**:
- Official specs: https://fnfe-mpe.org/factur-x/
- XSD schemas, schematrons, code lists available
- Documentation in French, German, English

**Implementation Libraries** (to research):
- Node.js: Check npm for factur-x generators
- PDF manipulation: pdf-lib or similar
- XML generation: xml2js or fast-xml-parser

### 2. UBL (Universal Business Language)

**Format**: Pure XML format
**Standard**: OASIS UBL 2.1
**Profile**: PEPPOL BIS Billing 3.0
**Use Case**: International interoperability

### 3. CII (Cross Industry Invoice)

**Format**: Pure XML format
**Standard**: UN/CEFACT CII D16B
**Note**: This is the XML part of Factur-X

---

## Technical Standards

### AFNOR Standards (French Normalization)

France has published three experimental standards:

#### XP Z12-012: Invoice Formats & Lifecycle Status
- Defines accepted formats (Factur-X, UBL, CII)
- Lifecycle status specifications

#### XP Z12-013: API Standardization ⭐
**Published**: May 27, 2025
**Purpose**: API for interfacing business systems with PAs
**Pages**: 17-page specification
**Access**: Free consultation via AFNOR Éditions

**Key Features**:
- REST API specifications
- Standardized endpoints between platforms
- OAuth2 authentication
- Real-time data exchange
- Ensures all PAs speak the same "language"

#### XP Z12-014: B2B Use Cases
- Scenario specifications
- Edge case handling

### PEPPOL Network

**Date**: July 8, 2025 - France joined PEPPOL
**Authority**: DGFiP became official PEPPOL France authority
**Impact**: Interoperability with 40+ countries
**Protocol**: AS4 messaging protocol

---

## Integration Architecture for EasyBill

### Approach: Multi-PA Support

Rather than locking into a single PA, EasyBill should support:
1. **Primary**: Chorus Pro/PPF (free, government-operated)
2. **Secondary**: Popular commercial PAs (Tiime, Pennylane, Sage)
3. **Architecture**: Plugin/adapter pattern for easy PA addition

### Required Components

#### 1. Invoice Format Generators
```
src/services/einvoicing/formats/
  ├── facturx/
  │   ├── generator.ts       # Factur-X PDF+XML generation
  │   ├── xml-builder.ts     # CII XML structure
  │   ├── pdf-builder.ts     # PDF/A-3 generation
  │   └── validator.ts       # EN16931 validation
  ├── ubl/
  │   ├── generator.ts       # UBL XML generation
  │   └── validator.ts
  └── cii/
      ├── generator.ts       # Pure CII XML
      └── validator.ts
```

#### 2. PA API Clients
```
src/services/einvoicing/platforms/
  ├── base-client.ts         # Abstract PA client (XP Z12-013 spec)
  ├── chorus-pro/
  │   ├── client.ts          # Chorus Pro/PPF implementation
  │   ├── auth.ts            # OAuth2 / Technical user
  │   └── endpoints.ts       # PISTE API endpoints
  ├── tiime/
  │   └── client.ts          # Tiime PA adapter
  ├── pennylane/
  │   └── client.ts          # Pennylane PA adapter
  └── factory.ts             # PA client factory
```

#### 3. Queue & Sync System
```
src/services/einvoicing/queue/
  ├── invoice-queue.ts       # Persistent queue (SQLite/IndexedDB)
  ├── sync-manager.ts        # Background sync when online
  └── retry-handler.ts       # Exponential backoff for failures
```

#### 4. Validation & Compliance
```
src/services/einvoicing/validation/
  ├── siren-validator.ts     # SIREN/SIRET validation
  ├── format-validator.ts    # EN16931 compliance checks
  └── directory-lookup.ts    # PA directory queries
```

#### 5. Audit & Reporting
```
src/services/einvoicing/audit/
  ├── audit-log.ts           # Immutable transmission log
  ├── e-reporting.ts         # Tax authority reporting
  └── compliance-status.ts   # Track invoice status
```

---

## Data Model Extensions

### Invoice Table (Enhanced)
```typescript
interface Invoice {
  // Existing fields...

  // Compliance fields
  eInvoicing: {
    format: 'facturx' | 'ubl' | 'cii';
    status: 'draft' | 'queued' | 'sent' | 'delivered' | 'rejected' | 'failed';
    platform: string;          // PA identifier
    transmissionId?: string;   // PA tracking ID
    transmissionDate?: Date;
    deliveryDate?: Date;
    rejectionReason?: string;
    fileHash: string;          // SHA-256 of generated file
  };

  // French requirements
  sirenSeller: string;         // 9 digits
  siretSeller?: string;        // 14 digits (SIREN + establishment)
  sirenBuyer: string;
  siretBuyer?: string;
}
```

### Settings Table (New Fields)
```typescript
interface EInvoicingSettings {
  enabled: boolean;
  platform: string;            // Selected PA
  apiEndpoint: string;
  credentials: {
    type: 'oauth2' | 'certificate' | 'api-key';
    clientId?: string;
    clientSecret?: string;     // Encrypted
    certificate?: string;      // Path to .p12/.pfx
  };
  defaultFormat: 'facturx' | 'ubl' | 'cii';
  autoSend: boolean;           // Auto-transmit or manual queue
  offlineMode: boolean;
}
```

---

## Implementation Phases

### Phase 1: Foundation (Current Sprint)
- [x] Dependency upgrades
- [x] Research PA providers
- [ ] Architecture design
- [ ] Database schema updates

### Phase 2: Format Generation
- [ ] Factur-X implementation (priority)
- [ ] UBL implementation
- [ ] CII implementation
- [ ] Format validators

### Phase 3: PA Integration
- [ ] Base PA client (XP Z12-013)
- [ ] Chorus Pro/PPF integration
- [ ] Commercial PA adapters
- [ ] Queue system

### Phase 4: UI & UX
- [ ] PA configuration in Settings
- [ ] Compliance dashboard
- [ ] Invoice status tracking
- [ ] Queue management UI

### Phase 5: Quality & Compliance
- [ ] Unit tests
- [ ] Integration tests
- [ ] Compliance audit
- [ ] Documentation

---

## Security Considerations

1. **Credentials Storage**: Use Electron's safeStorage API for encrypting PA credentials
2. **Certificate Management**: Secure storage for OAuth2 certificates
3. **Audit Logging**: Immutable logs for legal compliance
4. **Data Integrity**: SHA-256 hashing of all transmitted invoices
5. **Network Security**: TLS 1.3 for all PA communications

---

## Risks & Mitigation

### Risk 1: PA Selection Lock-in
**Mitigation**: Multi-PA architecture with adapter pattern

### Risk 2: Offline Desktop App
**Mitigation**: Queue system with background sync when online

### Risk 3: Format Complexity
**Mitigation**: Use established libraries, thorough testing

### Risk 4: Regulatory Changes
**Mitigation**: Modular architecture, monitor AFNOR updates

### Risk 5: User Adoption
**Mitigation**: Clear migration path, compliance warnings, documentation

---

## Next Steps

1. ✅ Complete architecture design
2. Create database migration for new fields
3. Implement Factur-X generator (most critical format)
4. Build Chorus Pro/PPF client (free option)
5. Create compliance dashboard UI
6. Add in-app notifications about Sept 2026 deadline

---

## Resources

### Official Sources
- DGFiP: https://www.impots.gouv.fr/facturation-electronique
- PA Directory: https://facturation.chorus-pro.gouv.fr/annuaire
- Chorus Pro Community: https://communaute.chorus-pro.gouv.fr/
- PISTE API: https://developer.aife.economie.gouv.fr/

### Standards
- AFNOR Standards: https://norminfo.afnor.org/
- Factur-X: https://fnfe-mpe.org/factur-x/
- PEPPOL: https://peppol.eu/

### Implementation Resources
- EN16931 Validation: https://ecosio.com/en/peppol/en16931/
- UBL Specifications: http://docs.oasis-open.org/ubl/

---

**Document Status**: ✅ Research Complete
**Next Review**: January 2026 (monitor regulatory updates)
