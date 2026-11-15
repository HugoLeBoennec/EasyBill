/**
 * Minimal sRGB ICC profile (ICC v2.1, RGB display matrix/TRC profile),
 * generated in code so that no third-party profile file has to be shipped.
 *
 * It is used as the DestOutputProfile of the PDF/A OutputIntent. Colorants
 * and white point are the D50-adapted sRGB (IEC 61966-2-1) primaries and the
 * tone curve is the exact sRGB transfer function sampled on 1024 points.
 */

const s15Fixed16 = (value: number): number => Math.round(value * 65536) | 0;

function ascii(text: string): number[] {
  return Array.from(text).map((c) => c.charCodeAt(0) & 0x7f);
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function xyzTag(x: number, y: number, z: number): number[] {
  return [...ascii('XYZ '), 0, 0, 0, 0, ...u32(s15Fixed16(x)), ...u32(s15Fixed16(y)), ...u32(s15Fixed16(z))];
}

function textTag(text: string): number[] {
  return [...ascii('text'), 0, 0, 0, 0, ...ascii(text), 0];
}

function descTag(text: string): number[] {
  const chars = ascii(text);
  return [
    ...ascii('desc'), 0, 0, 0, 0,
    ...u32(chars.length + 1), ...chars, 0,
    0, 0, 0, 0, // Unicode language code
    0, 0, 0, 0, // Unicode description length
    0, 0, // ScriptCode code
    0, // ScriptCode description length
    ...new Array<number>(67).fill(0),
  ];
}

function srgbCurveTag(points: number): number[] {
  const out = [...ascii('curv'), 0, 0, 0, 0, ...u32(points)];
  for (let i = 0; i < points; i++) {
    const v = i / (points - 1);
    const linear = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    const n = Math.max(0, Math.min(65535, Math.round(linear * 65535)));
    out.push((n >> 8) & 0xff, n & 0xff);
  }
  return out;
}

let cached: Uint8Array | undefined;

/** Build (once) the bytes of the sRGB ICC profile. */
export function buildSRGBProfile(): Uint8Array {
  if (cached) return cached;

  const curve = srgbCurveTag(1024);
  // Tag data blocks; the three TRC tags share the same block.
  const blocks: { signatures: string[]; data: number[] }[] = [
    { signatures: ['desc'], data: descTag('sRGB IEC61966-2.1') },
    { signatures: ['cprt'], data: textTag('No copyright, use freely') },
    { signatures: ['wtpt'], data: xyzTag(0.9642, 1.0, 0.8249) },
    { signatures: ['rXYZ'], data: xyzTag(0.43607, 0.22249, 0.01392) },
    { signatures: ['gXYZ'], data: xyzTag(0.38515, 0.71687, 0.09708) },
    { signatures: ['bXYZ'], data: xyzTag(0.14307, 0.06061, 0.7141) },
    { signatures: ['rTRC', 'gTRC', 'bTRC'], data: curve },
  ];

  const tagCount = blocks.reduce((n, b) => n + b.signatures.length, 0);
  let offset = 128 + 4 + tagCount * 12;
  const table: number[] = [...u32(tagCount)];
  const body: number[] = [];
  for (const block of blocks) {
    for (const signature of block.signatures) {
      table.push(...ascii(signature), ...u32(offset), ...u32(block.data.length));
    }
    body.push(...block.data);
    offset += block.data.length;
    while (offset % 4 !== 0) {
      body.push(0);
      offset++;
    }
  }

  const header: number[] = [
    ...u32(offset), // profile size
    0, 0, 0, 0, // preferred CMM
    0x02, 0x10, 0x00, 0x00, // version 2.1.0
    ...ascii('mntr'), // device class: display
    ...ascii('RGB '), // colour space
    ...ascii('XYZ '), // profile connection space
    0x07, 0xe9, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, // 2025-01-01 00:00:00
    ...ascii('acsp'),
    0, 0, 0, 0, // primary platform
    0, 0, 0, 0, // flags
    0, 0, 0, 0, // device manufacturer
    0, 0, 0, 0, // device model
    0, 0, 0, 0, 0, 0, 0, 0, // device attributes
    0, 0, 0, 0, // rendering intent: perceptual
    ...u32(s15Fixed16(0.9642)), ...u32(s15Fixed16(1.0)), ...u32(s15Fixed16(0.8249)), // D50 illuminant
    0, 0, 0, 0, // creator
  ];
  while (header.length < 128) header.push(0);

  cached = Uint8Array.from([...header, ...table, ...body]);
  return cached;
}
