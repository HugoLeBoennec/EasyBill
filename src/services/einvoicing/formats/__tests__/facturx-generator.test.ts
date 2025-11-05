/**
 * Factur-X Generator Tests
 */

import { facturXGenerator, FacturXProfile } from '../facturx-generator';
import {
  Invoice,
  InvoiceTypeCode,
  CurrencyCode,
  VATCategory,
  PaymentMeansCode,
  UnitCode,
} from '../types';

describe('FacturXGenerator', () => {
  // Sample invoice data for testing
  const createSampleInvoice = (): Invoice => ({
    customizationId: 'urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:en16931',
    profileId: 'urn:factur-x.eu:1p0:en16931',
    id: 'FX-2025-001',
    issueDate: '2025-01-15',
    dueDate: '2025-02-15',
    typeCode: InvoiceTypeCode.INVOICE,
    documentCurrencyCode: CurrencyCode.EUR,
    note: 'Merci pour votre commande',
    accountingSupplierParty: {
      partyLegalEntity: {
        registrationName: 'TechCorp France SARL',
        companyId: '85252754800018',
        companyIdScheme: '0009',
      },
      postalAddress: {
        streetName: '25 Boulevard Haussmann',
        cityName: 'Paris',
        postalZone: '75009',
        countryCode: 'FR',
      },
      partyTaxScheme: [
        {
          companyId: 'FR85252754800',
          taxScheme: { id: 'VAT' },
        },
      ],
      contact: {
        name: 'Marie Martin',
        telephone: '+33 1 98 76 54 32',
        email: 'contact@techcorp.fr',
      },
    },
    accountingCustomerParty: {
      partyLegalEntity: {
        registrationName: 'Solutions Innovantes SAS',
        companyId: '73282932000009',
      },
      postalAddress: {
        streetName: '100 Rue de Rivoli',
        cityName: 'Paris',
        postalZone: '75004',
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
        paymentId: 'FX-2025-001',
        payeeFinancialAccount: {
          id: 'FR7630006000011234567890189',
          name: 'TechCorp France SARL',
          financialInstitutionBranch: {
            id: 'AGRIFRPP123',
          },
        },
      },
    ],
    paymentTerms: {
      note: 'Paiement à 30 jours',
    },
    taxTotal: [
      {
        taxAmount: 400.00,
        taxSubtotals: [
          {
            taxableAmount: 2000.00,
            taxAmount: 400.00,
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
      lineExtensionAmount: 2000.00,
      taxExclusiveAmount: 2000.00,
      taxInclusiveAmount: 2400.00,
      payableAmount: 2400.00,
    },
    invoiceLines: [
      {
        id: '1',
        invoicedQuantity: 20,
        unitCode: UnitCode.PIECE,
        lineExtensionAmount: 1000.00,
        item: {
          name: 'License Logiciel Pro',
          description: 'License annuelle logiciel professionnel',
          sellersItemIdentification: 'LIC-PRO-2025',
          classifiedTaxCategory: {
            id: VATCategory.STANDARD,
            percent: 20,
            taxScheme: { id: 'VAT' },
          },
        },
        price: {
          priceAmount: 50.00,
        },
      },
      {
        id: '2',
        invoicedQuantity: 40,
        unitCode: UnitCode.HOUR,
        lineExtensionAmount: 1000.00,
        item: {
          name: 'Support Technique',
          classifiedTaxCategory: {
            id: VATCategory.STANDARD,
            percent: 20,
            taxScheme: { id: 'VAT' },
          },
        },
        price: {
          priceAmount: 25.00,
        },
      },
    ],
  });

  describe('validate', () => {
    it('should validate a complete invoice successfully', () => {
      const invoice = createSampleInvoice();
      const result = facturXGenerator.validate(invoice);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail validation when invoice ID is missing', () => {
      const invoice = createSampleInvoice();
      invoice.id = '';

      const result = facturXGenerator.validate(invoice);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invoice ID (BT-1) is mandatory');
    });

    it('should fail validation when seller is missing', () => {
      const invoice = createSampleInvoice();
      invoice.accountingSupplierParty = null as any;

      const result = facturXGenerator.validate(invoice);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Seller party (BG-4) is mandatory');
    });
  });

  describe('generate', () => {
    it('should generate valid CII XML with correct namespaces', () => {
      const invoice = createSampleInvoice();
      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<rsm:CrossIndustryInvoice');
      expect(xml).toContain('xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"');
      expect(xml).toContain('xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"');
      expect(xml).toContain('xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"');
      expect(xml).toContain('</rsm:CrossIndustryInvoice>');
    });

    it('should include exchanged document context with profile', () => {
      const invoice = createSampleInvoice();
      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('<rsm:ExchangedDocumentContext>');
      expect(xml).toContain('<ram:GuidelineSpecifiedDocumentContextParameter>');
      expect(xml).toContain('urn:cen.eu:en16931:2017');
      expect(xml).toContain('</rsm:ExchangedDocumentContext>');
    });

    it('should include exchanged document with invoice details', () => {
      const invoice = createSampleInvoice();
      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('<rsm:ExchangedDocument>');
      expect(xml).toContain('<ram:ID>FX-2025-001</ram:ID>');
      expect(xml).toContain('<ram:TypeCode>380</ram:TypeCode>');
      expect(xml).toContain('<ram:IssueDateTime>');
      expect(xml).toContain('20250115');
      expect(xml).toContain('</rsm:ExchangedDocument>');
    });

    it('should include invoice notes', () => {
      const invoice = createSampleInvoice();
      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('<ram:IncludedNote>');
      expect(xml).toContain('<ram:Content>Merci pour votre commande</ram:Content>');
    });

    it('should include supply chain trade transaction', () => {
      const invoice = createSampleInvoice();
      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('<rsm:SupplyChainTradeTransaction>');
      expect(xml).toContain('</rsm:SupplyChainTradeTransaction>');
    });

    it('should include all invoice line items', () => {
      const invoice = createSampleInvoice();
      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('<ram:IncludedSupplyChainTradeLineItem>');
      expect(xml).toContain('<ram:LineID>1</ram:LineID>');
      expect(xml).toContain('<ram:LineID>2</ram:LineID>');

      // Line 1
      expect(xml).toContain('<ram:Name>License Logiciel Pro</ram:Name>');
      expect(xml).toContain('<ram:Description>License annuelle logiciel professionnel</ram:Description>');
      expect(xml).toContain('<ram:SellerAssignedID>LIC-PRO-2025</ram:SellerAssignedID>');
      expect(xml).toContain('<ram:BilledQuantity unitCode="C62">20</ram:BilledQuantity>');

      // Line 2
      expect(xml).toContain('<ram:Name>Support Technique</ram:Name>');
      expect(xml).toContain('<ram:BilledQuantity unitCode="HUR">40</ram:BilledQuantity>');
    });

    it('should include seller party in trade agreement', () => {
      const invoice = createSampleInvoice();
      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('<ram:ApplicableHeaderTradeAgreement>');
      expect(xml).toContain('<ram:SellerTradeParty>');
      expect(xml).toContain('<ram:Name>TechCorp France SARL</ram:Name>');
      expect(xml).toContain('<ram:GlobalID schemeID="VA">FR85252754800</ram:GlobalID>');
      expect(xml).toContain('25 Boulevard Haussmann');
      expect(xml).toContain('75009');
      expect(xml).toContain('Paris');
      expect(xml).toContain('<ram:CountryID>FR</ram:CountryID>');
    });

    it('should include buyer party in trade agreement', () => {
      const invoice = createSampleInvoice();
      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('<ram:BuyerTradeParty>');
      expect(xml).toContain('<ram:Name>Solutions Innovantes SAS</ram:Name>');
      expect(xml).toContain('100 Rue de Rivoli');
      expect(xml).toContain('75004');
    });

    it('should include contact information', () => {
      const invoice = createSampleInvoice();
      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('<ram:DefinedTradeContact>');
      expect(xml).toContain('<ram:PersonName>Marie Martin</ram:PersonName>');
      expect(xml).toContain('<ram:CompleteNumber>+33 1 98 76 54 32</ram:CompleteNumber>');
      expect(xml).toContain('<ram:URIID>contact@techcorp.fr</ram:URIID>');
    });

    it('should include header trade settlement with currency', () => {
      const invoice = createSampleInvoice();
      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('<ram:ApplicableHeaderTradeSettlement>');
      expect(xml).toContain('<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>');
    });

    it('should include payment means with bank details', () => {
      const invoice = createSampleInvoice();
      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('<ram:SpecifiedTradeSettlementPaymentMeans>');
      expect(xml).toContain('<ram:TypeCode>30</ram:TypeCode>');
      expect(xml).toContain('<ram:Information>FX-2025-001</ram:Information>');
      expect(xml).toContain('<ram:IBANID>FR7630006000011234567890189</ram:IBANID>');
      expect(xml).toContain('<ram:BICID>AGRIFRPP123</ram:BICID>');
    });

    it('should include payment terms', () => {
      const invoice = createSampleInvoice();
      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('<ram:SpecifiedTradePaymentTerms>');
      expect(xml).toContain('<ram:Description>Paiement à 30 jours</ram:Description>');
      expect(xml).toContain('<ram:DueDateDateTime>');
      expect(xml).toContain('20250215');
    });

    it('should include applicable trade tax', () => {
      const invoice = createSampleInvoice();
      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('<ram:ApplicableTradeTax>');
      expect(xml).toContain('<ram:CalculatedAmount>400.00</ram:CalculatedAmount>');
      expect(xml).toContain('<ram:TypeCode>VAT</ram:TypeCode>');
      expect(xml).toContain('<ram:BasisAmount>2000.00</ram:BasisAmount>');
      expect(xml).toContain('<ram:CategoryCode>S</ram:CategoryCode>');
      expect(xml).toContain('<ram:RateApplicablePercent>20</ram:RateApplicablePercent>');
    });

    it('should include monetary summation totals', () => {
      const invoice = createSampleInvoice();
      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('<ram:SpecifiedTradeSettlementHeaderMonetarySummation>');
      expect(xml).toContain('<ram:LineTotalAmount>2000.00</ram:LineTotalAmount>');
      expect(xml).toContain('<ram:TaxBasisTotalAmount>2000.00</ram:TaxBasisTotalAmount>');
      expect(xml).toContain('<ram:TaxTotalAmount currencyID="EUR">400.00</ram:TaxTotalAmount>');
      expect(xml).toContain('<ram:GrandTotalAmount>2400.00</ram:GrandTotalAmount>');
      expect(xml).toContain('<ram:DuePayableAmount>2400.00</ram:DuePayableAmount>');
    });

    it('should escape XML special characters', () => {
      const invoice = createSampleInvoice();
      invoice.invoiceLines[0].item.name = 'Product <A> & "B"';
      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('Product &lt;A&gt; &amp; &quot;B&quot;');
      expect(xml).not.toContain('Product <A> & "B"');
    });

    it('should handle allowances and charges', () => {
      const invoice = createSampleInvoice();
      invoice.allowanceCharge = [
        {
          chargeIndicator: false,
          allowanceChargeReason: 'Réduction client fidèle',
          amount: 100.00,
          baseAmount: 2000.00,
          multiplierFactorNumeric: 0.05,
          taxCategory: {
            id: VATCategory.STANDARD,
            percent: 20,
            taxScheme: { id: 'VAT' },
          },
        },
      ];

      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('<ram:SpecifiedTradeAllowanceCharge>');
      expect(xml).toContain('<udt:Indicator>false</udt:Indicator>');
      expect(xml).toContain('<ram:CalculationPercent>5</ram:CalculationPercent>');
      expect(xml).toContain('<ram:ActualAmount>100.00</ram:ActualAmount>');
      expect(xml).toContain('Réduction client fidèle');
    });

    it('should handle delivery information', () => {
      const invoice = createSampleInvoice();
      invoice.delivery = {
        actualDeliveryDate: '2025-01-10',
      };

      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('<ram:ApplicableHeaderTradeDelivery>');
      expect(xml).toContain('<ram:ActualDeliverySupplyChainEvent>');
      expect(xml).toContain('20250110');
    });

    it('should handle line periods', () => {
      const invoice = createSampleInvoice();
      invoice.invoiceLines[0].invoicePeriod = {
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('<ram:BillingSpecifiedPeriod>');
      expect(xml).toContain('20250101');
      expect(xml).toContain('20250131');
    });

    it('should handle prepaid amounts', () => {
      const invoice = createSampleInvoice();
      invoice.legalMonetaryTotal.prepaidAmount = 500.00;

      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('<ram:TotalPrepaidAmount>500.00</ram:TotalPrepaidAmount>');
    });

    it('should handle charges', () => {
      const invoice = createSampleInvoice();
      invoice.legalMonetaryTotal.chargeTotalAmount = 50.00;

      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('<ram:ChargeTotalAmount>50.00</ram:ChargeTotalAmount>');
    });

    it('should handle VAT exemption', () => {
      const invoice = createSampleInvoice();
      invoice.taxTotal[0].taxSubtotals[0].taxCategory = {
        id: VATCategory.EXEMPT,
        taxExemptionReason: 'Article 132 de la Directive 2006/112/CE',
        taxScheme: { id: 'VAT' },
      };

      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('<ram:CategoryCode>E</ram:CategoryCode>');
      expect(xml).toContain('<ram:ExemptionReason>Article 132 de la Directive 2006/112/CE</ram:ExemptionReason>');
    });

    it('should format dates correctly (YYYYMMDD)', () => {
      const invoice = createSampleInvoice();
      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('20250115'); // Issue date
      expect(xml).toContain('20250215'); // Due date
      expect(xml).not.toContain('2025-01-15');
    });

    it('should throw error for invalid invoice', () => {
      const invoice = createSampleInvoice();
      invoice.id = '';

      expect(() => facturXGenerator.generate(invoice)).toThrow('Invalid invoice data');
    });

    it('should handle credit note with references', () => {
      const invoice = createSampleInvoice();
      invoice.typeCode = InvoiceTypeCode.CREDIT_NOTE;
      invoice.invoiceDocumentReference = [
        {
          id: 'FX-2024-999',
          documentTypeCode: '380',
        },
      ];

      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('<ram:TypeCode>381</ram:TypeCode>');
      expect(xml).toContain('<ram:AdditionalReferencedDocument>');
      expect(xml).toContain('FX-2024-999');
    });

    it('should format amounts with 2 decimal places', () => {
      const invoice = createSampleInvoice();
      invoice.legalMonetaryTotal.payableAmount = 2345.678;

      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('2345.68');
      expect(xml).not.toContain('2345.678');
    });

    it('should handle line allowances/charges', () => {
      const invoice = createSampleInvoice();
      invoice.invoiceLines[0].allowanceCharge = [
        {
          chargeIndicator: false,
          allowanceChargeReason: 'Remise quantité',
          amount: 50.00,
        },
      ];

      const xml = facturXGenerator.generate(invoice);

      const line1Section = xml.split('<ram:LineID>2</ram:LineID>')[0];
      expect(line1Section).toContain('<ram:SpecifiedTradeAllowanceCharge>');
      expect(line1Section).toContain('Remise quantité');
    });

    it('should handle business process context', () => {
      const invoice = createSampleInvoice();
      invoice.profileId = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

      const xml = facturXGenerator.generate(invoice);

      expect(xml).toContain('<ram:BusinessProcessSpecifiedDocumentContextParameter>');
      expect(xml).toContain('urn:fdc:peppol.eu:2017:poacc:billing:01:1.0');
    });
  });

  describe('profiles', () => {
    it('should generate with EN16931 profile', () => {
      const invoice = createSampleInvoice();
      const xml = facturXGenerator.generate(invoice, {
        format: 'facturx',
        facturxProfile: FacturXProfile.EN16931,
      });

      expect(xml).toContain('<rsm:CrossIndustryInvoice');
    });

    it('should generate with BASIC profile', () => {
      const invoice = createSampleInvoice();
      const xml = facturXGenerator.generate(invoice, {
        format: 'facturx',
        facturxProfile: FacturXProfile.BASIC,
      });

      expect(xml).toContain('<rsm:CrossIndustryInvoice');
    });
  });
});
