/**
 * PDF/A-3b + Factur-X plumbing on top of pdf-lib:
 *  - XMP metadata packet (PDF/A identification + Factur-X extension schema)
 *  - sRGB OutputIntent with an embedded ICC profile
 *  - embedded `factur-x.xml` declared as an Associated File (/AF)
 *  - file identifier (/ID) in the trailer
 *
 * pdf-lib has no high level API for any of these, so the low level objects
 * are created directly in the document context.
 */

import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';
import { buildSRGBProfile } from './srgb-icc';

/** File name imposed by the Factur-X specification for the embedded XML. */
export const FACTURX_FILENAME = 'factur-x.xml';

/** Namespace of the Factur-X XMP extension schema. */
export const FACTURX_XMP_NAMESPACE = 'urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#';

/** Factur-X profile names as they must appear in `fx:ConformanceLevel`. */
export type FacturXConformanceLevel = 'MINIMUM' | 'BASIC WL' | 'BASIC' | 'EN 16931' | 'EXTENDED';

export interface XmpMetadataInput {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creatorTool: string;
  producer: string;
  /** Creation = modification date (written with a 1 s precision, UTC) */
  date: Date;
  conformanceLevel: FacturXConformanceLevel;
  /** `INVOICE` for every Factur-X document (invoices and credit notes) */
  documentType?: string;
  documentFileName?: string;
  facturXVersion?: string;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Characters that are not allowed in XML 1.0
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
}

/** `2026-01-31T10:20:30Z` (same instant and precision as the Info dictionary). */
export function xmpDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function extensionProperty(name: string, description: string): string {
  return [
    '            <rdf:li rdf:parseType="Resource">',
    `              <pdfaProperty:name>${name}</pdfaProperty:name>`,
    '              <pdfaProperty:valueType>Text</pdfaProperty:valueType>',
    '              <pdfaProperty:category>external</pdfaProperty:category>',
    `              <pdfaProperty:description>${description}</pdfaProperty:description>`,
    '            </rdf:li>',
  ].join('\n');
}

/**
 * Build the XMP packet: PDF/A-3 conformance B identification, Dublin Core /
 * XMP basic / Adobe PDF properties mirroring the Info dictionary, and the
 * Factur-X extension schema with its four properties.
 */
export function buildXmpMetadata(input: XmpMetadataInput): string {
  const date = xmpDate(input.date);
  const documentType = input.documentType ?? 'INVOICE';
  const documentFileName = input.documentFileName ?? FACTURX_FILENAME;
  const version = input.facturXVersion ?? '1.0';

  return [
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">',
    '      <pdfaid:part>3</pdfaid:part>',
    '      <pdfaid:conformance>B</pdfaid:conformance>',
    '    </rdf:Description>',
    '    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '      <dc:format>application/pdf</dc:format>',
    '      <dc:title>',
    '        <rdf:Alt>',
    `          <rdf:li xml:lang="x-default">${escapeXml(input.title)}</rdf:li>`,
    '        </rdf:Alt>',
    '      </dc:title>',
    '      <dc:creator>',
    '        <rdf:Seq>',
    `          <rdf:li>${escapeXml(input.author)}</rdf:li>`,
    '        </rdf:Seq>',
    '      </dc:creator>',
    '      <dc:description>',
    '        <rdf:Alt>',
    `          <rdf:li xml:lang="x-default">${escapeXml(input.subject)}</rdf:li>`,
    '        </rdf:Alt>',
    '      </dc:description>',
    '    </rdf:Description>',
    '    <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">',
    `      <pdf:Producer>${escapeXml(input.producer)}</pdf:Producer>`,
    `      <pdf:Keywords>${escapeXml(input.keywords)}</pdf:Keywords>`,
    '    </rdf:Description>',
    '    <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">',
    `      <xmp:CreatorTool>${escapeXml(input.creatorTool)}</xmp:CreatorTool>`,
    `      <xmp:CreateDate>${date}</xmp:CreateDate>`,
    `      <xmp:ModifyDate>${date}</xmp:ModifyDate>`,
    `      <xmp:MetadataDate>${date}</xmp:MetadataDate>`,
    '    </rdf:Description>',
    '    <rdf:Description rdf:about=""',
    '        xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"',
    '        xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"',
    '        xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">',
    '      <pdfaExtension:schemas>',
    '        <rdf:Bag>',
    '          <rdf:li rdf:parseType="Resource">',
    '            <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>',
    `            <pdfaSchema:namespaceURI>${FACTURX_XMP_NAMESPACE}</pdfaSchema:namespaceURI>`,
    '            <pdfaSchema:prefix>fx</pdfaSchema:prefix>',
    '            <pdfaSchema:property>',
    '              <rdf:Seq>',
    extensionProperty('DocumentFileName', 'The name of the embedded XML document'),
    extensionProperty('DocumentType', 'The type of the hybrid document in capital letters, e.g. INVOICE or ORDER'),
    extensionProperty('Version', 'The actual version of the standard applying to the embedded XML document'),
    extensionProperty('ConformanceLevel', 'The conformance level of the embedded XML document'),
    '              </rdf:Seq>',
    '            </pdfaSchema:property>',
    '          </rdf:li>',
    '        </rdf:Bag>',
    '      </pdfaExtension:schemas>',
    '    </rdf:Description>',
    `    <rdf:Description rdf:about="" xmlns:fx="${FACTURX_XMP_NAMESPACE}">`,
    `      <fx:DocumentType>${escapeXml(documentType)}</fx:DocumentType>`,
    `      <fx:DocumentFileName>${escapeXml(documentFileName)}</fx:DocumentFileName>`,
    `      <fx:Version>${escapeXml(version)}</fx:Version>`,
    `      <fx:ConformanceLevel>${escapeXml(input.conformanceLevel)}</fx:ConformanceLevel>`,
    '    </rdf:Description>',
    '  </rdf:RDF>',
    '</x:xmpmeta>',
    '<?xpacket end="w"?>',
  ].join('\n');
}

