/**
 * PDF/A-3 Generator for Factur-X
 *
 * Produces the human-readable invoice (multi-page, French legal mentions)
 * with the Factur-X XML (`factur-x.xml`, CII, EN 16931 profile) embedded as
 * an associated file, plus the PDF/A-3b plumbing: embedded fonts, XMP
 * metadata, sRGB output intent and file identifier.
 */

import { PDFDocument, PDFFont, PDFPage, rgb, RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { Invoice, InvoiceLine, InvoiceTypeCode, Party, PaymentMeansCode } from './types';
import { facturXGenerator } from './facturx-generator';
import { EASYBILL_SANS_BOLD_BASE64, EASYBILL_SANS_REGULAR_BASE64 } from './assets/fonts';
import {
  describeCompanyId,
  formatAmountFR,
  formatDateFR,
  formatIban,
  formatPercentFR,
  formatQuantityFR,
  sanitizeText,
  wrapText,
} from './pdf-text';
import {
  buildXmpMetadata,
  embedAssociatedFile,
  FACTURX_FILENAME,
  setDocumentId,
  setSRGBOutputIntent,
  setXmpMetadata,
} from './pdfa';

/**
 * PDF Generation Options
 */
export interface PDFGenerationOptions {
  // Logo image (base64 or buffer) - reserved, not rendered yet
  logo?: string | Uint8Array;

  // Color scheme
  primaryColor?: { r: number; g: number; b: number };
  secondaryColor?: { r: number; g: number; b: number };

  // Extra footer text printed on every page (under the seller legal line)
  footerText?: string;

  // Include detailed line items
  includeLineItems?: boolean;

  // Language for labels
  language?: 'fr' | 'en';

  // 'quote' prints a plain "DEVIS" (no Factur-X XML, no PDF/A claims) with a
  // validity date and a signature block. Default: 'invoice'.
  documentKind?: 'invoice' | 'quote';

  // Quote only: last day of validity (YYYY-MM-DD)
  validUntil?: string;
}

/** Result of a generation with layout information (used by the tests). */
export interface PDFGenerationReport {
  bytes: Uint8Array;
  pageCount: number;
  /** Every string drawn on each page, in drawing order */
  textByPage: string[][];
}

interface Labels {
  titles: Record<string, string>;
  defaultTitle: string;
  number: string;
  date: string;
  dueDate: string;
  creditedInvoice: (id: string, date: string) => string;
  buyerReference: string;
  orderReference: string;
  seller: string;
  buyer: string;
  vatNumber: string;
  phone: string;
  email: string;
  notes: string;
  description: string;
  quantity: string;
  unitPrice: string;
  vat: string;
  amount: string;
  discount: string;
  period: (start: string, end: string) => string;
  totalLines: string;
  allowances: string;
  charges: string;
  totalExclVat: string;
  vatLine: (rate: string, base: string) => string;
  vatExempt: (base: string) => string;
  totalVat: string;
  total: string;
  prepaid: string;
  payable: string;
  payableCredit: string;
  paymentInfo: string;
  paymentMeans: string;
  paymentMeansNames: Record<string, string>;
  accountHolder: string;
  iban: string;
  bic: string;
  reference: string;
  page: (n: number, total: number) => string;
  continued: string;
  subject: string;
  quoteTitle: string;
  quoteSubject: string;
  validUntil: string;
  acceptance: string;
  acceptanceHint: string;
  signatureDate: string;
  signatureField: string;
}

const LABELS: Record<'fr' | 'en', Labels> = {
  fr: {
    titles: {
      [InvoiceTypeCode.INVOICE]: 'FACTURE',
      [InvoiceTypeCode.CREDIT_NOTE]: 'AVOIR',
      [InvoiceTypeCode.DEBIT_NOTE]: 'NOTE DE DÉBIT',
      [InvoiceTypeCode.CORRECTED_INVOICE]: 'FACTURE RECTIFICATIVE',
      [InvoiceTypeCode.PREPAYMENT_INVOICE]: "FACTURE D'ACOMPTE",
      [InvoiceTypeCode.SELF_BILLED_INVOICE]: 'FACTURE (AUTOFACTURATION)',
    },
    defaultTitle: 'FACTURE',
    number: 'N°',
    date: "Date d'émission",
    dueDate: "Date d'échéance",
    creditedInvoice: (id, date) => `Avoir sur la facture n° ${id}${date ? ` du ${date}` : ''}`,
    buyerReference: 'Référence client',
    orderReference: 'Bon de commande',
    seller: 'Émetteur',
    buyer: 'Client',
    vatNumber: 'N° TVA',
    phone: 'Tél.',
    email: 'E-mail',
    notes: 'Notes',
    description: 'Désignation',
    quantity: 'Qté',
    unitPrice: 'PU HT',
    vat: 'TVA',
    amount: 'Montant HT',
    discount: 'Remise',
    period: (start, end) =>
      start && end ? `Période du ${start} au ${end}` : start ? `À partir du ${start}` : `Jusqu'au ${end}`,
    totalLines: 'Total des lignes HT',
    allowances: 'Remises',
    charges: 'Frais',
    totalExclVat: 'Total HT',
    vatLine: (rate, base) => `TVA ${rate} sur ${base}`,
    vatExempt: (base) => `TVA non applicable sur ${base}`,
    totalVat: 'Total TVA',
    total: 'Total TTC',
    prepaid: 'Déjà réglé',
    payable: 'Net à payer',
    payableCredit: 'Net à votre crédit',
    paymentInfo: 'Conditions de règlement',
    paymentMeans: 'Mode de règlement',
    paymentMeansNames: {
      [PaymentMeansCode.CREDIT_TRANSFER]: 'Virement bancaire',
      [PaymentMeansCode.DEBIT_TRANSFER]: 'Virement bancaire',
      [PaymentMeansCode.PAYMENT_TO_BANK]: 'Virement bancaire',
      [PaymentMeansCode.CARD]: 'Carte bancaire',
      [PaymentMeansCode.DIRECT_DEBIT]: 'Prélèvement',
    },
    accountHolder: 'Titulaire du compte',
    iban: 'IBAN',
    bic: 'BIC',
    reference: 'Référence à rappeler',
    page: (n, total) => `Page ${n} / ${total}`,
    continued: 'suite',
    subject: 'Facture électronique',
    quoteTitle: 'DEVIS',
    quoteSubject: 'Devis',
    validUntil: "Valable jusqu'au",
    acceptance: 'Bon pour accord',
    acceptanceHint: 'Date et signature du client, précédées de la mention « Bon pour accord »',
    signatureDate: 'Date :',
    signatureField: 'Signature :',
  },
  en: {
    titles: {
      [InvoiceTypeCode.INVOICE]: 'INVOICE',
      [InvoiceTypeCode.CREDIT_NOTE]: 'CREDIT NOTE',
      [InvoiceTypeCode.DEBIT_NOTE]: 'DEBIT NOTE',
      [InvoiceTypeCode.CORRECTED_INVOICE]: 'CORRECTED INVOICE',
      [InvoiceTypeCode.PREPAYMENT_INVOICE]: 'PREPAYMENT INVOICE',
      [InvoiceTypeCode.SELF_BILLED_INVOICE]: 'SELF-BILLED INVOICE',
    },
    defaultTitle: 'INVOICE',
    number: 'No.',
    date: 'Issue date',
    dueDate: 'Due date',
    creditedInvoice: (id, date) => `Credit note for invoice no. ${id}${date ? ` dated ${date}` : ''}`,
    buyerReference: 'Buyer reference',
    orderReference: 'Purchase order',
    seller: 'Seller',
    buyer: 'Buyer',
    vatNumber: 'VAT number',
    phone: 'Phone',
    email: 'E-mail',
    notes: 'Notes',
    description: 'Description',
    quantity: 'Qty',
    unitPrice: 'Unit price',
    vat: 'VAT',
    amount: 'Amount excl. VAT',
    discount: 'Discount',
    period: (start, end) =>
      start && end ? `Period from ${start} to ${end}` : start ? `From ${start}` : `Until ${end}`,
    totalLines: 'Sum of lines excl. VAT',
    allowances: 'Allowances',
    charges: 'Charges',
    totalExclVat: 'Total excl. VAT',
    vatLine: (rate, base) => `VAT ${rate} on ${base}`,
    vatExempt: (base) => `VAT not applicable on ${base}`,
    totalVat: 'Total VAT',
    total: 'Total incl. VAT',
    prepaid: 'Already paid',
    payable: 'Amount due',
    payableCredit: 'Amount credited',
    paymentInfo: 'Payment terms',
    paymentMeans: 'Payment method',
    paymentMeansNames: {
      [PaymentMeansCode.CREDIT_TRANSFER]: 'Bank transfer',
      [PaymentMeansCode.DEBIT_TRANSFER]: 'Bank transfer',
      [PaymentMeansCode.PAYMENT_TO_BANK]: 'Bank transfer',
      [PaymentMeansCode.CARD]: 'Bank card',
      [PaymentMeansCode.DIRECT_DEBIT]: 'Direct debit',
    },
    accountHolder: 'Account holder',
    iban: 'IBAN',
    bic: 'BIC',
    reference: 'Payment reference',
    page: (n, total) => `Page ${n} / ${total}`,
    continued: 'continued',
    subject: 'Electronic invoice',
    quoteTitle: 'QUOTE',
    quoteSubject: 'Quote',
    validUntil: 'Valid until',
    acceptance: 'Accepted and agreed',
    acceptanceHint: 'Customer date and signature, preceded by "Accepted and agreed"',
    signatureDate: 'Date:',
    signatureField: 'Signature:',
  },
};

/** Short unit labels printed after the quantity (UNECE Rec. 20 codes). */
const UNIT_LABELS: Record<string, string> = {
  HUR: 'h',
  DAY: 'j',
  KGM: 'kg',
  MTR: 'm',
  MTK: 'm²',
  LTR: 'l',
};

// Page geometry (A4, points)
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const RIGHT = PAGE_WIDTH - MARGIN;
const TOP = PAGE_HEIGHT - MARGIN;
/** Vertical space kept at the top of continuation pages for the running title */
const CONTINUATION_HEADER = 24;

// Line items table columns
const COL_DESC_X = MARGIN + 6;
const COL_DESC_WIDTH = 222;
const COL_QTY_RIGHT = 338;
const COL_PRICE_RIGHT = 418;
const COL_VAT_RIGHT = 464;
const COL_AMOUNT_RIGHT = RIGHT - 6;
const ROW_LINE_HEIGHT = 11;
const ROW_PADDING = 5;
const TABLE_HEADER_HEIGHT = 20;

/** Height of the quote signature block (see drawSignature) */
const SIGNATURE_HEIGHT = 112;

const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.4, 0.4, 0.4);
const WHITE = rgb(1, 1, 1);
const ZEBRA = rgb(0.95, 0.95, 0.95);

