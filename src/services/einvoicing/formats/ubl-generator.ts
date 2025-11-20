/**
 * UBL 2.1 Invoice Generator
 *
 * Generates UBL (Universal Business Language) 2.1 Invoice XML files
 * compliant with EN16931 European e-invoicing standard.
 *
 * Reference: http://docs.oasis-open.org/ubl/UBL-2.1.html
 */

import {
  Invoice,
  InvoiceLine,
  Party,
  TaxTotal,
  TaxSubtotal,
  AllowanceCharge,
  PostalAddress,
  PaymentMeans,
  InvoiceValidationResult,
  FormatGenerationOptions,
  DocumentReference,
} from './types';

/**
 * UBL 2.1 XML Namespaces
 */
const UBL_NAMESPACES = {
  invoice: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
};

/**
 * UBL Invoice Generator
 */
export class UBLGenerator {
  /**
   * Generate UBL 2.1 Invoice XML from invoice data
   */
  public generate(invoice: Invoice, options?: FormatGenerationOptions): string {
    // Validate invoice data first
    const validation = this.validate(invoice);
    if (!validation.valid) {
      throw new Error(`Invalid invoice data: ${validation.errors.join(', ')}`);
    }

    const prettyPrint = options?.prettyPrint ?? true;
    const indent = prettyPrint ? 2 : 0;

    // Build XML document
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += this.buildInvoiceElement(invoice, indent);

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
    } else {
      invoice.invoiceLines.forEach((line, index) => {
        this.validateInvoiceLine(line, index, errors);
      });
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
   * Validate invoice line
   */
  private validateInvoiceLine(line: InvoiceLine, index: number, errors: string[]): void {
    if (!line.id) {
      errors.push(`Line ${index + 1}: Line ID (BT-126) is mandatory`);
    }
    if (line.invoicedQuantity === undefined || line.invoicedQuantity === null) {
      errors.push(`Line ${index + 1}: Invoiced quantity (BT-129) is mandatory`);
    }
    if (!line.unitCode) {
      errors.push(`Line ${index + 1}: Unit code (BT-130) is mandatory`);
    }
    if (line.lineExtensionAmount === undefined || line.lineExtensionAmount === null) {
      errors.push(`Line ${index + 1}: Line extension amount (BT-131) is mandatory`);
    }
    if (!line.item) {
      errors.push(`Line ${index + 1}: Item information (BG-31) is mandatory`);
    } else if (!line.item.name) {
      errors.push(`Line ${index + 1}: Item name (BT-153) is mandatory`);
    }
    if (!line.price) {
      errors.push(`Line ${index + 1}: Price (BG-29) is mandatory`);
    }
  }

  /**
   * Build root Invoice element
   */
  private buildInvoiceElement(invoice: Invoice, indent: number): string {
    let xml = '<Invoice';
    xml += ` xmlns="${UBL_NAMESPACES.invoice}"`;
    xml += ` xmlns:cac="${UBL_NAMESPACES.cac}"`;
    xml += ` xmlns:cbc="${UBL_NAMESPACES.cbc}">\n`;

    // Customization and profile
    xml += this.element('cbc:CustomizationID', invoice.customizationId, indent + 2);
    xml += this.element('cbc:ProfileID', invoice.profileId, indent + 2);

    // Invoice identification
    xml += this.element('cbc:ID', invoice.id, indent + 2);
    xml += this.element('cbc:IssueDate', invoice.issueDate, indent + 2);
    if (invoice.dueDate) {
      xml += this.element('cbc:DueDate', invoice.dueDate, indent + 2);
    }
    xml += this.element('cbc:InvoiceTypeCode', invoice.typeCode, indent + 2);

    if (invoice.note) {
      xml += this.element('cbc:Note', this.escapeXml(invoice.note), indent + 2);
    }

    xml += this.element('cbc:DocumentCurrencyCode', invoice.documentCurrencyCode, indent + 2);
    if (invoice.taxCurrencyCode) {
      xml += this.element('cbc:TaxCurrencyCode', invoice.taxCurrencyCode, indent + 2);
    }

    if (invoice.accountingCost) {
      xml += this.element('cbc:AccountingCost', this.escapeXml(invoice.accountingCost), indent + 2);
    }
    if (invoice.buyerReference) {
      xml += this.element('cbc:BuyerReference', this.escapeXml(invoice.buyerReference), indent + 2);
    }

    // Document references
    if (invoice.invoiceDocumentReference && invoice.invoiceDocumentReference.length > 0) {
      invoice.invoiceDocumentReference.forEach((ref) => {
        xml += this.buildDocumentReference(ref, 'InvoiceDocumentReference', indent + 2);
      });
    }

    if (invoice.additionalDocumentReference && invoice.additionalDocumentReference.length > 0) {
      invoice.additionalDocumentReference.forEach((ref) => {
        xml += this.buildDocumentReference(ref, 'AdditionalDocumentReference', indent + 2);
      });
    }

    // Parties
    xml += this.buildParty(invoice.accountingSupplierParty, 'AccountingSupplierParty', indent + 2);
    xml += this.buildParty(invoice.accountingCustomerParty, 'AccountingCustomerParty', indent + 2);

    if (invoice.payeeParty) {
      xml += this.buildParty(invoice.payeeParty, 'PayeeParty', indent + 2);
    }

    // Delivery
    if (invoice.delivery) {
      xml += this.buildDelivery(invoice.delivery, indent + 2);
    }

    // Payment means
    if (invoice.paymentMeans && invoice.paymentMeans.length > 0) {
      invoice.paymentMeans.forEach((pm) => {
        xml += this.buildPaymentMeans(pm, indent + 2);
      });
    }

    // Payment terms
    if (invoice.paymentTerms) {
      xml += `${' '.repeat(indent + 2)}<cac:PaymentTerms>\n`;
      if (invoice.paymentTerms.note) {
        xml += this.element('cbc:Note', this.escapeXml(invoice.paymentTerms.note), indent + 4);
      }
      xml += `${' '.repeat(indent + 2)}</cac:PaymentTerms>\n`;
    }

    // Allowances and charges
    if (invoice.allowanceCharge && invoice.allowanceCharge.length > 0) {
      invoice.allowanceCharge.forEach((ac) => {
        xml += this.buildAllowanceCharge(ac, indent + 2);
      });
    }

    // Tax total
    invoice.taxTotal.forEach((tt) => {
      xml += this.buildTaxTotal(tt, invoice.documentCurrencyCode, indent + 2);
    });

    // Legal monetary total
    xml += this.buildLegalMonetaryTotal(invoice.legalMonetaryTotal, invoice.documentCurrencyCode, indent + 2);

    // Invoice lines
    invoice.invoiceLines.forEach((line) => {
      xml += this.buildInvoiceLine(line, invoice.documentCurrencyCode, indent + 2);
    });

    xml += '</Invoice>';
    return xml;
  }

  /**
   * Build party element (Seller, Buyer, Payee)
   */
  private buildParty(party: Party, elementName: string, indent: number): string {
    const ind = ' '.repeat(indent);
    let xml = `${ind}<cac:${elementName}>\n`;
    xml += `${ind}  <cac:Party>\n`;

    // Endpoint
    if (party.endpointId) {
      const schemeAttr = party.endpointScheme ? ` schemeID="${party.endpointScheme}"` : '';
      xml += `${ind}    <cbc:EndpointID${schemeAttr}>${this.escapeXml(party.endpointId)}</cbc:EndpointID>\n`;
    }

    // Party identification
    if (party.partyIdentification && party.partyIdentification.length > 0) {
      party.partyIdentification.forEach((id) => {
        xml += `${ind}    <cac:PartyIdentification>\n`;
        const schemeAttr = id.schemeId ? ` schemeID="${id.schemeId}"` : '';
        xml += `${ind}      <cbc:ID${schemeAttr}>${this.escapeXml(id.id)}</cbc:ID>\n`;
        xml += `${ind}    </cac:PartyIdentification>\n`;
      });
    }

    // Party name
    if (party.partyName) {
      xml += `${ind}    <cac:PartyName>\n`;
      xml += `${ind}      <cbc:Name>${this.escapeXml(party.partyName)}</cbc:Name>\n`;
      xml += `${ind}    </cac:PartyName>\n`;
    }

    // Postal address
    xml += this.buildPostalAddress(party.postalAddress, indent + 4);

    // Party tax scheme
    if (party.partyTaxScheme && party.partyTaxScheme.length > 0) {
      party.partyTaxScheme.forEach((pts) => {
        xml += `${ind}    <cac:PartyTaxScheme>\n`;
        xml += `${ind}      <cbc:CompanyID>${this.escapeXml(pts.companyId)}</cbc:CompanyID>\n`;
        xml += `${ind}      <cac:TaxScheme>\n`;
        xml += `${ind}        <cbc:ID>${pts.taxScheme.id}</cbc:ID>\n`;
        xml += `${ind}      </cac:TaxScheme>\n`;
        xml += `${ind}    </cac:PartyTaxScheme>\n`;
      });
    }

    // Party legal entity
    xml += `${ind}    <cac:PartyLegalEntity>\n`;
    xml += `${ind}      <cbc:RegistrationName>${this.escapeXml(party.partyLegalEntity.registrationName)}</cbc:RegistrationName>\n`;
    if (party.partyLegalEntity.companyId) {
      const schemeAttr = party.partyLegalEntity.companyIdScheme ? ` schemeID="${party.partyLegalEntity.companyIdScheme}"` : '';
      xml += `${ind}      <cbc:CompanyID${schemeAttr}>${this.escapeXml(party.partyLegalEntity.companyId)}</cbc:CompanyID>\n`;
    }
    if (party.partyLegalEntity.companyLegalForm) {
      xml += `${ind}      <cbc:CompanyLegalForm>${this.escapeXml(party.partyLegalEntity.companyLegalForm)}</cbc:CompanyLegalForm>\n`;
    }
    xml += `${ind}    </cac:PartyLegalEntity>\n`;

    // Contact
    if (party.contact) {
      xml += `${ind}    <cac:Contact>\n`;
      if (party.contact.name) {
        xml += `${ind}      <cbc:Name>${this.escapeXml(party.contact.name)}</cbc:Name>\n`;
      }
      if (party.contact.telephone) {
        xml += `${ind}      <cbc:Telephone>${this.escapeXml(party.contact.telephone)}</cbc:Telephone>\n`;
      }
      if (party.contact.email) {
        xml += `${ind}      <cbc:ElectronicMail>${this.escapeXml(party.contact.email)}</cbc:ElectronicMail>\n`;
      }
      xml += `${ind}    </cac:Contact>\n`;
    }

    xml += `${ind}  </cac:Party>\n`;
    xml += `${ind}</cac:${elementName}>\n`;
    return xml;
  }

  /**
   * Build postal address element
   */
  private buildPostalAddress(address: PostalAddress, indent: number): string {
    const ind = ' '.repeat(indent);
    let xml = `${ind}<cac:PostalAddress>\n`;

    if (address.streetName) {
      xml += `${ind}  <cbc:StreetName>${this.escapeXml(address.streetName)}</cbc:StreetName>\n`;
    }
    if (address.additionalStreetName) {
      xml += `${ind}  <cbc:AdditionalStreetName>${this.escapeXml(address.additionalStreetName)}</cbc:AdditionalStreetName>\n`;
    }
    xml += `${ind}  <cbc:CityName>${this.escapeXml(address.cityName)}</cbc:CityName>\n`;
    xml += `${ind}  <cbc:PostalZone>${this.escapeXml(address.postalZone)}</cbc:PostalZone>\n`;
    if (address.countrySubentity) {
      xml += `${ind}  <cbc:CountrySubentity>${this.escapeXml(address.countrySubentity)}</cbc:CountrySubentity>\n`;
    }
    xml += `${ind}  <cac:Country>\n`;
    xml += `${ind}    <cbc:IdentificationCode>${address.countryCode}</cbc:IdentificationCode>\n`;
    xml += `${ind}  </cac:Country>\n`;

    xml += `${ind}</cac:PostalAddress>\n`;
    return xml;
  }

  /**
   * Build delivery element
   */
  private buildDelivery(delivery: Invoice['delivery'], indent: number): string {
    if (!delivery) return '';

    const ind = ' '.repeat(indent);
    let xml = `${ind}<cac:Delivery>\n`;

    if (delivery.actualDeliveryDate) {
      xml += `${ind}  <cbc:ActualDeliveryDate>${delivery.actualDeliveryDate}</cbc:ActualDeliveryDate>\n`;
    }

    if (delivery.deliveryLocation) {
      xml += `${ind}  <cac:DeliveryLocation>\n`;
      if (delivery.deliveryLocation.id) {
        xml += `${ind}    <cbc:ID>${this.escapeXml(delivery.deliveryLocation.id)}</cbc:ID>\n`;
      }
      if (delivery.deliveryLocation.address) {
        xml += this.buildPostalAddress(delivery.deliveryLocation.address, indent + 4);
      }
      xml += `${ind}  </cac:DeliveryLocation>\n`;
    }

    if (delivery.deliveryPartyName) {
      xml += `${ind}  <cac:DeliveryParty>\n`;
      xml += `${ind}    <cac:PartyName>\n`;
      xml += `${ind}      <cbc:Name>${this.escapeXml(delivery.deliveryPartyName)}</cbc:Name>\n`;
      xml += `${ind}    </cac:PartyName>\n`;
      xml += `${ind}  </cac:DeliveryParty>\n`;
    }

    xml += `${ind}</cac:Delivery>\n`;
    return xml;
  }

  /**
   * Build payment means element
   */
  private buildPaymentMeans(pm: PaymentMeans, indent: number): string {
    const ind = ' '.repeat(indent);
    let xml = `${ind}<cac:PaymentMeans>\n`;

    xml += `${ind}  <cbc:PaymentMeansCode>${pm.paymentMeansCode}</cbc:PaymentMeansCode>\n`;

    if (pm.paymentId) {
      xml += `${ind}  <cbc:PaymentID>${this.escapeXml(pm.paymentId)}</cbc:PaymentID>\n`;
    }

    if (pm.payeeFinancialAccount) {
      xml += `${ind}  <cac:PayeeFinancialAccount>\n`;
      xml += `${ind}    <cbc:ID>${this.escapeXml(pm.payeeFinancialAccount.id)}</cbc:ID>\n`;
      if (pm.payeeFinancialAccount.name) {
        xml += `${ind}    <cbc:Name>${this.escapeXml(pm.payeeFinancialAccount.name)}</cbc:Name>\n`;
      }
      if (pm.payeeFinancialAccount.financialInstitutionBranch?.id) {
        xml += `${ind}    <cac:FinancialInstitutionBranch>\n`;
        xml += `${ind}      <cbc:ID>${this.escapeXml(pm.payeeFinancialAccount.financialInstitutionBranch.id)}</cbc:ID>\n`;
        xml += `${ind}    </cac:FinancialInstitutionBranch>\n`;
      }
      xml += `${ind}  </cac:PayeeFinancialAccount>\n`;
    }

    xml += `${ind}</cac:PaymentMeans>\n`;
    return xml;
  }

  /**
   * Build allowance/charge element
   */
  private buildAllowanceCharge(ac: AllowanceCharge, indent: number): string {
    const ind = ' '.repeat(indent);
    let xml = `${ind}<cac:AllowanceCharge>\n`;

    xml += `${ind}  <cbc:ChargeIndicator>${ac.chargeIndicator}</cbc:ChargeIndicator>\n`;

    if (ac.allowanceChargeReason) {
      xml += `${ind}  <cbc:AllowanceChargeReason>${this.escapeXml(ac.allowanceChargeReason)}</cbc:AllowanceChargeReason>\n`;
    }

    if (ac.multiplierFactorNumeric !== undefined) {
      xml += `${ind}  <cbc:MultiplierFactorNumeric>${ac.multiplierFactorNumeric}</cbc:MultiplierFactorNumeric>\n`;
    }

    xml += `${ind}  <cbc:Amount currencyID="EUR">${this.formatAmount(ac.amount)}</cbc:Amount>\n`;

    if (ac.baseAmount !== undefined) {
      xml += `${ind}  <cbc:BaseAmount currencyID="EUR">${this.formatAmount(ac.baseAmount)}</cbc:BaseAmount>\n`;
    }

    if (ac.taxCategory) {
      xml += `${ind}  <cac:TaxCategory>\n`;
      xml += `${ind}    <cbc:ID>${ac.taxCategory.id}</cbc:ID>\n`;
      if (ac.taxCategory.percent !== undefined) {
        xml += `${ind}    <cbc:Percent>${ac.taxCategory.percent}</cbc:Percent>\n`;
      }
      xml += `${ind}    <cac:TaxScheme>\n`;
      xml += `${ind}      <cbc:ID>${ac.taxCategory.taxScheme.id}</cbc:ID>\n`;
      xml += `${ind}    </cac:TaxScheme>\n`;
      xml += `${ind}  </cac:TaxCategory>\n`;
    }

    xml += `${ind}</cac:AllowanceCharge>\n`;
    return xml;
  }

  /**
   * Build tax total element
   */
  private buildTaxTotal(tt: TaxTotal, currencyCode: string, indent: number): string {
    const ind = ' '.repeat(indent);
    let xml = `${ind}<cac:TaxTotal>\n`;

    xml += `${ind}  <cbc:TaxAmount currencyID="${currencyCode}">${this.formatAmount(tt.taxAmount)}</cbc:TaxAmount>\n`;

    tt.taxSubtotals.forEach((subtotal) => {
      xml += this.buildTaxSubtotal(subtotal, currencyCode, indent + 2);
    });

    xml += `${ind}</cac:TaxTotal>\n`;
    return xml;
  }

  /**
   * Build tax subtotal element
   */
  private buildTaxSubtotal(subtotal: TaxSubtotal, currencyCode: string, indent: number): string {
    const ind = ' '.repeat(indent);
    let xml = `${ind}<cac:TaxSubtotal>\n`;

    xml += `${ind}  <cbc:TaxableAmount currencyID="${currencyCode}">${this.formatAmount(subtotal.taxableAmount)}</cbc:TaxableAmount>\n`;
    xml += `${ind}  <cbc:TaxAmount currencyID="${currencyCode}">${this.formatAmount(subtotal.taxAmount)}</cbc:TaxAmount>\n`;

    xml += `${ind}  <cac:TaxCategory>\n`;
    xml += `${ind}    <cbc:ID>${subtotal.taxCategory.id}</cbc:ID>\n`;
    if (subtotal.taxCategory.percent !== undefined) {
      xml += `${ind}    <cbc:Percent>${subtotal.taxCategory.percent}</cbc:Percent>\n`;
    }
    if (subtotal.taxCategory.taxExemptionReason) {
      xml += `${ind}    <cbc:TaxExemptionReason>${this.escapeXml(subtotal.taxCategory.taxExemptionReason)}</cbc:TaxExemptionReason>\n`;
    }
    xml += `${ind}    <cac:TaxScheme>\n`;
    xml += `${ind}      <cbc:ID>${subtotal.taxCategory.taxScheme.id}</cbc:ID>\n`;
    xml += `${ind}    </cac:TaxScheme>\n`;
    xml += `${ind}  </cac:TaxCategory>\n`;

    xml += `${ind}</cac:TaxSubtotal>\n`;
    return xml;
  }

  /**
   * Build legal monetary total element
   */
  private buildLegalMonetaryTotal(total: Invoice['legalMonetaryTotal'], currencyCode: string, indent: number): string {
    const ind = ' '.repeat(indent);
    let xml = `${ind}<cac:LegalMonetaryTotal>\n`;

    xml += `${ind}  <cbc:LineExtensionAmount currencyID="${currencyCode}">${this.formatAmount(total.lineExtensionAmount)}</cbc:LineExtensionAmount>\n`;
    xml += `${ind}  <cbc:TaxExclusiveAmount currencyID="${currencyCode}">${this.formatAmount(total.taxExclusiveAmount)}</cbc:TaxExclusiveAmount>\n`;
    xml += `${ind}  <cbc:TaxInclusiveAmount currencyID="${currencyCode}">${this.formatAmount(total.taxInclusiveAmount)}</cbc:TaxInclusiveAmount>\n`;

    if (total.allowanceTotalAmount !== undefined) {
      xml += `${ind}  <cbc:AllowanceTotalAmount currencyID="${currencyCode}">${this.formatAmount(total.allowanceTotalAmount)}</cbc:AllowanceTotalAmount>\n`;
    }
    if (total.chargeTotalAmount !== undefined) {
      xml += `${ind}  <cbc:ChargeTotalAmount currencyID="${currencyCode}">${this.formatAmount(total.chargeTotalAmount)}</cbc:ChargeTotalAmount>\n`;
    }
    if (total.prepaidAmount !== undefined) {
      xml += `${ind}  <cbc:PrepaidAmount currencyID="${currencyCode}">${this.formatAmount(total.prepaidAmount)}</cbc:PrepaidAmount>\n`;
    }
    if (total.payableRoundingAmount !== undefined) {
      xml += `${ind}  <cbc:PayableRoundingAmount currencyID="${currencyCode}">${this.formatAmount(total.payableRoundingAmount)}</cbc:PayableRoundingAmount>\n`;
    }

    xml += `${ind}  <cbc:PayableAmount currencyID="${currencyCode}">${this.formatAmount(total.payableAmount)}</cbc:PayableAmount>\n`;

    xml += `${ind}</cac:LegalMonetaryTotal>\n`;
    return xml;
  }

  /**
   * Build invoice line element
   */
  private buildInvoiceLine(line: InvoiceLine, currencyCode: string, indent: number): string {
    const ind = ' '.repeat(indent);
    let xml = `${ind}<cac:InvoiceLine>\n`;

    xml += `${ind}  <cbc:ID>${this.escapeXml(line.id)}</cbc:ID>\n`;

    if (line.note) {
      xml += `${ind}  <cbc:Note>${this.escapeXml(line.note)}</cbc:Note>\n`;
    }

    xml += `${ind}  <cbc:InvoicedQuantity unitCode="${line.unitCode}">${line.invoicedQuantity}</cbc:InvoicedQuantity>\n`;
    xml += `${ind}  <cbc:LineExtensionAmount currencyID="${currencyCode}">${this.formatAmount(line.lineExtensionAmount)}</cbc:LineExtensionAmount>\n`;

    if (line.accountingCost) {
      xml += `${ind}  <cbc:AccountingCost>${this.escapeXml(line.accountingCost)}</cbc:AccountingCost>\n`;
    }

    if (line.invoicePeriod) {
      xml += `${ind}  <cac:InvoicePeriod>\n`;
      if (line.invoicePeriod.startDate) {
        xml += `${ind}    <cbc:StartDate>${line.invoicePeriod.startDate}</cbc:StartDate>\n`;
      }
      if (line.invoicePeriod.endDate) {
        xml += `${ind}    <cbc:EndDate>${line.invoicePeriod.endDate}</cbc:EndDate>\n`;
      }
      xml += `${ind}  </cac:InvoicePeriod>\n`;
    }

    if (line.orderLineReference) {
      xml += `${ind}  <cac:OrderLineReference>\n`;
      xml += `${ind}    <cbc:LineID>${this.escapeXml(line.orderLineReference)}</cbc:LineID>\n`;
      xml += `${ind}  </cac:OrderLineReference>\n`;
    }

    // Line level allowances/charges
    if (line.allowanceCharge && line.allowanceCharge.length > 0) {
      line.allowanceCharge.forEach((ac) => {
        xml += this.buildAllowanceCharge(ac, indent + 2);
      });
    }

    // Item
    xml += `${ind}  <cac:Item>\n`;
    if (line.item.description) {
      xml += `${ind}    <cbc:Description>${this.escapeXml(line.item.description)}</cbc:Description>\n`;
    }
    xml += `${ind}    <cbc:Name>${this.escapeXml(line.item.name)}</cbc:Name>\n`;

    if (line.item.sellersItemIdentification) {
      xml += `${ind}    <cac:SellersItemIdentification>\n`;
      xml += `${ind}      <cbc:ID>${this.escapeXml(line.item.sellersItemIdentification)}</cbc:ID>\n`;
      xml += `${ind}    </cac:SellersItemIdentification>\n`;
    }

    if (line.item.standardItemIdentification) {
      xml += `${ind}    <cac:StandardItemIdentification>\n`;
      xml += `${ind}      <cbc:ID>${this.escapeXml(line.item.standardItemIdentification)}</cbc:ID>\n`;
      xml += `${ind}    </cac:StandardItemIdentification>\n`;
    }

    // Item classification
    if (line.item.itemClassification && line.item.itemClassification.length > 0) {
      line.item.itemClassification.forEach((classification) => {
        xml += `${ind}    <cac:CommodityClassification>\n`;
        if (classification.itemClassificationCode) {
          const listAttr = classification.listId ? ` listID="${classification.listId}"` : '';
          xml += `${ind}      <cbc:ItemClassificationCode${listAttr}>${this.escapeXml(classification.itemClassificationCode)}</cbc:ItemClassificationCode>\n`;
        }
        xml += `${ind}    </cac:CommodityClassification>\n`;
      });
    }

    // Tax category
    xml += `${ind}    <cac:ClassifiedTaxCategory>\n`;
    xml += `${ind}      <cbc:ID>${line.item.classifiedTaxCategory.id}</cbc:ID>\n`;
    if (line.item.classifiedTaxCategory.percent !== undefined) {
      xml += `${ind}      <cbc:Percent>${line.item.classifiedTaxCategory.percent}</cbc:Percent>\n`;
    }
    xml += `${ind}      <cac:TaxScheme>\n`;
    xml += `${ind}        <cbc:ID>${line.item.classifiedTaxCategory.taxScheme.id}</cbc:ID>\n`;
    xml += `${ind}      </cac:TaxScheme>\n`;
    xml += `${ind}    </cac:ClassifiedTaxCategory>\n`;

    // Additional item properties
    if (line.item.additionalItemProperty && line.item.additionalItemProperty.length > 0) {
      line.item.additionalItemProperty.forEach((prop) => {
        xml += `${ind}    <cac:AdditionalItemProperty>\n`;
        xml += `${ind}      <cbc:Name>${this.escapeXml(prop.name)}</cbc:Name>\n`;
        xml += `${ind}      <cbc:Value>${this.escapeXml(prop.value)}</cbc:Value>\n`;
        xml += `${ind}    </cac:AdditionalItemProperty>\n`;
      });
    }

    xml += `${ind}  </cac:Item>\n`;

    // Price
    xml += `${ind}  <cac:Price>\n`;
    xml += `${ind}    <cbc:PriceAmount currencyID="${currencyCode}">${this.formatAmount(line.price.priceAmount)}</cbc:PriceAmount>\n`;
    if (line.price.baseQuantity !== undefined) {
      xml += `${ind}    <cbc:BaseQuantity unitCode="${line.unitCode}">${line.price.baseQuantity}</cbc:BaseQuantity>\n`;
    }
    xml += `${ind}  </cac:Price>\n`;

    xml += `${ind}</cac:InvoiceLine>\n`;
    return xml;
  }

  /**
   * Build document reference element
   */
  private buildDocumentReference(ref: DocumentReference, elementName: string, indent: number): string {
    const ind = ' '.repeat(indent);
    let xml = `${ind}<cac:${elementName}>\n`;

    xml += `${ind}  <cbc:ID>${this.escapeXml(ref.id)}</cbc:ID>\n`;

    if (ref.documentTypeCode) {
      xml += `${ind}  <cbc:DocumentTypeCode>${ref.documentTypeCode}</cbc:DocumentTypeCode>\n`;
    }

    if (ref.documentDescription) {
      xml += `${ind}  <cbc:DocumentDescription>${this.escapeXml(ref.documentDescription)}</cbc:DocumentDescription>\n`;
    }

    xml += `${ind}</cac:${elementName}>\n`;
    return xml;
  }

  /**
   * Create simple element with text content
   */
  private element(tag: string, content: string, indent: number): string {
    return `${' '.repeat(indent)}<${tag}>${content}</${tag}>\n`;
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
export const ublGenerator = new UBLGenerator();