/** Attach the XMP packet to the catalog as an uncompressed metadata stream. */
export function setXmpMetadata(pdfDoc: PDFDocument, xmp: string): void {
  const bytes = new TextEncoder().encode(xmp);
  const stream = pdfDoc.context.stream(bytes, {
    Type: 'Metadata',
    Subtype: 'XML',
    Length: bytes.length,
  });
  pdfDoc.catalog.set(PDFName.of('Metadata'), pdfDoc.context.register(stream));
}

/** Declare sRGB as the output intent of the document (embedded ICC profile). */
export function setSRGBOutputIntent(pdfDoc: PDFDocument): void {
  const { context } = pdfDoc;
  const profile = context.flateStream(buildSRGBProfile(), { N: 3 });
  const intent = context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
    RegistryName: PDFString.of('http://www.color.org'),
    DestOutputProfile: context.register(profile),
  });
  pdfDoc.catalog.set(PDFName.of('OutputIntents'), context.obj([context.register(intent)]));
}

export interface AssociatedFileOptions {
  mimeType: string;
  description: string;
  date: Date;
  /**
   * Relationship to the visual document. Factur-X: `Data` for the MINIMUM and
   * BASIC WL profiles, `Alternative` for BASIC, EN 16931 and EXTENDED.
   */
  relationship: 'Alternative' | 'Data' | 'Source' | 'Supplement' | 'Unspecified';
}

/**
 * Embed a file, register it in the EmbeddedFiles name tree and reference it
 * from the catalog's /AF array (PDF/A-3 associated file).
 */
export function embedAssociatedFile(
  pdfDoc: PDFDocument,
  data: Uint8Array,
  fileName: string,
  options: AssociatedFileOptions
): void {
  const { context, catalog } = pdfDoc;

  const fileStream = context.flateStream(data, {
    Type: 'EmbeddedFile',
    Subtype: options.mimeType,
    Params: {
      Size: data.length,
      CreationDate: PDFString.fromDate(options.date),
      ModDate: PDFString.fromDate(options.date),
    },
  });
  const fileStreamRef = context.register(fileStream);

  const fileSpec = context.obj({
    Type: 'Filespec',
    F: PDFString.of(fileName),
    UF: PDFHexString.fromText(fileName),
    EF: { F: fileStreamRef, UF: fileStreamRef },
    Desc: PDFHexString.fromText(options.description),
    AFRelationship: options.relationship,
  });
  const fileSpecRef = context.register(fileSpec);

  // Name tree: /Names << /EmbeddedFiles << /Names [ (name) ref ] >> >>
  let names = catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  if (!names) {
    names = context.obj({});
    catalog.set(PDFName.of('Names'), names);
  }
  let embeddedFiles = names.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
  if (!embeddedFiles) {
    embeddedFiles = context.obj({});
    names.set(PDFName.of('EmbeddedFiles'), embeddedFiles);
  }
  let nameArray = embeddedFiles.lookupMaybe(PDFName.of('Names'), PDFArray);
  if (!nameArray) {
    nameArray = context.obj([]);
    embeddedFiles.set(PDFName.of('Names'), nameArray);
  }
  nameArray.push(PDFHexString.fromText(fileName));
  nameArray.push(fileSpecRef);

  // Associated files of the document
  let associated = catalog.lookupMaybe(PDFName.of('AF'), PDFArray);
  if (!associated) {
    associated = context.obj([]);
    catalog.set(PDFName.of('AF'), associated);
  }
  associated.push(fileSpecRef);
}

/** 32 hexadecimal characters derived from the given seed (not cryptographic). */
export function documentIdHex(seed: string): string {
  let hex = '';
  for (let round = 0; round < 4; round++) {
    // FNV-1a with a different offset basis per round
    let hash = (0x811c9dc5 ^ Math.imul(round + 1, 0x9e3779b1)) >>> 0;
    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hex += hash.toString(16).padStart(8, '0');
  }
  return hex.toUpperCase();
}

/** Write the file identifier required by PDF/A in the trailer. */
export function setDocumentId(pdfDoc: PDFDocument, seed: string): void {
  const id = PDFHexString.of(documentIdHex(seed));
  pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([id, id]);
}