interface TextStyle {
  size: number;
  font?: PDFFont;
  color?: RGB;
  align?: 'left' | 'right' | 'center';
}

interface StyledLine {
  text: string;
  size: number;
  bold?: boolean;
  color?: RGB;
  /** Space added above the line */
  gap?: number;
}

function decodeBase64(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Drawing surface that owns the pages, the vertical cursor and the page
 * breaks. `y` is the top of the next thing to draw.
 */
class Canvas {
  public readonly pages: PDFPage[] = [];
  public readonly textByPage: string[][] = [];
  public page!: PDFPage;
  public y = TOP;
  /** Called after a page break (e.g. to repeat the table header) */
  public onNewPage?: () => void;

  private readonly charset: Set<number>;

  constructor(
    private readonly pdfDoc: PDFDocument,
    public readonly regular: PDFFont,
    public readonly bold: PDFFont,
    /** Lowest y usable by the content (above the footer) */
    public readonly bottom: number
  ) {
    this.charset = new Set(regular.getCharacterSet());
    this.addPage();
  }

  /** Remove / transliterate what the font cannot draw (keeps line breaks). */
  public clean(text: string | undefined | null): string {
    if (!text) return '';
    return String(text)
      .split(/\r\n|\r|\n/)
      .map((line) => sanitizeText(line, (cp) => this.charset.has(cp)))
      .join('\n');
  }

  public width(text: string, size: number, bold = false): number {
    return (bold ? this.bold : this.regular).widthOfTextAtSize(text, size);
  }

  /** Sanitize then wrap a text to a width. */
  public wrap(text: string | undefined | null, maxWidth: number, size: number, bold = false): string[] {
    return wrapText(this.clean(text), maxWidth, (s) => this.width(s, size, bold));
  }

  public addPage(): void {
    this.page = this.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(this.page);
    this.textByPage.push([]);
    this.y = this.pages.length === 1 ? TOP : TOP - CONTINUATION_HEADER;
    if (this.pages.length > 1 && this.onNewPage) this.onNewPage();
  }

  /** Height available on a fresh continuation page. */
  public get fullPageHeight(): number {
    return TOP - CONTINUATION_HEADER - this.bottom;
  }

  public get remaining(): number {
    return this.y - this.bottom;
  }

  /** Start a new page when `height` does not fit under the cursor. */
  public ensure(height: number): void {
    if (this.remaining < height) this.addPage();
  }

  /** Draw a single (already wrapped) line with its baseline at `baseline`. */
  public textAt(text: string, x: number, baseline: number, style: TextStyle, page: PDFPage = this.page): void {
    const safe = this.clean(text).replace(/\n/g, ' ');
    if (!safe) return;
    const font = style.font ?? this.regular;
    let drawX = x;
    if (style.align === 'right') {
      drawX = x - font.widthOfTextAtSize(safe, style.size);
    } else if (style.align === 'center') {
      drawX = x - font.widthOfTextAtSize(safe, style.size) / 2;
    }
    page.drawText(safe, { x: drawX, y: baseline, size: style.size, font, color: style.color ?? BLACK });
    this.textByPage[this.pages.indexOf(page)].push(safe);
  }

  /** Draw styled lines one under the other from the cursor, with page breaks. */
  public lines(lines: StyledLine[], x: number): void {
    for (const line of lines) {
      const height = line.size * 1.35;
      this.ensure((line.gap ?? 0) + height);
      this.y -= line.gap ?? 0;
      this.textAt(line.text, x, this.y - line.size, {
        size: line.size,
        font: line.bold ? this.bold : this.regular,
        color: line.color,
      });
      this.y -= height;
    }
  }

  public static height(lines: StyledLine[]): number {
    return lines.reduce((sum, line) => sum + (line.gap ?? 0) + line.size * 1.35, 0);
  }

  public rect(x: number, yBottom: number, width: number, height: number, color: RGB): void {
    this.page.drawRectangle({ x, y: yBottom, width, height, color });
  }
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
  public async generate(invoice: Invoice, options?: PDFGenerationOptions): Promise<Uint8Array> {
    return (await this.generateWithReport(invoice, options)).bytes;
  }

  /**
   * Same as `generate`, also returning the page count and the text drawn on
   * each page.
   */
  public async generateWithReport(
    invoice: Invoice,
    options?: PDFGenerationOptions
  ): Promise<PDFGenerationReport> {
    const isQuote = options?.documentKind === 'quote';
    // Factur-X XML (throws when the invoice data is invalid); none for a quote
    const xml = isQuote
      ? ''
      : facturXGenerator.generate(invoice, {
          format: 'facturx',
          facturxProfile: 'EN16931',
          prettyPrint: true,
        });

    const language = options?.language || 'fr';
    const baseLabels = LABELS[language];
    // A quote reuses every label but is titled "DEVIS", whatever the type code
    const labels: Labels = isQuote
      ? { ...baseLabels, titles: {}, defaultTitle: baseLabels.quoteTitle, subject: baseLabels.quoteSubject }
      : baseLabels;
    const now = new Date();
    now.setMilliseconds(0);

    const pdfDoc = await PDFDocument.create({ updateMetadata: false });
    pdfDoc.registerFontkit(fontkit);

    // Embedded fonts (PDF/A forbids the non-embedded standard 14 fonts)
    const regular = await pdfDoc.embedFont(decodeBase64(EASYBILL_SANS_REGULAR_BASE64), { subset: false });
    const bold = await pdfDoc.embedFont(decodeBase64(EASYBILL_SANS_BOLD_BASE64), { subset: false });

    const canvas = this.layout(pdfDoc, invoice, regular, bold, labels, options);

    // Metadata: Info dictionary and XMP carry the same values
    const title = canvas.clean(`${this.documentTitle(invoice, labels)} ${invoice.id}`);
    const author = invoice.accountingSupplierParty.partyLegalEntity.registrationName;
    const keywords = (isQuote ? [labels.quoteSubject, invoice.id] : ['Factur-X', 'EN 16931', invoice.id]).join(', ');
    const creatorTool = 'EasyBill';
    const producer = 'EasyBill (pdf-lib)';

    pdfDoc.setTitle(title, { showInWindowTitleBar: true });
    pdfDoc.setSubject(labels.subject);
    pdfDoc.setAuthor(author);
    pdfDoc.setCreator(creatorTool);
    pdfDoc.setProducer(producer);
    pdfDoc.setKeywords([keywords]);
    pdfDoc.setCreationDate(now);
    pdfDoc.setModificationDate(now);
    pdfDoc.setLanguage(language === 'fr' ? 'fr-FR' : 'en');

    if (isQuote) {
      const bytes = await pdfDoc.save({ useObjectStreams: false });
      return { bytes, pageCount: canvas.pages.length, textByPage: canvas.textByPage };
    }

    setXmpMetadata(
      pdfDoc,
      buildXmpMetadata({
        title,
        author,
        subject: labels.subject,
        keywords,
        creatorTool,
        producer,
        date: now,
        conformanceLevel: 'EN 16931',
      })
    );
    setSRGBOutputIntent(pdfDoc);
    embedAssociatedFile(pdfDoc, new TextEncoder().encode(xml), FACTURX_FILENAME, {
      mimeType: 'text/xml',
      description: 'Factur-X invoice',
      date: now,
      relationship: 'Alternative',
    });
    setDocumentId(pdfDoc, `${invoice.id}|${invoice.issueDate}|${author}|${xml.length}|${now.getTime()}`);

    const bytes = await pdfDoc.save({ useObjectStreams: false });
    return { bytes, pageCount: canvas.pages.length, textByPage: canvas.textByPage };
  }

  /** Plain (non Factur-X) quote PDF: same pages and drawing code as an invoice. */
  public async generateQuote(
    quote: Invoice,
    options?: Omit<PDFGenerationOptions, 'documentKind'>
  ): Promise<Uint8Array> {
    return (await this.generateWithReport(quote, { ...options, documentKind: 'quote' })).bytes;
  }

  private toColor(color: { r: number; g: number; b: number } | undefined, fallback: { r: number; g: number; b: number }): RGB {
    const c = color ?? fallback;
    const clamp = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
    return rgb(clamp(c.r), clamp(c.g), clamp(c.b));
  }

  private isCreditNote(invoice: Invoice): boolean {
    return invoice.typeCode === InvoiceTypeCode.CREDIT_NOTE;
  }

  private documentTitle(invoice: Invoice, labels: Labels): string {
    return labels.titles[invoice.typeCode] ?? labels.defaultTitle;
  }

  /**
   * Lay the whole document out. Returns the canvas (pages + drawn text).
   */
  private layout(
    pdfDoc: PDFDocument,
    invoice: Invoice,
    regular: PDFFont,
    bold: PDFFont,
    labels: Labels,
    options?: PDFGenerationOptions
  ): Canvas {
    const isQuote = options?.documentKind === 'quote';
    const primary = this.toColor(options?.primaryColor, this.defaultPrimaryColor);
    const secondary = this.toColor(options?.secondaryColor, this.defaultSecondaryColor);

    // The footer height depends on the legal line: compute it first
    const footerSize = 7;
    const footerLineHeight = 9;
    const measureFooter = (s: string) => regular.widthOfTextAtSize(s, footerSize);
    const charset = new Set(regular.getCharacterSet());
    const cleanFooter = (s: string) => sanitizeText(s, (cp) => charset.has(cp));
    const footerLines: string[] = [];
    for (const text of [invoice.legalMentions?.sellerLegalLine, options?.footerText]) {
      if (text && text.trim()) {
        const wrapped = text
          .split(/\r\n|\r|\n/)
          .flatMap((l) => wrapText(cleanFooter(l), CONTENT_WIDTH, measureFooter));
        footerLines.push(...wrapped.slice(0, 4));
      }
    }
    const footerBase = 28;
    const bottom = footerBase + (footerLines.length + 1) * footerLineHeight + 14;

    const canvas = new Canvas(pdfDoc, regular, bold, bottom);

    this.drawHeader(canvas, invoice, labels, primary, isQuote ? options?.validUntil : undefined);
    this.drawParties(canvas, invoice, labels);
    this.drawNotes(canvas, invoice, labels);
    if (options?.includeLineItems !== false) {
      this.drawLineItems(canvas, invoice, labels, secondary);
    }
    this.drawTotals(canvas, invoice, labels, primary, isQuote ? SIGNATURE_HEIGHT : 0);
    this.drawVatMentions(canvas, invoice);
    this.drawPaymentAndLegalMentions(canvas, invoice, labels);
    if (isQuote) this.drawSignature(canvas, labels);

    // Running title, footer and page numbers once the page count is known
    const total = canvas.pages.length;
    const runningTitle = `${this.documentTitle(invoice, labels)} ${labels.number} ${invoice.id} - ${labels.continued}`;
    canvas.pages.forEach((page, index) => {
      if (index > 0) {
        canvas.textAt(runningTitle, MARGIN, TOP - 8, { size: 9, font: bold, color: GREY }, page);
        page.drawLine({
          start: { x: MARGIN, y: TOP - 14 },
          end: { x: RIGHT, y: TOP - 14 },
          thickness: 0.5,
          color: GREY,
        });
      }
      let y = footerBase + footerLines.length * footerLineHeight;
      page.drawLine({
        start: { x: MARGIN, y: y + footerLineHeight + 3 },
        end: { x: RIGHT, y: y + footerLineHeight + 3 },
        thickness: 0.5,
        color: GREY,
      });
      for (const line of footerLines) {
        canvas.textAt(line, PAGE_WIDTH / 2, y, { size: footerSize, color: GREY, align: 'center' }, page);
        y -= footerLineHeight;
      }
      canvas.textAt(labels.page(index + 1, total), PAGE_WIDTH / 2, y, { size: footerSize, color: GREY, align: 'center' }, page);
    });

    return canvas;
  }

  /**
   * Title, number, dates and references
   */
  private drawHeader(canvas: Canvas, invoice: Invoice, labels: Labels, color: RGB, validUntil?: string): void {
    const title = this.documentTitle(invoice, labels);
    const titleSize = canvas.width(title, 26, true) > 260 ? 18 : 26;
    canvas.textAt(title, MARGIN, canvas.y - 24, { size: titleSize, font: canvas.bold, color });

    const right: StyledLine[] = [];
    const maxWidth = 250;
    const push = (text: string, size: number, isBold = false) => {
      canvas.wrap(text, maxWidth, size, isBold).forEach((line) => right.push({ text: line, size, bold: isBold }));
    };
    push(`${labels.number} ${invoice.id}`, 12, true);
    push(`${labels.date} : ${formatDateFR(invoice.issueDate)}`, 10);
    if (invoice.dueDate) {
      push(`${labels.dueDate} : ${formatDateFR(invoice.dueDate)}`, 10);
    }
    if (validUntil) {
      push(`${labels.validUntil} ${formatDateFR(validUntil)}`, 10, true);
    }
    (invoice.invoiceDocumentReference || []).forEach((ref) => {
      if (ref.id) push(labels.creditedInvoice(ref.id, formatDateFR(ref.issueDate)), 10, true);
    });
    if (invoice.orderReference) {
      push(`${labels.orderReference} : ${invoice.orderReference}`, 9);
    }
    (invoice.additionalDocumentReference || []).forEach((ref) => {
      if (ref.id) push(`${ref.documentDescription || 'Document'} : ${ref.id}`, 9);
    });
    if (invoice.buyerReference) {
      push(`${labels.buyerReference} : ${invoice.buyerReference}`, 9);
    }

    let y = canvas.y;
    for (const line of right) {
      canvas.textAt(line.text, RIGHT, y - line.size, {
        size: line.size,
        font: line.bold ? canvas.bold : canvas.regular,
        align: 'right',
      });
      y -= line.size * 1.5;
    }
    canvas.y = Math.min(canvas.y - 36, y) - 18;
  }

  private partyLines(canvas: Canvas, party: Party, heading: string, labels: Labels, width: number): StyledLine[] {
    const lines: StyledLine[] = [{ text: heading, size: 9, bold: true, color: GREY }];
    const add = (text: string | undefined, size = 9, isBold = false, gap = 0) => {
      if (!text || !text.trim()) return;
      canvas.wrap(text, width, size, isBold).forEach((line, i) => {
        lines.push({ text: line, size, bold: isBold, gap: i === 0 ? gap : 0 });
      });
    };

    const legalName = party.partyLegalEntity.registrationName;
    add(legalName, 11, true, 3);
    if (party.partyName && party.partyName.trim() !== legalName.trim()) add(party.partyName);
    add(party.postalAddress.streetName);
    add(party.postalAddress.additionalStreetName);
    add(`${party.postalAddress.postalZone} ${party.postalAddress.cityName}`);
    if (party.postalAddress.countryCode && party.postalAddress.countryCode.toUpperCase() !== 'FR') {
      add([party.postalAddress.countrySubentity, party.postalAddress.countryCode.toUpperCase()].filter(Boolean).join(', '));
    }

    let first = true;
    const addId = (text: string) => {
      add(text, 9, false, first ? 4 : 0);
      first = false;
    };
    if (party.partyLegalEntity.companyId) {
      const id = describeCompanyId(party.partyLegalEntity.companyId, party.partyLegalEntity.companyIdScheme);
      addId(`${id.label} : ${id.value}`);
    }
    (party.partyTaxScheme || []).forEach((pts) => {
      if (pts.companyId) addId(`${labels.vatNumber} : ${pts.companyId}`);
    });
    if (party.contact?.name) addId(party.contact.name);
    if (party.contact?.telephone) addId(`${labels.phone} : ${party.contact.telephone}`);
    if (party.contact?.email) addId(`${labels.email} : ${party.contact.email}`);
    return lines;
  }

  /**
   * Seller (left) and buyer (right)
   */
  private drawParties(canvas: Canvas, invoice: Invoice, labels: Labels): void {
    const columnWidth = (CONTENT_WIDTH - 30) / 2;
    const seller = this.partyLines(canvas, invoice.accountingSupplierParty, labels.seller, labels, columnWidth);
    const buyer = this.partyLines(canvas, invoice.accountingCustomerParty, labels.buyer, labels, columnWidth);

    const top = canvas.y;
    const drawColumn = (lines: StyledLine[], x: number): number => {
      let y = top;
      for (const line of lines) {
        y -= line.gap ?? 0;
        canvas.textAt(line.text, x, y - line.size, {
          size: line.size,
          font: line.bold ? canvas.bold : canvas.regular,
          color: line.color,
        });
        y -= line.size * 1.35;
      }
      return y;
    };
    const sellerBottom = drawColumn(seller, MARGIN);
    const buyerBottom = drawColumn(buyer, MARGIN + columnWidth + 30);
    canvas.y = Math.min(sellerBottom, buyerBottom) - 18;
  }

  /** Text of the VAT exemption mention(s) to print under the totals. */
  private vatMentions(invoice: Invoice): string[] {
    const mentions: string[] = [];
    const add = (text: string | undefined) => {
      const t = (text || '').trim();
      if (t && !mentions.some((m) => m.toLowerCase() === t.toLowerCase())) mentions.push(t);
    };
    add(invoice.legalMentions?.vatExemptionText);
    if (mentions.length === 0) {
      invoice.taxTotal.forEach((tt) =>
        tt.taxSubtotals.forEach((st) => add(st.taxCategory.taxExemptionReason))
      );
    }
    return mentions;
  }

  /**
   * Free text note (wrapped, may continue on the next page)
   */
  private drawNotes(canvas: Canvas, invoice: Invoice, labels: Labels): void {
    if (!invoice.note || !invoice.note.trim()) return;

    // The VAT mention is printed under the totals: do not print it twice,
    // whether it is a whole line of the note or embedded in a longer line
    let text = invoice.note;
    for (const mention of this.vatMentions(invoice)) {
      const escaped = mention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      text = text.replace(new RegExp(`\\s*${escaped}\\s*\\.?`, 'gi'), '\n');
    }
    text = text
      .split(/\r\n|\r|\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join('\n');
    if (!text) return;

    const lines: StyledLine[] = [{ text: labels.notes, size: 10, bold: true }];
    canvas.wrap(text, CONTENT_WIDTH, 9).forEach((line, i) => {
      lines.push({ text: line, size: 9, gap: i === 0 ? 2 : 0 });
    });
    // Keep the heading with at least the first line
    canvas.ensure(Canvas.height(lines.slice(0, 2)));
    canvas.lines(lines, MARGIN);
    canvas.y -= 14;
  }

  private drawTableHeader(canvas: Canvas, labels: Labels, color: RGB): void {
    canvas.rect(MARGIN, canvas.y - TABLE_HEADER_HEIGHT, CONTENT_WIDTH, TABLE_HEADER_HEIGHT, color);
    const baseline = canvas.y - 14;
    const style = { size: 9, font: canvas.bold, color: WHITE };
    canvas.textAt(labels.description, COL_DESC_X, baseline, style);
    canvas.textAt(labels.quantity, COL_QTY_RIGHT, baseline, { ...style, align: 'right' });
    canvas.textAt(labels.unitPrice, COL_PRICE_RIGHT, baseline, { ...style, align: 'right' });
    canvas.textAt(labels.vat, COL_VAT_RIGHT, baseline, { ...style, align: 'right' });
    canvas.textAt(labels.amount, COL_AMOUNT_RIGHT, baseline, { ...style, align: 'right' });
    canvas.y -= TABLE_HEADER_HEIGHT;
  }

  private rowTextLines(canvas: Canvas, line: InvoiceLine, labels: Labels, currency: string): StyledLine[] {
    const lines: StyledLine[] = [];
    canvas.wrap(line.item.name, COL_DESC_WIDTH, 9).forEach((text) => lines.push({ text, size: 9 }));
    if (lines.length === 0) lines.push({ text: '-', size: 9 });

    const detail = (text: string | undefined) => {
      canvas.wrap(text, COL_DESC_WIDTH, 8).forEach((t) => lines.push({ text: t, size: 8, color: GREY }));
    };
    if (line.item.sellersItemIdentification) detail(`Réf. ${line.item.sellersItemIdentification}`);
    if (line.item.description && line.item.description.trim() !== line.item.name.trim()) {
      detail(line.item.description);
    }
    if (line.invoicePeriod && (line.invoicePeriod.startDate || line.invoicePeriod.endDate)) {
      detail(labels.period(formatDateFR(line.invoicePeriod.startDate), formatDateFR(line.invoicePeriod.endDate)));
    }
    (line.allowanceCharge || []).forEach((ac) => {
      const sign = ac.chargeIndicator ? '+' : '-';
      const reason = ac.allowanceChargeReason || (ac.chargeIndicator ? labels.charges : labels.discount);
      detail(`${reason} : ${sign}${formatAmountFR(ac.amount, currency)}`);
    });
    if (line.note) detail(line.note);
    return lines;
  }

  /**
   * Line items table: wrapped descriptions, header repeated on every page
   */
  private drawLineItems(canvas: Canvas, invoice: Invoice, labels: Labels, color: RGB): void {
    const currency = invoice.documentCurrencyCode;

    // Never leave the table header alone at the bottom of a page
    canvas.ensure(TABLE_HEADER_HEIGHT + 2 * ROW_PADDING + 2 * ROW_LINE_HEIGHT);
    this.drawTableHeader(canvas, labels, color);
    canvas.onNewPage = () => this.drawTableHeader(canvas, labels, color);

    invoice.invoiceLines.forEach((line, index) => {
      const textLines = this.rowTextLines(canvas, line, labels, currency);
      const background = index % 2 === 0 ? ZEBRA : undefined;
      const rowHeight = textLines.length * ROW_LINE_HEIGHT + 2 * ROW_PADDING;

      // A row is kept on one page unless it is taller than a whole page
      const maxRowHeight = canvas.fullPageHeight - TABLE_HEADER_HEIGHT;
      if (rowHeight > canvas.remaining && rowHeight <= maxRowHeight) {
        canvas.addPage();
      }

      let offset = 0;
      let firstChunk = true;
      while (offset < textLines.length) {
        let capacity = Math.floor((canvas.remaining - 2 * ROW_PADDING) / ROW_LINE_HEIGHT);
        if (capacity < Math.min(3, textLines.length - offset)) {
          canvas.addPage();
          capacity = Math.floor((canvas.remaining - 2 * ROW_PADDING) / ROW_LINE_HEIGHT);
        }
        const chunk = textLines.slice(offset, offset + Math.max(1, capacity));
        const chunkHeight = chunk.length * ROW_LINE_HEIGHT + 2 * ROW_PADDING;
        if (background) {
          canvas.rect(MARGIN, canvas.y - chunkHeight, CONTENT_WIDTH, chunkHeight, background);
        }

        let baseline = canvas.y - ROW_PADDING - 8;
        if (firstChunk) {
          const unit = UNIT_LABELS[line.unitCode] ? ` ${UNIT_LABELS[line.unitCode]}` : '';
          const category = line.item.classifiedTaxCategory;
          const vat = category.percent !== undefined ? formatPercentFR(category.percent) : '-';
          const numbers = { size: 9, align: 'right' as const };
          canvas.textAt(`${formatQuantityFR(line.invoicedQuantity)}${unit}`, COL_QTY_RIGHT, baseline, numbers);
          canvas.textAt(formatAmountFR(line.price.priceAmount, currency), COL_PRICE_RIGHT, baseline, numbers);
          canvas.textAt(vat, COL_VAT_RIGHT, baseline, numbers);
          canvas.textAt(formatAmountFR(line.lineExtensionAmount, currency), COL_AMOUNT_RIGHT, baseline, numbers);
        }
        for (const textLine of chunk) {
          canvas.textAt(textLine.text, COL_DESC_X, baseline, { size: textLine.size, color: textLine.color });
          baseline -= ROW_LINE_HEIGHT;
        }

        canvas.y -= chunkHeight;
        offset += chunk.length;
        firstChunk = false;
      }
    });

    canvas.onNewPage = undefined;
    canvas.page.drawLine({
      start: { x: MARGIN, y: canvas.y },
      end: { x: RIGHT, y: canvas.y },
      thickness: 0.5,
      color: GREY,
    });
    canvas.y -= 14;
  }

  /**
   * Totals block (never split over two pages)
   */
  private drawTotals(canvas: Canvas, invoice: Invoice, labels: Labels, color: RGB, reserve = 0): void {
    const totals = invoice.legalMonetaryTotal;
    const currency = invoice.documentCurrencyCode;
    const money = (v: number) => formatAmountFR(v, currency);

    const rows: { label: string; value: string; highlight?: boolean; bold?: boolean }[] = [];
    const hasAllowances = (totals.allowanceTotalAmount ?? 0) > 0;
    const hasCharges = (totals.chargeTotalAmount ?? 0) > 0;
    if (hasAllowances || hasCharges) {
      rows.push({ label: labels.totalLines, value: money(totals.lineExtensionAmount) });
      if (hasAllowances) rows.push({ label: labels.allowances, value: money(-(totals.allowanceTotalAmount as number)) });
      if (hasCharges) rows.push({ label: labels.charges, value: money(totals.chargeTotalAmount as number) });
    }
    rows.push({ label: labels.totalExclVat, value: money(totals.taxExclusiveAmount), bold: true });

    let taxAmount = 0;
    invoice.taxTotal.forEach((tt) => {
      taxAmount += tt.taxAmount;
      tt.taxSubtotals.forEach((st) => {
        const base = money(st.taxableAmount);
        const rate = st.taxCategory.percent;
        const label =
          rate !== undefined && (rate > 0 || st.taxAmount !== 0)
            ? labels.vatLine(formatPercentFR(rate), base)
            : rate !== undefined && st.taxCategory.id === 'Z'
              ? labels.vatLine(formatPercentFR(0), base)
              : labels.vatExempt(base);
        rows.push({ label, value: money(st.taxAmount) });
      });
    });
    const subtotalCount = invoice.taxTotal.reduce((n, tt) => n + tt.taxSubtotals.length, 0);
    if (subtotalCount !== 1) {
      rows.push({ label: labels.totalVat, value: money(taxAmount) });
    }
    rows.push({ label: labels.total, value: money(totals.taxInclusiveAmount), highlight: true });

    const prepaid = totals.prepaidAmount ?? 0;
    if (prepaid > 0 || Math.abs(totals.payableAmount - totals.taxInclusiveAmount) > 0.004) {
      if (prepaid > 0) rows.push({ label: labels.prepaid, value: money(-prepaid) });
      rows.push({
        label: this.isCreditNote(invoice) ? labels.payableCredit : labels.payable,
        value: money(totals.payableAmount),
        bold: true,
      });
    }

    const boxWidth = 250;
    const boxLeft = RIGHT - boxWidth;
    const rowHeight = 17;
    const highlightHeight = 24;
    const height = rows.reduce((sum, r) => sum + (r.highlight ? highlightHeight + 6 : rowHeight), 0);

    canvas.ensure(height + 6 + reserve);
    for (const row of rows) {
      if (row.highlight) {
        canvas.y -= 3;
        canvas.rect(boxLeft, canvas.y - highlightHeight, boxWidth, highlightHeight, color);
        const baseline = canvas.y - 16;
        canvas.textAt(row.label, boxLeft + 8, baseline, { size: 12, font: canvas.bold, color: WHITE });
        canvas.textAt(row.value, RIGHT - 8, baseline, { size: 12, font: canvas.bold, color: WHITE, align: 'right' });
        canvas.y -= highlightHeight + 3;
      } else {
        const font = row.bold ? canvas.bold : canvas.regular;
        const baseline = canvas.y - 12;
        canvas.textAt(row.label, boxLeft + 8, baseline, { size: 10, font });
        canvas.textAt(row.value, RIGHT - 8, baseline, { size: 10, font, align: 'right' });
        canvas.y -= rowHeight;
      }
    }
    canvas.y -= 10;
  }

  /**
   * VAT exemption mention(s), e.g. "TVA non applicable, art. 293 B du CGI"
   */
  private drawVatMentions(canvas: Canvas, invoice: Invoice): void {
    const lines: StyledLine[] = [];
    this.vatMentions(invoice).forEach((mention) => {
      canvas.wrap(mention, CONTENT_WIDTH, 9, true).forEach((text) => lines.push({ text, size: 9, bold: true }));
    });
    if (lines.length === 0) return;
    canvas.ensure(Canvas.height(lines));
    canvas.lines(lines, MARGIN);
    canvas.y -= 10;
  }

  /**
   * Quote acceptance block: "Bon pour accord", date and signature boxes.
   * Never split over two pages; the totals reserve room for it so that both
   * stay on the same page.
   */
  private drawSignature(canvas: Canvas, labels: Labels): void {
    canvas.y -= 10;
    canvas.ensure(SIGNATURE_HEIGHT);
    const top = canvas.y;
    canvas.textAt(labels.acceptance, MARGIN, top - 11, { size: 11, font: canvas.bold });
    canvas.textAt(labels.acceptanceHint, MARGIN, top - 24, { size: 8, color: GREY });

    const boxTop = top - 32;
    const boxHeight = SIGNATURE_HEIGHT - 42;
    const gap = 14;
    const dateWidth = 150;
    const boxes = [
      { x: MARGIN, width: dateWidth, label: labels.signatureDate },
      { x: MARGIN + dateWidth + gap, width: CONTENT_WIDTH - dateWidth - gap, label: labels.signatureField },
    ];
    for (const box of boxes) {
      canvas.page.drawRectangle({
        x: box.x,
        y: boxTop - boxHeight,
        width: box.width,
        height: boxHeight,
        borderColor: GREY,
        borderWidth: 0.7,
      });
      canvas.textAt(box.label, box.x + 6, boxTop - 12, { size: 8, color: GREY });
    }
    canvas.y = boxTop - boxHeight - 6;
  }

  /**
   * Payment terms, bank details and mandatory French mentions
   */
  private drawPaymentAndLegalMentions(canvas: Canvas, invoice: Invoice, labels: Labels): void {
    const mentions = invoice.legalMentions;
    const creditNote = this.isCreditNote(invoice);
    const size = 9;
    const body: StyledLine[] = [];
    const add = (text: string | undefined, gap = 0) => {
      if (!text || !text.trim()) return;
      canvas.wrap(text, CONTENT_WIDTH, size).forEach((line, i) => {
        body.push({ text: line, size, gap: i === 0 ? gap : 0 });
      });
    };

    // Payment terms: the ready-to-print mention wins over the EN16931 note
    add(mentions?.paymentTermsText || (creditNote ? undefined : invoice.paymentTerms?.note));
    if (invoice.dueDate) {
      add(`${labels.dueDate} : ${formatDateFR(invoice.dueDate)}`);
    }

    const means = invoice.paymentMeans || [];
    const account = means.find((pm) => pm.payeeFinancialAccount)?.payeeFinancialAccount;
    const iban = mentions?.bankDetails?.iban || account?.id;
    const bic = mentions?.bankDetails?.bic || account?.financialInstitutionBranch?.id;
    const holder = mentions?.bankDetails?.accountHolder || account?.name;
    if (!creditNote || iban) {
      const names = Array.from(
        new Set(means.map((pm) => labels.paymentMeansNames[pm.paymentMeansCode]).filter(Boolean))
      );
      if (names.length > 0) add(`${labels.paymentMeans} : ${names.join(', ')}`);
    }
    if (holder && iban) add(`${labels.accountHolder} : ${holder}`);
    if (iban) add(`${labels.iban} : ${formatIban(iban)}`);
    if (bic) add(`${labels.bic} : ${bic}`);
    if (!creditNote) {
      const reference = means.find((pm) => pm.paymentId)?.paymentId;
      if (reference) add(`${labels.reference} : ${reference}`);
    }

    add(mentions?.earlyPaymentDiscountText, 5);
    add(mentions?.latePenaltyText, mentions?.earlyPaymentDiscountText ? 0 : 5);
    add(mentions?.recoveryFeeText);

    if (body.length === 0) return;

    const lines: StyledLine[] = [{ text: labels.paymentInfo, size: 10, bold: true }, ...body];
    lines[1].gap = (lines[1].gap ?? 0) + 3;
    // Keep the block together when it fits on a page, otherwise let it flow
    // while keeping the heading with its first lines
    const height = Canvas.height(lines);
    canvas.ensure(height <= canvas.fullPageHeight ? height : Canvas.height(lines.slice(0, 4)));
    canvas.lines(lines, MARGIN);
  }
}

// Export singleton instance
export const pdfGenerator = new PDFGenerator();
