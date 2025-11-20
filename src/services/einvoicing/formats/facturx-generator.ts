/**
 * Factur-X (ZUGFeRD) XML Generator
 *
 * Generates Factur-X XML (Cross Industry Invoice - CII format)
 * compliant with EN16931 European e-invoicing standard.
 *
 * Factur-X uses UN/CEFACT Cross Industry Invoice (CII) XML format
 * which is then embedded in a PDF/A-3 document.
 *
 * Reference: https://fnfe-mpe.org/factur-x/
 */

import {
  Invoice,
  InvoiceLine,
  Party,
  TaxSubtotal,
  AllowanceCharge,
  PostalAddress,
  PaymentMeans,
  InvoiceValidationResult,
  FormatGenerationOptions,
} from './types';

/**
 * Factur-X profiles
 */
export enum FacturXProfile {
  MINIMUM = 'MINIMUM',
  BASIC_WL = 'BASIC WL',    // Basic Without Lines
  BASIC = 'BASIC',
  EN16931 = 'EN16931',
  EXTENDED = 'EXTENDED',
}

/**
 * UN/CEFACT CII XML Namespaces
 */
const CII_NAMESPACES = {
  rsm: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
  udt: 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
  qdt: 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
};

/**
 * Factur-X (CII) Generator
 */
export class FacturXGenerator {
  /**
   * Generate Factur-X CII XML from invoice data
   */
  public generate(invoice: Invoice, options?: FormatGenerationOptions): string {
    // Validate invoice data first
    const validation = this.validate(invoice);
    if (!validation.valid) {
      throw new Error(`Invalid invoice data: ${validation.errors.join(', ')}`);
    }

    const profile = (options?.facturxProfile || 'EN16931') as FacturXProfile;
    const prettyPrint = options?.prettyPrint ?? true;
    const indent = prettyPrint ? 2 : 0;

    // Build XML document
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += this.buildCrossIndustryInvoice(invoice, profile, indent);

    return xml;
  }

  /**
   * Validate invoice data before generation
   */
  public validate(invoice: Invoice): InvoiceValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Mandatory fields (EN16931)
    if (!invoice.id || invoice.id.trim() === '') {
      errors.push('Invoice ID (BT-1) is mandatory');
    }
    if (!invoice.issueDate) {
      errors.push('Issue date (BT-2) is mandatory');
    }
    if (!invoice.typeCode) {
      errors.push('Invoice type code (BT-3) is mandatory');
    }
    if (!invoice.documentCurrencyCode) {
      errors.push('Document currency code (BT-5) is mandatory');
    }

    // Seller validation
    if (!invoice.accountingSupplierParty) {
      errors.push('Seller party (BG-4) is mandatory');
    } else {
      this.validateParty(invoice.accountingSupplierParty, 'Seller', errors);
    }

    // Buyer validation
    if (!invoice.accountingCustomerParty) {
      errors.push('Buyer party (BG-7) is mandatory');
    } else {
      this.validateParty(invoice.accountingCustomerParty, 'Buyer', errors);
    }

    // Tax total validation
    if (!invoice.taxTotal || invoice.taxTotal.length === 0) {
      errors.push('Tax total (BG-22) is mandatory');
    }

    // Legal monetary total validation
    if (!invoice.legalMonetaryTotal) {
      errors.push('Legal monetary total (BG-22) is mandatory');
    }

