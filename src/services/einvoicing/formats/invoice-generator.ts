/**
 * Invoice Format Generator Service
 *
 * Main service for generating invoices in various formats:
 * - UBL 2.1 XML (EN16931 compliant)
 * - Factur-X PDF/A-3 with embedded XML
 * - Factur-X XML only (CII format)
 */

import { Invoice, FormatGenerationOptions, InvoiceValidationResult } from './types';
import { ublGenerator } from './ubl-generator';
import { facturXGenerator } from './facturx-generator';
import { pdfGenerator, PDFGenerationOptions } from './pdf-generator';

/**
 * Output format for invoice generation
 */
export type InvoiceOutputFormat = 'ubl' | 'facturx-pdf' | 'facturx-xml';

/**
 * Generation result
 */
export interface InvoiceGenerationResult {
  success: boolean;
  data?: Uint8Array | string;
  format: InvoiceOutputFormat;
  mimeType: string;
  filename: string;
  errors?: string[];
}

/**
 * Combined options for all generators
 */
export interface InvoiceGeneratorOptions extends FormatGenerationOptions, PDFGenerationOptions {
  // Output format
  format: InvoiceOutputFormat;

  // Custom filename (without extension)
  filename?: string;
}

/**
 * Invoice Generator Service
 *
 * Provides a unified interface for generating invoices in multiple formats
 */
export class InvoiceGenerator {
  /**
   * Generate invoice in specified format
   */
  public async generate(
    invoice: Invoice,
    options: InvoiceGeneratorOptions
  ): Promise<InvoiceGenerationResult> {
    try {
      const filename = options.filename || `invoice-${invoice.id}`;

      switch (options.format) {
        case 'ubl':
          return this.generateUBL(invoice, options, filename);

        case 'facturx-pdf':
          return await this.generateFacturXPDF(invoice, options, filename);

        case 'facturx-xml':
          return this.generateFacturXXML(invoice, options, filename);

        default:
          throw new Error(`Unsupported format: ${options.format}`);
      }
    } catch (error) {
      return {
        success: false,
        format: options.format,
        mimeType: '',
        filename: '',
        errors: [error.message],
      };
    }
  }

  /**
   * Generate UBL 2.1 XML
   */
  private generateUBL(
    invoice: Invoice,
    options: FormatGenerationOptions,
    filename: string
  ): InvoiceGenerationResult {
    const xml = ublGenerator.generate(invoice, options);

    return {
      success: true,
      data: xml,
      format: 'ubl',
      mimeType: 'application/xml',
      filename: `${filename}.xml`,
    };
  }

  /**
   * Generate Factur-X PDF/A-3 with embedded XML
   */
  private async generateFacturXPDF(
    invoice: Invoice,
    options: PDFGenerationOptions,
    filename: string
  ): Promise<InvoiceGenerationResult> {
    const pdfBytes = await pdfGenerator.generate(invoice, options);

    return {
      success: true,
      data: pdfBytes,
      format: 'facturx-pdf',
      mimeType: 'application/pdf',
      filename: `${filename}.pdf`,
    };
  }

  /**
   * Generate Factur-X XML only (CII format)
   */
  private generateFacturXXML(
    invoice: Invoice,
    options: FormatGenerationOptions,
    filename: string
  ): InvoiceGenerationResult {
    const xml = facturXGenerator.generate(invoice, options);

    return {
      success: true,
      data: xml,
      format: 'facturx-xml',
      mimeType: 'application/xml',
      filename: `${filename}.xml`,
    };
  }

  /**
   * Validate invoice data for all formats
   */
  public validate(invoice: Invoice): InvoiceValidationResult {
    // Both UBL and Factur-X use the same validation
    return ublGenerator.validate(invoice);
  }

  /**
   * Get supported formats
   */
  public getSupportedFormats(): InvoiceOutputFormat[] {
    return ['ubl', 'facturx-pdf', 'facturx-xml'];
  }

  /**
   * Get format display name
   */
  public getFormatDisplayName(format: InvoiceOutputFormat): string {
    const names: Record<InvoiceOutputFormat, string> = {
      'ubl': 'UBL 2.1 (XML)',
      'facturx-pdf': 'Factur-X (PDF/A-3)',
      'facturx-xml': 'Factur-X (XML)',
    };
    return names[format] || format;
  }

  /**
   * Get format description
   */
  public getFormatDescription(format: InvoiceOutputFormat): string {
    const descriptions: Record<InvoiceOutputFormat, string> = {
      'ubl': 'Universal Business Language 2.1 XML format, widely used in Europe and compliant with EN16931.',
      'facturx-pdf': 'Factur-X PDF/A-3 document with embedded XML. Human-readable PDF with machine-readable data.',
      'facturx-xml': 'Factur-X XML in Cross Industry Invoice (CII) format, compliant with EN16931.',
    };
    return descriptions[format] || '';
  }

  /**
   * Check if format is recommended for France
   */
  public isRecommendedForFrance(format: InvoiceOutputFormat): boolean {
    // Factur-X PDF is the most recommended for France
    return format === 'facturx-pdf';
  }

  /**
   * Save generated invoice to file (for Node.js/Electron)
   */
  public async saveToFile(
    result: InvoiceGenerationResult,
    directoryPath: string
  ): Promise<string> {
    if (!result.success || !result.data) {
      throw new Error('Cannot save failed generation result');
    }

    const fs = await import('fs');
    const path = await import('path');

    const filePath = path.join(directoryPath, result.filename);

    if (typeof result.data === 'string') {
      // XML string
      await fs.promises.writeFile(filePath, result.data, 'utf-8');
    } else {
      // Binary data (PDF)
      await fs.promises.writeFile(filePath, result.data);
    }

    return filePath;
  }

  /**
   * Generate download blob (for browser)
   */
  public createDownloadBlob(result: InvoiceGenerationResult): Blob {
    if (!result.success || !result.data) {
      throw new Error('Cannot create blob from failed generation result');
    }

    if (typeof result.data === 'string') {
      return new Blob([result.data], { type: result.mimeType });
    } else {
      return new Blob([result.data], { type: result.mimeType });
    }
  }

  /**
   * Trigger browser download
   */
  public triggerDownload(result: InvoiceGenerationResult): void {
    const blob = this.createDownloadBlob(result);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

// Export singleton instance
export const invoiceGenerator = new InvoiceGenerator();
