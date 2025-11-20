/**
 * UBL Generator Tests
 */

import { ublGenerator } from '../ubl-generator';
import {
  Invoice,
  InvoiceTypeCode,
  CurrencyCode,
  VATCategory,
  PaymentMeansCode,
  UnitCode,
} from '../types';

describe('UBLGenerator', () => {
  // Sample invoice data for testing
  const createSampleInvoice = (): Invoice => ({
    customizationId: 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0',
    profileId: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
    id: 'INV-2025-001',
    issueDate: '2025-01-15',
    dueDate: '2025-02-15',
    typeCode: InvoiceTypeCode.INVOICE,
    documentCurrencyCode: CurrencyCode.EUR,
    accountingSupplierParty: {
      partyLegalEntity: {
        registrationName: 'Acme Solutions SARL',
        companyId: '85252754800018',
        companyIdScheme: '0009',
        companyLegalForm: 'SARL',
      },
      postalAddress: {
        streetName: '15 Rue de la République',
        cityName: 'Paris',
        postalZone: '75001',
        countryCode: 'FR',
      },
      partyTaxScheme: [
        {
          companyId: 'FR85252754800',
          taxScheme: { id: 'VAT' },
        },
      ],
      contact: {
        name: 'Jean Dupont',
        telephone: '+33 1 23 45 67 89',
        email: 'contact@acme-solutions.fr',
      },
    },
    accountingCustomerParty: {
      partyLegalEntity: {
        registrationName: 'Client Entreprise SAS',
        companyId: '73282932000009',
        companyIdScheme: '0009',
      },
      postalAddress: {
        streetName: '42 Avenue des Champs-Élysées',
        cityName: 'Paris',
        postalZone: '75008',
        countryCode: 'FR',
      },
      partyTaxScheme: [
        {
          companyId: 'FR73282932000',
          taxScheme: { id: 'VAT' },
        },
      ],
    },
    paymentMeans: [
      {
        paymentMeansCode: PaymentMeansCode.CREDIT_TRANSFER,
        paymentId: 'INV-2025-001',
        payeeFinancialAccount: {
          id: 'FR7612345678901234567890123',
          name: 'Acme Solutions SARL',
          financialInstitutionBranch: {
            id: 'BNPAFRPPXXX',
          },
        },
      },
    ],
    taxTotal: [
      {
        taxAmount: 200.00,
        taxSubtotals: [
          {
            taxableAmount: 1000.00,
            taxAmount: 200.00,
            taxCategory: {
              id: VATCategory.STANDARD,
              percent: 20,
              taxScheme: { id: 'VAT' },
            },
          },
        ],
      },
    ],
    legalMonetaryTotal: {
      lineExtensionAmount: 1000.00,
      taxExclusiveAmount: 1000.00,
      taxInclusiveAmount: 1200.00,
      payableAmount: 1200.00,
    },
    invoiceLines: [
      {
        id: '1',
        invoicedQuantity: 10,
        unitCode: UnitCode.PIECE,
        lineExtensionAmount: 500.00,
        item: {
          name: 'Product A',
          description: 'High-quality product',
          sellersItemIdentification: 'PROD-A-001',
          classifiedTaxCategory: {
            id: VATCategory.STANDARD,
            percent: 20,
            taxScheme: { id: 'VAT' },
          },
        },
        price: {
          priceAmount: 50.00,
          baseQuantity: 1,
        },
      },
      {
        id: '2',
        invoicedQuantity: 5,
        unitCode: UnitCode.HOUR,
        lineExtensionAmount: 500.00,
        item: {
          name: 'Consulting Service',
          classifiedTaxCategory: {
            id: VATCategory.STANDARD,
            percent: 20,
            taxScheme: { id: 'VAT' },
          },
        },
        price: {
          priceAmount: 100.00,
        },
      },
    ],
  });

  describe('validate', () => {
    it('should validate a complete invoice successfully', () => {
      const invoice = createSampleInvoice();
      const result = ublGenerator.validate(invoice);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail validation when invoice ID is missing', () => {
      const invoice = createSampleInvoice();
      invoice.id = '';

      const result = ublGenerator.validate(invoice);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invoice ID (BT-1) is mandatory');
    });

    it('should fail validation when issue date is missing', () => {
      const invoice = createSampleInvoice();
      invoice.issueDate = '';

      const result = ublGenerator.validate(invoice);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Issue date (BT-2) is mandatory');
    });

    it('should fail validation when seller is missing', () => {
      const invoice = createSampleInvoice();
      invoice.accountingSupplierParty = null as any;

      const result = ublGenerator.validate(invoice);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Seller party (BG-4) is mandatory');
    });

    it('should fail validation when buyer is missing', () => {
      const invoice = createSampleInvoice();
      invoice.accountingCustomerParty = null as any;

      const result = ublGenerator.validate(invoice);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Buyer party (BG-7) is mandatory');
    });

    it('should fail validation when tax total is missing', () => {
      const invoice = createSampleInvoice();
      invoice.taxTotal = [];

      const result = ublGenerator.validate(invoice);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Tax total (BG-22) is mandatory');
    });

    it('should fail validation when no invoice lines', () => {
      const invoice = createSampleInvoice();
      invoice.invoiceLines = [];

      const result = ublGenerator.validate(invoice);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one invoice line (BG-25) is mandatory');
    });

    it('should fail validation when seller registration name is missing', () => {
      const invoice = createSampleInvoice();
      invoice.accountingSupplierParty.partyLegalEntity.registrationName = '';

      const result = ublGenerator.validate(invoice);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Seller registration name is mandatory');
    });

    it('should fail validation when line item name is missing', () => {
      const invoice = createSampleInvoice();
      invoice.invoiceLines[0].item.name = '';

      const result = ublGenerator.validate(invoice);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Line 1: Item name (BT-153) is mandatory');
    });
  });

  describe('generate', () => {
    it('should generate valid UBL XML', () => {
      const invoice = createSampleInvoice();
      const xml = ublGenerator.generate(invoice);

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<Invoice');
      expect(xml).toContain('xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"');
      expect(xml).toContain('</Invoice>');
    });

    it('should include invoice identification data', () => {
      const invoice = createSampleInvoice();
      const xml = ublGenerator.generate(invoice);

      expect(xml).toContain('<cbc:ID>INV-2025-001</cbc:ID>');
      expect(xml).toContain('<cbc:IssueDate>2025-01-15</cbc:IssueDate>');
      expect(xml).toContain('<cbc:DueDate>2025-02-15</cbc:DueDate>');
      expect(xml).toContain('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>');
      expect(xml).toContain('<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>');
    });

    it('should include customization and profile IDs', () => {
      const invoice = createSampleInvoice();
      const xml = ublGenerator.generate(invoice);

      expect(xml).toContain('<cbc:CustomizationID>');
      expect(xml).toContain('urn:cen.eu:en16931:2017');
      expect(xml).toContain('<cbc:ProfileID>');
    });

    it('should include seller party information', () => {
      const invoice = createSampleInvoice();
      const xml = ublGenerator.generate(invoice);

      expect(xml).toContain('<cac:AccountingSupplierParty>');
      expect(xml).toContain('<cbc:RegistrationName>Acme Solutions SARL</cbc:RegistrationName>');
      expect(xml).toContain('<cbc:CompanyID schemeID="0009">85252754800018</cbc:CompanyID>');
      expect(xml).toContain('FR85252754800');
      expect(xml).toContain('15 Rue de la République');
      expect(xml).toContain('Paris');
      expect(xml).toContain('75001');
      expect(xml).toContain('FR</cbc:IdentificationCode>');
    });

    it('should include buyer party information', () => {
      const invoice = createSampleInvoice();
      const xml = ublGenerator.generate(invoice);

      expect(xml).toContain('<cac:AccountingCustomerParty>');
      expect(xml).toContain('Client Entreprise SAS');
      expect(xml).toContain('73282932000009');
      expect(xml).toContain('42 Avenue des Champs-Élysées');
      expect(xml).toContain('75008');
    });

    it('should include payment means with bank details', () => {
      const invoice = createSampleInvoice();
      const xml = ublGenerator.generate(invoice);

      expect(xml).toContain('<cac:PaymentMeans>');
      expect(xml).toContain('<cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>');
      expect(xml).toContain('<cbc:PaymentID>INV-2025-001</cbc:PaymentID>');
      expect(xml).toContain('FR7612345678901234567890123');
      expect(xml).toContain('BNPAFRPPXXX');
    });

    it('should include tax totals and subtotals', () => {
      const invoice = createSampleInvoice();
      const xml = ublGenerator.generate(invoice);

      expect(xml).toContain('<cac:TaxTotal>');
      expect(xml).toContain('<cbc:TaxAmount currencyID="EUR">200.00</cbc:TaxAmount>');
      expect(xml).toContain('<cac:TaxSubtotal>');
      expect(xml).toContain('<cbc:TaxableAmount currencyID="EUR">1000.00</cbc:TaxableAmount>');
      expect(xml).toContain('<cbc:Percent>20</cbc:Percent>');
    });

    it('should include legal monetary totals', () => {
      const invoice = createSampleInvoice();
      const xml = ublGenerator.generate(invoice);

      expect(xml).toContain('<cac:LegalMonetaryTotal>');
      expect(xml).toContain('<cbc:LineExtensionAmount currencyID="EUR">1000.00</cbc:LineExtensionAmount>');
      expect(xml).toContain('<cbc:TaxExclusiveAmount currencyID="EUR">1000.00</cbc:TaxExclusiveAmount>');
      expect(xml).toContain('<cbc:TaxInclusiveAmount currencyID="EUR">1200.00</cbc:TaxInclusiveAmount>');
      expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">1200.00</cbc:PayableAmount>');
    });

    it('should include all invoice lines', () => {
      const invoice = createSampleInvoice();
      const xml = ublGenerator.generate(invoice);

      expect(xml).toContain('<cac:InvoiceLine>');
      expect(xml).toContain('<cbc:ID>1</cbc:ID>');
      expect(xml).toContain('<cbc:ID>2</cbc:ID>');

      // Line 1 details
      expect(xml).toContain('<cbc:InvoicedQuantity unitCode="C62">10</cbc:InvoicedQuantity>');
      expect(xml).toContain('<cbc:Name>Product A</cbc:Name>');
      expect(xml).toContain('<cbc:Description>High-quality product</cbc:Description>');
      expect(xml).toContain('<cbc:PriceAmount currencyID="EUR">50.00</cbc:PriceAmount>');

      // Line 2 details
      expect(xml).toContain('<cbc:InvoicedQuantity unitCode="HUR">5</cbc:InvoicedQuantity>');
      expect(xml).toContain('<cbc:Name>Consulting Service</cbc:Name>');
      expect(xml).toContain('<cbc:PriceAmount currencyID="EUR">100.00</cbc:PriceAmount>');
    });

    it('should escape XML special characters', () => {
      const invoice = createSampleInvoice();
      invoice.note = 'Test <note> with & special "characters"';
      const xml = ublGenerator.generate(invoice);

      expect(xml).toContain('Test &lt;note&gt; with &amp; special &quot;characters&quot;');
      expect(xml).not.toContain('Test <note>');
    });

    it('should handle invoice with allowances', () => {
      const invoice = createSampleInvoice();
      invoice.allowanceCharge = [
        {
          chargeIndicator: false,
          allowanceChargeReason: 'Volume discount',
          amount: 50.00,
          baseAmount: 1000.00,
          multiplierFactorNumeric: 0.05,
          taxCategory: {
            id: VATCategory.STANDARD,
            percent: 20,
            taxScheme: { id: 'VAT' },
          },
        },
      ];

      const xml = ublGenerator.generate(invoice);

      expect(xml).toContain('<cac:AllowanceCharge>');
      expect(xml).toContain('<cbc:ChargeIndicator>false</cbc:ChargeIndicator>');
      expect(xml).toContain('Volume discount');
      expect(xml).toContain('<cbc:Amount currencyID="EUR">50.00</cbc:Amount>');
    });

    it('should handle invoice with charges', () => {
      const invoice = createSampleInvoice();
      invoice.allowanceCharge = [
        {
          chargeIndicator: true,
          allowanceChargeReason: 'Shipping fee',
          amount: 25.00,
        },
      ];

      const xml = ublGenerator.generate(invoice);

      expect(xml).toContain('<cbc:ChargeIndicator>true</cbc:ChargeIndicator>');
      expect(xml).toContain('Shipping fee');
    });

    it('should handle delivery information', () => {
      const invoice = createSampleInvoice();
      invoice.delivery = {
        actualDeliveryDate: '2025-01-10',
        deliveryLocation: {
          address: {
            streetName: '10 Rue de Livraison',
            cityName: 'Lyon',
            postalZone: '69001',
            countryCode: 'FR',
          },
        },
      };

      const xml = ublGenerator.generate(invoice);

      expect(xml).toContain('<cac:Delivery>');
      expect(xml).toContain('<cbc:ActualDeliveryDate>2025-01-10</cbc:ActualDeliveryDate>');
      expect(xml).toContain('10 Rue de Livraison');
      expect(xml).toContain('Lyon');
    });

    it('should handle credit note type', () => {
      const invoice = createSampleInvoice();
      invoice.typeCode = InvoiceTypeCode.CREDIT_NOTE;
      invoice.invoiceDocumentReference = [
        {
          id: 'INV-2024-999',
          documentTypeCode: '380',
        },
      ];

      const xml = ublGenerator.generate(invoice);

      expect(xml).toContain('<cbc:InvoiceTypeCode>381</cbc:InvoiceTypeCode>');
      expect(xml).toContain('<cac:InvoiceDocumentReference>');
      expect(xml).toContain('INV-2024-999');
    });

    it('should throw error for invalid invoice', () => {
      const invoice = createSampleInvoice();
      invoice.id = '';

      expect(() => ublGenerator.generate(invoice)).toThrow('Invalid invoice data');
    });

    it('should format amounts with 2 decimal places', () => {
      const invoice = createSampleInvoice();
      invoice.legalMonetaryTotal.payableAmount = 1234.567;

      const xml = ublGenerator.generate(invoice);

      expect(xml).toContain('1234.57');
      expect(xml).not.toContain('1234.567');
    });

    it('should handle multiple tax categories', () => {
      const invoice = createSampleInvoice();
      invoice.taxTotal[0].taxSubtotals.push({
        taxableAmount: 100.00,
        taxAmount: 5.50,
        taxCategory: {
          id: VATCategory.REDUCED,
          percent: 5.5,
          taxScheme: { id: 'VAT' },
        },
      });

      const xml = ublGenerator.generate(invoice);

      expect(xml).toContain('<cbc:Percent>20</cbc:Percent>');
      expect(xml).toContain('<cbc:Percent>5.5</cbc:Percent>');
    });

    it('should handle VAT exempt items', () => {
      const invoice = createSampleInvoice();
      invoice.taxTotal[0].taxSubtotals[0].taxCategory = {
        id: VATCategory.EXEMPT,
        taxExemptionReason: 'Article 132 of Directive 2006/112/EC',
        taxScheme: { id: 'VAT' },
      };

      const xml = ublGenerator.generate(invoice);

      expect(xml).toContain('<cbc:ID>E</cbc:ID>');
      expect(xml).toContain('Article 132 of Directive 2006/112/EC');
    });
  });

  describe('pretty print', () => {
    it('should generate formatted XML with indentation when prettyPrint is true', () => {
      const invoice = createSampleInvoice();
      const xml = ublGenerator.generate(invoice, { format: 'ubl', prettyPrint: true });

      // Should have indentation
      expect(xml).toContain('  <cbc:ID>');
      expect(xml).toContain('    <cbc:Name>');
    });

    it('should generate valid XML when prettyPrint is false', () => {
      const invoice = createSampleInvoice();
      const xml = ublGenerator.generate(invoice, { format: 'ubl', prettyPrint: false });

      // Should still generate valid XML with all required elements
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<Invoice');
      expect(xml).toContain('<cbc:ID>INV-2025-001</cbc:ID>');
      expect(xml).toContain('</Invoice>');
    });
  });
});