    // Invoice lines validation
    if (!invoice.invoiceLines || invoice.invoiceLines.length === 0) {
      errors.push('At least one invoice line (BG-25) is mandatory');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate party information
   */
  private validateParty(party: Party, role: string, errors: string[]): void {
    if (!party.partyLegalEntity?.registrationName) {
      errors.push(`${role} registration name is mandatory`);
    }
    if (!party.postalAddress) {
      errors.push(`${role} postal address is mandatory`);
    } else {
      if (!party.postalAddress.cityName) {
        errors.push(`${role} city name is mandatory`);
      }
      if (!party.postalAddress.postalZone) {
        errors.push(`${role} postal zone is mandatory`);
      }
      if (!party.postalAddress.countryCode) {
        errors.push(`${role} country code is mandatory`);
      }
    }
  }

  /**
   * Build root CrossIndustryInvoice element
   */
  private buildCrossIndustryInvoice(invoice: Invoice, profile: FacturXProfile, indent: number): string {
    let xml = '<rsm:CrossIndustryInvoice';
    xml += ` xmlns:rsm="${CII_NAMESPACES.rsm}"`;
    xml += ` xmlns:ram="${CII_NAMESPACES.ram}"`;
    xml += ` xmlns:udt="${CII_NAMESPACES.udt}"`;
    xml += ` xmlns:qdt="${CII_NAMESPACES.qdt}">\n`;

    // Exchange context (profile identification)
    xml += this.buildExchangedDocumentContext(invoice, profile, indent + 2);

    // Document header
    xml += this.buildExchangedDocument(invoice, indent + 2);

    // Transaction
    xml += this.buildSupplyChainTradeTransaction(invoice, indent + 2);

    xml += '</rsm:CrossIndustryInvoice>';
    return xml;
  }

  /**
   * Build ExchangedDocumentContext (profile info)
   */
  private buildExchangedDocumentContext(invoice: Invoice, _profile: FacturXProfile, indent: number): string {
    const ind = ' '.repeat(indent);
    let xml = `${ind}<rsm:ExchangedDocumentContext>\n`;

    // Business process context
    if (invoice.profileId) {
      xml += `${ind}  <ram:BusinessProcessSpecifiedDocumentContextParameter>\n`;
      xml += `${ind}    <ram:ID>${this.escapeXml(invoice.profileId)}</ram:ID>\n`;
      xml += `${ind}  </ram:BusinessProcessSpecifiedDocumentContextParameter>\n`;
    }

    // Guideline context (EN16931)
    xml += `${ind}  <ram:GuidelineSpecifiedDocumentContextParameter>\n`;
    xml += `${ind}    <ram:ID>${this.escapeXml(invoice.customizationId)}</ram:ID>\n`;
    xml += `${ind}  </ram:GuidelineSpecifiedDocumentContextParameter>\n`;

    xml += `${ind}</rsm:ExchangedDocumentContext>\n`;
    return xml;
  }

  /**
   * Build ExchangedDocument (invoice header)
   */
  private buildExchangedDocument(invoice: Invoice, indent: number): string {
    const ind = ' '.repeat(indent);
    let xml = `${ind}<rsm:ExchangedDocument>\n`;

    // Invoice number
    xml += `${ind}  <ram:ID>${this.escapeXml(invoice.id)}</ram:ID>\n`;

    // Invoice type code
    xml += `${ind}  <ram:TypeCode>${invoice.typeCode}</ram:TypeCode>\n`;

    // Issue date
    xml += `${ind}  <ram:IssueDateTime>\n`;
    xml += `${ind}    <udt:DateTimeString format="102">${this.formatDate(invoice.issueDate)}</udt:DateTimeString>\n`;
    xml += `${ind}  </ram:IssueDateTime>\n`;

    // Notes
    if (invoice.note) {
      xml += `${ind}  <ram:IncludedNote>\n`;
      xml += `${ind}    <ram:Content>${this.escapeXml(invoice.note)}</ram:Content>\n`;
      xml += `${ind}  </ram:IncludedNote>\n`;
    }

    xml += `${ind}</rsm:ExchangedDocument>\n`;
    return xml;
  }

  /**
   * Build SupplyChainTradeTransaction (main transaction data)
   */
  private buildSupplyChainTradeTransaction(invoice: Invoice, indent: number): string {
    const ind = ' '.repeat(indent);
    let xml = `${ind}<rsm:SupplyChainTradeTransaction>\n`;

    // Invoice lines
    invoice.invoiceLines.forEach((line) => {
      xml += this.buildIncludedSupplyChainTradeLineItem(line, invoice.documentCurrencyCode, indent + 2);
    });

    // Applicable header trade agreement (buyer/seller info, references)
    xml += this.buildApplicableHeaderTradeAgreement(invoice, indent + 2);

    // Applicable header trade delivery (delivery info)
    xml += this.buildApplicableHeaderTradeDelivery(invoice, indent + 2);

    // Applicable header trade settlement (payment, totals, taxes)
    xml += this.buildApplicableHeaderTradeSettlement(invoice, indent + 2);

    xml += `${ind}</rsm:SupplyChainTradeTransaction>\n`;
    return xml;
  }

  /**
   * Build invoice line item
   */
  private buildIncludedSupplyChainTradeLineItem(line: InvoiceLine, _currencyCode: string, indent: number): string {
    const ind = ' '.repeat(indent);
    let xml = `${ind}<ram:IncludedSupplyChainTradeLineItem>\n`;

    // Line document (ID, notes)
    xml += `${ind}  <ram:AssociatedDocumentLineDocument>\n`;
    xml += `${ind}    <ram:LineID>${this.escapeXml(line.id)}</ram:LineID>\n`;
    if (line.note) {
      xml += `${ind}    <ram:IncludedNote>\n`;
      xml += `${ind}      <ram:Content>${this.escapeXml(line.note)}</ram:Content>\n`;
      xml += `${ind}    </ram:IncludedNote>\n`;
    }
    xml += `${ind}  </ram:AssociatedDocumentLineDocument>\n`;

    // Specified trade product (item info)
    xml += `${ind}  <ram:SpecifiedTradeProduct>\n`;
    if (line.item.sellersItemIdentification) {
      xml += `${ind}    <ram:SellerAssignedID>${this.escapeXml(line.item.sellersItemIdentification)}</ram:SellerAssignedID>\n`;
    }
    if (line.item.standardItemIdentification) {
      xml += `${ind}    <ram:GlobalID>${this.escapeXml(line.item.standardItemIdentification)}</ram:GlobalID>\n`;
    }
    xml += `${ind}    <ram:Name>${this.escapeXml(line.item.name)}</ram:Name>\n`;
    if (line.item.description) {
      xml += `${ind}    <ram:Description>${this.escapeXml(line.item.description)}</ram:Description>\n`;
    }
    xml += `${ind}  </ram:SpecifiedTradeProduct>\n`;

    // Line trade agreement (price before allowances)
    xml += `${ind}  <ram:SpecifiedLineTradeAgreement>\n`;
    xml += `${ind}    <ram:NetPriceProductTradePrice>\n`;
    xml += `${ind}      <ram:ChargeAmount>${this.formatAmount(line.price.priceAmount)}</ram:ChargeAmount>\n`;
    if (line.price.baseQuantity) {
      xml += `${ind}      <ram:BasisQuantity unitCode="${line.unitCode}">${line.price.baseQuantity}</ram:BasisQuantity>\n`;
    }
    xml += `${ind}    </ram:NetPriceProductTradePrice>\n`;
    xml += `${ind}  </ram:SpecifiedLineTradeAgreement>\n`;

    // Line trade delivery (quantity)
    xml += `${ind}  <ram:SpecifiedLineTradeDelivery>\n`;
    xml += `${ind}    <ram:BilledQuantity unitCode="${line.unitCode}">${line.invoicedQuantity}</ram:BilledQuantity>\n`;
    xml += `${ind}  </ram:SpecifiedLineTradeDelivery>\n`;

    // Line trade settlement (totals, taxes)
    xml += `${ind}  <ram:SpecifiedLineTradeSettlement>\n`;

    // Tax
    xml += `${ind}    <ram:ApplicableTradeTax>\n`;
    xml += `${ind}      <ram:TypeCode>VAT</ram:TypeCode>\n`;
    xml += `${ind}      <ram:CategoryCode>${line.item.classifiedTaxCategory.id}</ram:CategoryCode>\n`;
    if (line.item.classifiedTaxCategory.percent !== undefined) {
      xml += `${ind}      <ram:RateApplicablePercent>${line.item.classifiedTaxCategory.percent}</ram:RateApplicablePercent>\n`;
    }
    xml += `${ind}    </ram:ApplicableTradeTax>\n`;

    // Line allowances/charges
    if (line.allowanceCharge && line.allowanceCharge.length > 0) {
      line.allowanceCharge.forEach((ac) => {
        xml += this.buildTradeAllowanceCharge(ac, indent + 4);
      });
    }

    // Line totals
    xml += `${ind}    <ram:SpecifiedTradeSettlementLineMonetarySummation>\n`;
    xml += `${ind}      <ram:LineTotalAmount>${this.formatAmount(line.lineExtensionAmount)}</ram:LineTotalAmount>\n`;
    xml += `${ind}    </ram:SpecifiedTradeSettlementLineMonetarySummation>\n`;

    xml += `${ind}  </ram:SpecifiedLineTradeSettlement>\n`;

    xml += `${ind}</ram:IncludedSupplyChainTradeLineItem>\n`;
    return xml;
  }

  /**
   * Build header trade agreement (parties, references)
   */
  private buildApplicableHeaderTradeAgreement(invoice: Invoice, indent: number): string {
    const ind = ' '.repeat(indent);
    let xml = `${ind}<ram:ApplicableHeaderTradeAgreement>\n`;

    // Buyer reference
    if (invoice.buyerReference) {
      xml += `${ind}  <ram:BuyerReference>${this.escapeXml(invoice.buyerReference)}</ram:BuyerReference>\n`;
    }

    // Seller party
    xml += this.buildTradeParty(invoice.accountingSupplierParty, 'SellerTradeParty', indent + 2);

    // Buyer party
    xml += this.buildTradeParty(invoice.accountingCustomerParty, 'BuyerTradeParty', indent + 2);

    // Document references
    if (invoice.invoiceDocumentReference && invoice.invoiceDocumentReference.length > 0) {
      invoice.invoiceDocumentReference.forEach((ref) => {
        xml += `${ind}  <ram:AdditionalReferencedDocument>\n`;
        xml += `${ind}    <ram:IssuerAssignedID>${this.escapeXml(ref.id)}</ram:IssuerAssignedID>\n`;
        if (ref.documentTypeCode) {
          xml += `${ind}    <ram:TypeCode>${ref.documentTypeCode}</ram:TypeCode>\n`;
        }
        xml += `${ind}  </ram:AdditionalReferencedDocument>\n`;
      });
    }

    xml += `${ind}</ram:ApplicableHeaderTradeAgreement>\n`;
    return xml;
  }

  /**
   * Build header trade delivery
   */
  private buildApplicableHeaderTradeDelivery(invoice: Invoice, indent: number): string {
    const ind = ' '.repeat(indent);
    let xml = `${ind}<ram:ApplicableHeaderTradeDelivery>\n`;

    if (invoice.delivery) {
      xml += `${ind}  <ram:ActualDeliverySupplyChainEvent>\n`;
      if (invoice.delivery.actualDeliveryDate) {
        xml += `${ind}    <ram:OccurrenceDateTime>\n`;
        xml += `${ind}      <udt:DateTimeString format="102">${this.formatDate(invoice.delivery.actualDeliveryDate)}</udt:DateTimeString>\n`;
        xml += `${ind}    </ram:OccurrenceDateTime>\n`;
      }
      xml += `${ind}  </ram:ActualDeliverySupplyChainEvent>\n`;
    }

    xml += `${ind}</ram:ApplicableHeaderTradeDelivery>\n`;
    return xml;
  }

  /**
   * Build header trade settlement (payment, taxes, totals)
   */
  private buildApplicableHeaderTradeSettlement(invoice: Invoice, indent: number): string {
    const ind = ' '.repeat(indent);
    let xml = `${ind}<ram:ApplicableHeaderTradeSettlement>\n`;

    // Currency
    xml += `${ind}  <ram:InvoiceCurrencyCode>${invoice.documentCurrencyCode}</ram:InvoiceCurrencyCode>\n`;

    // Payee
    if (invoice.payeeParty) {
      xml += this.buildTradeParty(invoice.payeeParty, 'PayeeTradeParty', indent + 2);
    }

    // Payment means
    if (invoice.paymentMeans && invoice.paymentMeans.length > 0) {
      invoice.paymentMeans.forEach((pm) => {
        xml += this.buildSpecifiedTradeSettlementPaymentMeans(pm, indent + 2);
      });
    }

    // Tax totals
    invoice.taxTotal.forEach((tt) => {
      tt.taxSubtotals.forEach((subtotal) => {
        xml += this.buildApplicableTradeTax(subtotal, indent + 2);
      });
    });

    // Period (if any line has period)
    const hasLinePeriod = invoice.invoiceLines.some(line => line.invoicePeriod);
    if (hasLinePeriod) {
      // Use first line period as invoice period (simplified)
      const period = invoice.invoiceLines.find(line => line.invoicePeriod)?.invoicePeriod;
      if (period) {
        xml += `${ind}  <ram:BillingSpecifiedPeriod>\n`;
        if (period.startDate) {
          xml += `${ind}    <ram:StartDateTime>\n`;
          xml += `${ind}      <udt:DateTimeString format="102">${this.formatDate(period.startDate)}</udt:DateTimeString>\n`;
          xml += `${ind}    </ram:StartDateTime>\n`;
        }
        if (period.endDate) {
          xml += `${ind}    <ram:EndDateTime>\n`;
          xml += `${ind}      <udt:DateTimeString format="102">${this.formatDate(period.endDate)}</udt:DateTimeString>\n`;
          xml += `${ind}    </ram:EndDateTime>\n`;
        }
        xml += `${ind}  </ram:BillingSpecifiedPeriod>\n`;
      }
    }

    // Document level allowances/charges
    if (invoice.allowanceCharge && invoice.allowanceCharge.length > 0) {
      invoice.allowanceCharge.forEach((ac) => {
        xml += this.buildTradeAllowanceCharge(ac, indent + 2);
      });
    }

    // Payment terms
    if (invoice.paymentTerms?.note) {
      xml += `${ind}  <ram:SpecifiedTradePaymentTerms>\n`;
      xml += `${ind}    <ram:Description>${this.escapeXml(invoice.paymentTerms.note)}</ram:Description>\n`;
      if (invoice.dueDate) {
        xml += `${ind}    <ram:DueDateDateTime>\n`;
        xml += `${ind}      <udt:DateTimeString format="102">${this.formatDate(invoice.dueDate)}</udt:DateTimeString>\n`;
        xml += `${ind}    </ram:DueDateDateTime>\n`;
      }
      xml += `${ind}  </ram:SpecifiedTradePaymentTerms>\n`;
    }

    // Monetary summation (totals)
    xml += this.buildSpecifiedTradeSettlementHeaderMonetarySummation(invoice, indent + 2);

    xml += `${ind}</ram:ApplicableHeaderTradeSettlement>\n`;
    return xml;
  }

  /**
   * Build trade party (seller, buyer, payee)
   */
  private buildTradeParty(party: Party, elementName: string, indent: number): string {
    const ind = ' '.repeat(indent);
    let xml = `${ind}<ram:${elementName}>\n`;

    // Party ID
    if (party.partyIdentification && party.partyIdentification.length > 0) {
      party.partyIdentification.forEach((id) => {
        const schemeAttr = id.schemeId ? ` schemeID="${id.schemeId}"` : '';
        xml += `${ind}  <ram:ID${schemeAttr}>${this.escapeXml(id.id)}</ram:ID>\n`;
      });
    }

    // Global ID (VAT number)
    if (party.partyTaxScheme && party.partyTaxScheme.length > 0) {
      party.partyTaxScheme.forEach((pts) => {
        xml += `${ind}  <ram:GlobalID schemeID="VA">${this.escapeXml(pts.companyId)}</ram:GlobalID>\n`;
      });
    }

    // Name
    xml += `${ind}  <ram:Name>${this.escapeXml(party.partyLegalEntity.registrationName)}</ram:Name>\n`;

    // Legal organization (company ID)
    if (party.partyLegalEntity.companyId) {
      xml += `${ind}  <ram:SpecifiedLegalOrganization>\n`;
      const schemeAttr = party.partyLegalEntity.companyIdScheme ? ` schemeID="${party.partyLegalEntity.companyIdScheme}"` : '';
      xml += `${ind}    <ram:ID${schemeAttr}>${this.escapeXml(party.partyLegalEntity.companyId)}</ram:ID>\n`;
      xml += `${ind}  </ram:SpecifiedLegalOrganization>\n`;
    }

    // Contact
    if (party.contact) {
      xml += `${ind}  <ram:DefinedTradeContact>\n`;
      if (party.contact.name) {
        xml += `${ind}    <ram:PersonName>${this.escapeXml(party.contact.name)}</ram:PersonName>\n`;
      }
      if (party.contact.telephone) {
        xml += `${ind}    <ram:TelephoneUniversalCommunication>\n`;
        xml += `${ind}      <ram:CompleteNumber>${this.escapeXml(party.contact.telephone)}</ram:CompleteNumber>\n`;
        xml += `${ind}    </ram:TelephoneUniversalCommunication>\n`;
      }
      if (party.contact.email) {
        xml += `${ind}    <ram:EmailURIUniversalCommunication>\n`;
        xml += `${ind}      <ram:URIID>${this.escapeXml(party.contact.email)}</ram:URIID>\n`;
        xml += `${ind}    </ram:EmailURIUniversalCommunication>\n`;
      }
      xml += `${ind}  </ram:DefinedTradeContact>\n`;
    }

    // Postal address
    xml += this.buildTradeAddress(party.postalAddress, indent + 2);

    // Electronic address
    if (party.endpointId) {
      xml += `${ind}  <ram:URIUniversalCommunication>\n`;
      const schemeAttr = party.endpointScheme ? ` schemeID="${party.endpointScheme}"` : '';
      xml += `${ind}    <ram:URIID${schemeAttr}>${this.escapeXml(party.endpointId)}</ram:URIID>\n`;
      xml += `${ind}  </ram:URIUniversalCommunication>\n`;
    }

    // Tax registration
    if (party.partyTaxScheme && party.partyTaxScheme.length > 0) {
      party.partyTaxScheme.forEach((pts) => {
        xml += `${ind}  <ram:SpecifiedTaxRegistration>\n`;
        xml += `${ind}    <ram:ID schemeID="${pts.taxScheme.id}">${this.escapeXml(pts.companyId)}</ram:ID>\n`;
        xml += `${ind}  </ram:SpecifiedTaxRegistration>\n`;
      });
    }

    xml += `${ind}</ram:${elementName}>\n`;
    return xml;
  }

  /**
   * Build trade address
   */
  private buildTradeAddress(address: PostalAddress, indent: number): string {
    const ind = ' '.repeat(indent);
    let xml = `${ind}<ram:PostalTradeAddress>\n`;

    xml += `${ind}  <ram:PostcodeCode>${this.escapeXml(address.postalZone)}</ram:PostcodeCode>\n`;

    if (address.streetName) {
      xml += `${ind}  <ram:LineOne>${this.escapeXml(address.streetName)}</ram:LineOne>\n`;
    }
    if (address.additionalStreetName) {
      xml += `${ind}  <ram:LineTwo>${this.escapeXml(address.additionalStreetName)}</ram:LineTwo>\n`;
    }

    xml += `${ind}  <ram:CityName>${this.escapeXml(address.cityName)}</ram:CityName>\n`;

    xml += `${ind}  <ram:CountryID>${address.countryCode}</ram:CountryID>\n`;

    if (address.countrySubentity) {
      xml += `${ind}  <ram:CountrySubDivisionName>${this.escapeXml(address.countrySubentity)}</ram:CountrySubDivisionName>\n`;
    }

    xml += `${ind}</ram:PostalTradeAddress>\n`;
    return xml;
  }

  /**
   * Build payment means
   */
  private buildSpecifiedTradeSettlementPaymentMeans(pm: PaymentMeans, indent: number): string {
    const ind = ' '.repeat(indent);
    let xml = `${ind}<ram:SpecifiedTradeSettlementPaymentMeans>\n`;

    xml += `${ind}  <ram:TypeCode>${pm.paymentMeansCode}</ram:TypeCode>\n`;

    if (pm.paymentId) {
      xml += `${ind}  <ram:Information>${this.escapeXml(pm.paymentId)}</ram:Information>\n`;
    }

    if (pm.payeeFinancialAccount) {
      xml += `${ind}  <ram:PayeePartyCreditorFinancialAccount>\n`;
      xml += `${ind}    <ram:IBANID>${this.escapeXml(pm.payeeFinancialAccount.id)}</ram:IBANID>\n`;
      if (pm.payeeFinancialAccount.name) {
        xml += `${ind}    <ram:AccountName>${this.escapeXml(pm.payeeFinancialAccount.name)}</ram:AccountName>\n`;
      }
      xml += `${ind}  </ram:PayeePartyCreditorFinancialAccount>\n`;

      if (pm.payeeFinancialAccount.financialInstitutionBranch?.id) {
        xml += `${ind}  <ram:PayeeSpecifiedCreditorFinancialInstitution>\n`;
        xml += `${ind}    <ram:BICID>${this.escapeXml(pm.payeeFinancialAccount.financialInstitutionBranch.id)}</ram:BICID>\n`;
        xml += `${ind}  </ram:PayeeSpecifiedCreditorFinancialInstitution>\n`;
      }
    }

    xml += `${ind}</ram:SpecifiedTradeSettlementPaymentMeans>\n`;
    return xml;
  }

  /**
   * Build allowance/charge
   */
  private buildTradeAllowanceCharge(ac: AllowanceCharge, indent: number): string {
    const ind = ' '.repeat(indent);
    const elementName = ac.chargeIndicator ? 'SpecifiedTradeAllowanceCharge' : 'SpecifiedTradeAllowanceCharge';
    let xml = `${ind}<ram:${elementName}>\n`;

    xml += `${ind}  <ram:ChargeIndicator>\n`;
    xml += `${ind}    <udt:Indicator>${ac.chargeIndicator}</udt:Indicator>\n`;
    xml += `${ind}  </ram:ChargeIndicator>\n`;

    if (ac.multiplierFactorNumeric !== undefined) {
      xml += `${ind}  <ram:CalculationPercent>${ac.multiplierFactorNumeric * 100}</ram:CalculationPercent>\n`;
    }

    if (ac.baseAmount !== undefined) {
      xml += `${ind}  <ram:BasisAmount>${this.formatAmount(ac.baseAmount)}</ram:BasisAmount>\n`;
    }

    xml += `${ind}  <ram:ActualAmount>${this.formatAmount(ac.amount)}</ram:ActualAmount>\n`;

    if (ac.allowanceChargeReason) {
      xml += `${ind}  <ram:Reason>${this.escapeXml(ac.allowanceChargeReason)}</ram:Reason>\n`;
    }

    if (ac.taxCategory) {
      xml += `${ind}  <ram:CategoryTradeTax>\n`;
      xml += `${ind}    <ram:TypeCode>VAT</ram:TypeCode>\n`;
      xml += `${ind}    <ram:CategoryCode>${ac.taxCategory.id}</ram:CategoryCode>\n`;
      if (ac.taxCategory.percent !== undefined) {
        xml += `${ind}    <ram:RateApplicablePercent>${ac.taxCategory.percent}</ram:RateApplicablePercent>\n`;
      }
      xml += `${ind}  </ram:CategoryTradeTax>\n`;
    }

    xml += `${ind}</ram:${elementName}>\n`;
    return xml;
  }

  /**
   * Build applicable trade tax
   */
  private buildApplicableTradeTax(subtotal: TaxSubtotal, indent: number): string {
    const ind = ' '.repeat(indent);
    let xml = `${ind}<ram:ApplicableTradeTax>\n`;

    xml += `${ind}  <ram:CalculatedAmount>${this.formatAmount(subtotal.taxAmount)}</ram:CalculatedAmount>\n`;
    xml += `${ind}  <ram:TypeCode>VAT</ram:TypeCode>\n`;

    if (subtotal.taxCategory.taxExemptionReason) {
      xml += `${ind}  <ram:ExemptionReason>${this.escapeXml(subtotal.taxCategory.taxExemptionReason)}</ram:ExemptionReason>\n`;
    }

    xml += `${ind}  <ram:BasisAmount>${this.formatAmount(subtotal.taxableAmount)}</ram:BasisAmount>\n`;
    xml += `${ind}  <ram:CategoryCode>${subtotal.taxCategory.id}</ram:CategoryCode>\n`;

    if (subtotal.taxCategory.percent !== undefined) {
      xml += `${ind}  <ram:RateApplicablePercent>${subtotal.taxCategory.percent}</ram:RateApplicablePercent>\n`;
    }

    xml += `${ind}</ram:ApplicableTradeTax>\n`;
    return xml;
  }

  /**
   * Build monetary summation (totals)
   */
  private buildSpecifiedTradeSettlementHeaderMonetarySummation(invoice: Invoice, indent: number): string {
    const ind = ' '.repeat(indent);
    const total = invoice.legalMonetaryTotal;
    let xml = `${ind}<ram:SpecifiedTradeSettlementHeaderMonetarySummation>\n`;

    xml += `${ind}  <ram:LineTotalAmount>${this.formatAmount(total.lineExtensionAmount)}</ram:LineTotalAmount>\n`;

    if (total.chargeTotalAmount !== undefined && total.chargeTotalAmount > 0) {
      xml += `${ind}  <ram:ChargeTotalAmount>${this.formatAmount(total.chargeTotalAmount)}</ram:ChargeTotalAmount>\n`;
    }

    if (total.allowanceTotalAmount !== undefined && total.allowanceTotalAmount > 0) {
      xml += `${ind}  <ram:AllowanceTotalAmount>${this.formatAmount(total.allowanceTotalAmount)}</ram:AllowanceTotalAmount>\n`;
    }

    xml += `${ind}  <ram:TaxBasisTotalAmount>${this.formatAmount(total.taxExclusiveAmount)}</ram:TaxBasisTotalAmount>\n`;

    // Tax total
    const taxAmount = invoice.taxTotal.reduce((sum, tt) => sum + tt.taxAmount, 0);
    xml += `${ind}  <ram:TaxTotalAmount currencyID="${invoice.documentCurrencyCode}">${this.formatAmount(taxAmount)}</ram:TaxTotalAmount>\n`;

    xml += `${ind}  <ram:GrandTotalAmount>${this.formatAmount(total.taxInclusiveAmount)}</ram:GrandTotalAmount>\n`;

    if (total.prepaidAmount !== undefined && total.prepaidAmount > 0) {
      xml += `${ind}  <ram:TotalPrepaidAmount>${this.formatAmount(total.prepaidAmount)}</ram:TotalPrepaidAmount>\n`;
    }

    xml += `${ind}  <ram:DuePayableAmount>${this.formatAmount(total.payableAmount)}</ram:DuePayableAmount>\n`;

    xml += `${ind}</ram:SpecifiedTradeSettlementHeaderMonetarySummation>\n`;
    return xml;
  }

  /**
   * Format date to YYYYMMDD
   */
  private formatDate(isoDate: string): string {
    return isoDate.replace(/-/g, '');
  }

  /**
   * Format monetary amount to 2 decimal places
   */
  private formatAmount(amount: number): string {
    return amount.toFixed(2);
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

// Export singleton instance
export const facturXGenerator = new FacturXGenerator();
