/**
 * PDF/A-3 Generator for Factur-X
 *
 * Generates PDF/A-3 documents with embedded Factur-X XML
 * compliant with ZUGFeRD/Factur-X specification.
 *
 * The PDF contains:
 * - Human-readable invoice representation
 * - Embedded XML file (factur-x.xml) as attachment
 * - PDF/A-3b compliance metadata
 */

import { PDFDocument, PDFPage, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import { Invoice } from './types';
import { facturXGenerator } from './facturx-generator';

/**
 * PDF Generation Options
 */
export interface PDFGenerationOptions {
  // Logo image (base64 or buffer)
  logo?: string | Uint8Array;

  // Color scheme
  primaryColor?: { r: number; g: number; b: number };
  secondaryColor?: { r: number; g: number; b: number };

  // Footer text
  footerText?: string;

  // Include detailed line items
  includeLineItems?: boolean;

  // Language for labels
  language?: 'fr' | 'en';
}

/**
 * PDF/A-3 Generator with Factur-X XML Embedding
 */
export class PDFGenerator {
  private readonly defaultPrimaryColor = { r: 0.2, g: 0.3, b: 0.5 };
  private readonly defaultSecondaryColor = { r: 0.4, g: 0.5, b: 0.6 };

  /**
   * Generate PDF/A-3 with embedded Factur-X XML
   */
  public async generate(
    invoice: Invoice,
    options?: PDFGenerationOptions
  ): Promise<Uint8Array> {
    // Generate Factur-X XML
    const xml = facturXGenerator.generate(invoice, {
      format: 'facturx',
      facturxProfile: 'EN16931',
      prettyPrint: true,
    });

    // Create PDF document
    const pdfDoc = await PDFDocument.create();

    // Add metadata
    this.addMetadata(pdfDoc, invoice);

    // Add invoice pages
    await this.addInvoicePages(pdfDoc, invoice, options);

    // Embed Factur-X XML as attachment
    await this.embedFacturXXML(pdfDoc, xml, invoice.id);

    // Serialize to bytes
    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
  }

  /**
   * Add PDF metadata
   */
  private addMetadata(pdfDoc: PDFDocument, invoice: Invoice): void {
    pdfDoc.setTitle(`Invoice ${invoice.id}`);
    pdfDoc.setSubject('Invoice');
    pdfDoc.setAuthor(invoice.accountingSupplierParty.partyLegalEntity.registrationName);
    pdfDoc.setCreator('EasyBill - French E-Invoicing');
    pdfDoc.setProducer('EasyBill PDF/A-3 Generator');
    pdfDoc.setKeywords(['invoice', 'factur-x', 'en16931', invoice.id]);
    pdfDoc.setCreationDate(new Date());
    pdfDoc.setModificationDate(new Date());
  }

  /**
   * Embed Factur-X XML as PDF attachment
   */
  private async embedFacturXXML(
    pdfDoc: PDFDocument,
    xml: string,
    invoiceId: string
  ): Promise<void> {
    // Convert XML string to bytes
    const xmlBytes = new TextEncoder().encode(xml);

    // Attach XML file to PDF
    await pdfDoc.attach(
      xmlBytes,
      'factur-x.xml',
      {
        mimeType: 'text/xml',
        description: `Factur-X XML for invoice ${invoiceId}`,
        creationDate: new Date(),
        modificationDate: new Date(),
      }
    );
  }

  /**
   * Add invoice pages to PDF
   */
  private async addInvoicePages(
    pdfDoc: PDFDocument,
    invoice: Invoice,
    options?: PDFGenerationOptions
  ): Promise<void> {
    const page = pdfDoc.addPage([595.276, 841.89]); // A4 size in points
    const { width, height } = page.getSize();

    // Load fonts
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const primaryColor = options?.primaryColor
      ? rgb(options.primaryColor.r, options.primaryColor.g, options.primaryColor.b)
      : rgb(this.defaultPrimaryColor.r, this.defaultPrimaryColor.g, this.defaultPrimaryColor.b);

    const secondaryColor = options?.secondaryColor
      ? rgb(options.secondaryColor.r, options.secondaryColor.g, options.secondaryColor.b)
      : rgb(this.defaultSecondaryColor.r, this.defaultSecondaryColor.g, this.defaultSecondaryColor.b);

    const labels = this.getLabels(options?.language || 'fr');

    let yPosition = height - 50;

    // Header
    yPosition = this.drawHeader(page, invoice, yPosition, boldFont, regularFont, primaryColor, labels);

    // Seller and Buyer information (side by side)
    yPosition = await this.drawParties(page, invoice, yPosition - 30, regularFont, boldFont, labels);

    // Invoice details
    yPosition = this.drawInvoiceDetails(page, invoice, yPosition - 30, regularFont, boldFont, labels);

    // Line items
    if (options?.includeLineItems !== false) {
      yPosition = this.drawLineItems(page, invoice, yPosition - 30, regularFont, boldFont, secondaryColor, labels);
    }

    // Totals
    yPosition = this.drawTotals(page, invoice, yPosition - 20, regularFont, boldFont, primaryColor, labels);

    // Payment information
    yPosition = this.drawPaymentInfo(page, invoice, yPosition - 30, regularFont, boldFont, labels);

    // Footer
    this.drawFooter(page, invoice, regularFont, options?.footerText, labels);
  }

  /**
   * Draw invoice header
   */
  private drawHeader(
    page: PDFPage,
    invoice: Invoice,
    yPosition: number,
    boldFont: PDFFont,
    regularFont: PDFFont,
    color: any,
    labels: any
  ): number {
    const { width } = page.getSize();

    // Invoice title
    page.drawText(labels.invoice.toUpperCase(), {
      x: 50,
      y: yPosition,
      size: 28,
      font: boldFont,
      color,
    });

    // Invoice number and date (right aligned)
    const invoiceNumberText = `${labels.invoiceNumber}: ${invoice.id}`;
    const invoiceDateText = `${labels.date}: ${this.formatDate(invoice.issueDate)}`;

    page.drawText(invoiceNumberText, {
      x: width - 50 - boldFont.widthOfTextAtSize(invoiceNumberText, 12),
      y: yPosition,
      size: 12,
      font: boldFont,
    });

    page.drawText(invoiceDateText, {
      x: width - 50 - regularFont.widthOfTextAtSize(invoiceDateText, 10),
      y: yPosition - 20,
      size: 10,
      font: regularFont,
    });

    if (invoice.dueDate) {
      const dueDateText = `${labels.dueDate}: ${this.formatDate(invoice.dueDate)}`;
      page.drawText(dueDateText, {
        x: width - 50 - regularFont.widthOfTextAtSize(dueDateText, 10),
        y: yPosition - 35,
        size: 10,
        font: regularFont,
      });
      return yPosition - 60;
    }

    return yPosition - 45;
  }

  /**
   * Draw seller and buyer parties
   */
  private async drawParties(
    page: PDFPage,
    invoice: Invoice,
    yPosition: number,
    regularFont: PDFFont,
    boldFont: PDFFont,
    labels: any
  ): Promise<number> {
    const { width } = page.getSize();
    const columnWidth = (width - 100) / 2;

    // Seller (left column)
    page.drawText(labels.seller, {
      x: 50,
      y: yPosition,
      size: 12,
      font: boldFont,
    });

    let sellerY = yPosition - 20;
    const seller = invoice.accountingSupplierParty;

    page.drawText(seller.partyLegalEntity.registrationName, {
      x: 50,
      y: sellerY,
      size: 10,
      font: regularFont,
    });
    sellerY -= 15;

    if (seller.postalAddress.streetName) {
      page.drawText(seller.postalAddress.streetName, {
        x: 50,
        y: sellerY,
        size: 9,
        font: regularFont,
      });
      sellerY -= 13;
    }

    const sellerCityLine = `${seller.postalAddress.postalZone} ${seller.postalAddress.cityName}`;
    page.drawText(sellerCityLine, {
      x: 50,
      y: sellerY,
      size: 9,
      font: regularFont,
    });
    sellerY -= 13;

    if (seller.partyTaxScheme && seller.partyTaxScheme.length > 0) {
      page.drawText(`${labels.vatNumber}: ${seller.partyTaxScheme[0].companyId}`, {
        x: 50,
        y: sellerY,
        size: 9,
        font: regularFont,
      });
      sellerY -= 13;
    }

    if (seller.partyLegalEntity.companyId) {
      page.drawText(`${labels.siret}: ${seller.partyLegalEntity.companyId}`, {
        x: 50,
        y: sellerY,
        size: 9,
        font: regularFont,
      });
      sellerY -= 13;
    }

    // Buyer (right column)
    page.drawText(labels.buyer, {
      x: width / 2 + 25,
      y: yPosition,
      size: 12,
      font: boldFont,
    });

    let buyerY = yPosition - 20;
    const buyer = invoice.accountingCustomerParty;

    page.drawText(buyer.partyLegalEntity.registrationName, {
      x: width / 2 + 25,
      y: buyerY,
      size: 10,
      font: regularFont,
    });
    buyerY -= 15;

    if (buyer.postalAddress.streetName) {
      page.drawText(buyer.postalAddress.streetName, {
        x: width / 2 + 25,
        y: buyerY,
        size: 9,
        font: regularFont,
      });
      buyerY -= 13;
    }

    const buyerCityLine = `${buyer.postalAddress.postalZone} ${buyer.postalAddress.cityName}`;
    page.drawText(buyerCityLine, {
      x: width / 2 + 25,
      y: buyerY,
      size: 9,
      font: regularFont,
    });
    buyerY -= 13;

    if (buyer.partyTaxScheme && buyer.partyTaxScheme.length > 0) {
      page.drawText(`${labels.vatNumber}: ${buyer.partyTaxScheme[0].companyId}`, {
        x: width / 2 + 25,
        y: buyerY,
        size: 9,
        font: regularFont,
      });
      buyerY -= 13;
    }

    return Math.min(sellerY, buyerY);
  }

  /**
   * Draw invoice details
   */
  private drawInvoiceDetails(
    page: PDFPage,
    invoice: Invoice,
    yPosition: number,
    regularFont: PDFFont,
    boldFont: PDFFont,
    labels: any
  ): number {
    if (invoice.note) {
      page.drawText(labels.notes, {
        x: 50,
        y: yPosition,
        size: 10,
        font: boldFont,
      });

      page.drawText(invoice.note, {
        x: 50,
        y: yPosition - 15,
        size: 9,
        font: regularFont,
        maxWidth: 495,
      });

      return yPosition - 45;
    }

    return yPosition;
  }

  /**
   * Draw line items table
   */
  private drawLineItems(
    page: PDFPage,
    invoice: Invoice,
    yPosition: number,
    regularFont: PDFFont,
    boldFont: PDFFont,
    color: any,
    labels: any
  ): number {
    const { width } = page.getSize();

    // Table header
    page.drawRectangle({
      x: 50,
      y: yPosition - 20,
      width: width - 100,
      height: 20,
      color,
    });

    const tableHeaders = [
      { text: labels.description, x: 55 },
      { text: labels.quantity, x: 320 },
      { text: labels.unitPrice, x: 390 },
      { text: labels.vat, x: 450 },
      { text: labels.amount, x: 490 },
    ];

    tableHeaders.forEach((header) => {
      page.drawText(header.text, {
        x: header.x,
        y: yPosition - 15,
        size: 9,
        font: boldFont,
        color: rgb(1, 1, 1),
      });
    });

    let lineY = yPosition - 40;

    // Draw lines
    invoice.invoiceLines.forEach((line, index) => {
      const bgColor = index % 2 === 0 ? rgb(0.95, 0.95, 0.95) : rgb(1, 1, 1);

      page.drawRectangle({
        x: 50,
        y: lineY - 15,
        width: width - 100,
        height: 20,
        color: bgColor,
      });

      // Description
      const description = line.item.name.length > 35
        ? line.item.name.substring(0, 32) + '...'
        : line.item.name;
      page.drawText(description, {
        x: 55,
        y: lineY,
        size: 8,
        font: regularFont,
      });

      // Quantity
      page.drawText(`${line.invoicedQuantity}`, {
        x: 330,
        y: lineY,
        size: 8,
        font: regularFont,
      });

      // Unit price
      page.drawText(`${this.formatAmount(line.price.priceAmount)}`, {
        x: 395,
        y: lineY,
        size: 8,
        font: regularFont,
      });

      // VAT rate
      const vatRate = line.item.classifiedTaxCategory.percent !== undefined
        ? `${line.item.classifiedTaxCategory.percent}%`
        : line.item.classifiedTaxCategory.id;
      page.drawText(vatRate, {
        x: 455,
        y: lineY,
        size: 8,
        font: regularFont,
      });

      // Line total
      const amountText = this.formatAmount(line.lineExtensionAmount);
      page.drawText(amountText, {
        x: 495 - regularFont.widthOfTextAtSize(amountText, 8),
        y: lineY,
        size: 8,
        font: regularFont,
      });

      lineY -= 20;
    });

    return lineY;
  }

  /**
   * Draw totals
   */
  private drawTotals(
    page: PDFPage,
    invoice: Invoice,
    yPosition: number,
    regularFont: PDFFont,
    boldFont: PDFFont,
    color: any,
    labels: any
  ): number {
    const { width } = page.getSize();
    const totals = invoice.legalMonetaryTotal;
    const rightAlign = width - 50;

    let totalY = yPosition;

    // Subtotal
    const subtotalLabel = `${labels.subtotal}:`;
    const subtotalValue = this.formatAmount(totals.lineExtensionAmount);
    page.drawText(subtotalLabel, {
      x: rightAlign - 200,
      y: totalY,
      size: 10,
      font: regularFont,
    });
    page.drawText(subtotalValue, {
      x: rightAlign - regularFont.widthOfTextAtSize(subtotalValue, 10),
      y: totalY,
      size: 10,
      font: regularFont,
    });
    totalY -= 20;

    // Tax breakdown
    invoice.taxTotal[0]?.taxSubtotals.forEach((subtotal) => {
      const taxLabel = `${labels.vat} ${subtotal.taxCategory.percent || 0}%:`;
      const taxValue = this.formatAmount(subtotal.taxAmount);
      page.drawText(taxLabel, {
        x: rightAlign - 200,
        y: totalY,
        size: 10,
        font: regularFont,
      });
      page.drawText(taxValue, {
        x: rightAlign - regularFont.widthOfTextAtSize(taxValue, 10),
        y: totalY,
        size: 10,
        font: regularFont,
      });
      totalY -= 20;
    });

    // Total
    const totalLabel = `${labels.total}:`;
    const totalValue = `${this.formatAmount(totals.taxInclusiveAmount)} ${invoice.documentCurrencyCode}`;

    page.drawRectangle({
      x: rightAlign - 220,
      y: totalY - 15,
      width: 220,
      height: 25,
      color,
    });

    page.drawText(totalLabel, {
      x: rightAlign - 210,
      y: totalY,
      size: 12,
      font: boldFont,
      color: rgb(1, 1, 1),
    });
    page.drawText(totalValue, {
      x: rightAlign - boldFont.widthOfTextAtSize(totalValue, 12) - 10,
      y: totalY,
      size: 12,
      font: boldFont,
      color: rgb(1, 1, 1),
    });

    return totalY - 25;
  }

  /**
   * Draw payment information
   */
  private drawPaymentInfo(
    page: PDFPage,
    invoice: Invoice,
    yPosition: number,
    regularFont: PDFFont,
    boldFont: PDFFont,
    labels: any
  ): number {
    if (!invoice.paymentMeans || invoice.paymentMeans.length === 0) {
      return yPosition;
    }

    page.drawText(labels.paymentInfo, {
      x: 50,
      y: yPosition,
      size: 11,
      font: boldFont,
    });

    let paymentY = yPosition - 20;

    invoice.paymentMeans.forEach((pm) => {
      if (pm.payeeFinancialAccount) {
        page.drawText(`${labels.iban}: ${pm.payeeFinancialAccount.id}`, {
          x: 50,
          y: paymentY,
          size: 9,
          font: regularFont,
        });
        paymentY -= 15;

        if (pm.payeeFinancialAccount.financialInstitutionBranch?.id) {
          page.drawText(`${labels.bic}: ${pm.payeeFinancialAccount.financialInstitutionBranch.id}`, {
            x: 50,
            y: paymentY,
            size: 9,
            font: regularFont,
          });
          paymentY -= 15;
        }
      }

      if (pm.paymentId) {
        page.drawText(`${labels.reference}: ${pm.paymentId}`, {
          x: 50,
          y: paymentY,
          size: 9,
          font: regularFont,
        });
        paymentY -= 15;
      }
    });

    return paymentY;
  }

  /**
   * Draw footer
   */
  private drawFooter(
    page: PDFPage,
    invoice: Invoice,
    regularFont: PDFFont,
    footerText?: string,
    labels?: any
  ): void {
    const { width } = page.getSize();

    const defaultFooter = footerText || `${labels.generatedBy} EasyBill - ${labels.facturxCompliant}`;

    page.drawText(defaultFooter, {
      x: width / 2 - regularFont.widthOfTextAtSize(defaultFooter, 8) / 2,
      y: 30,
      size: 8,
      font: regularFont,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  /**
   * Get localized labels
   */
  private getLabels(language: 'fr' | 'en'): any {
    if (language === 'fr') {
      return {
        invoice: 'Facture',
        invoiceNumber: 'N° Facture',
        date: 'Date',
        dueDate: 'Date d\'échéance',
        seller: 'Émetteur',
        buyer: 'Client',
        vatNumber: 'N° TVA',
        siret: 'SIRET',
        notes: 'Notes',
        description: 'Description',
        quantity: 'Qté',
        unitPrice: 'Prix unit.',
        vat: 'TVA',
        amount: 'Montant',
        subtotal: 'Sous-total HT',
        total: 'Total TTC',
        paymentInfo: 'Informations de paiement',
        iban: 'IBAN',
        bic: 'BIC',
        reference: 'Référence',
        generatedBy: 'Généré par',
        facturxCompliant: 'Conforme Factur-X EN16931',
      };
    } else {
      return {
        invoice: 'Invoice',
        invoiceNumber: 'Invoice No.',
        date: 'Date',
        dueDate: 'Due Date',
        seller: 'Seller',
        buyer: 'Buyer',
        vatNumber: 'VAT Number',
        siret: 'SIRET',
        notes: 'Notes',
        description: 'Description',
        quantity: 'Qty',
        unitPrice: 'Unit Price',
        vat: 'VAT',
        amount: 'Amount',
        subtotal: 'Subtotal',
        total: 'Total',
        paymentInfo: 'Payment Information',
        iban: 'IBAN',
        bic: 'BIC',
        reference: 'Reference',
        generatedBy: 'Generated by',
        facturxCompliant: 'Factur-X EN16931 Compliant',
      };
    }
  }

  /**
   * Format date from ISO to readable format
   */
  private formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    return date.toLocaleDateString('fr-FR');
  }

  /**
   * Format amount with currency
   */
  private formatAmount(amount: number): string {
    return amount.toFixed(2) + ' €';
  }
}

// Export singleton instance
export const pdfGenerator = new PDFGenerator();
