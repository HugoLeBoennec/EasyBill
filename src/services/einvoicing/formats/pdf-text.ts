/**
 * Text helpers for the human-readable invoice (PDF): French number / date
 * formatting, identifier labels, character sanitizing and line wrapping.
 *
 * Pure functions, no dependency on pdf-lib, so they can be unit tested.
 */

const NBSP = ' ';

/** Symbols printed after the amount; other currencies use their ISO code. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
};

/** Group the digits of an integer string by 3 with no-break spaces. */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/**
 * French number formatting: `2213.27` -> `2 213,27` (no-break space U+00A0 as
 * thousands separator, which every PDF font encoding supports, unlike the
 * narrow no-break space U+202F produced by Intl).
 */
export function formatNumberFR(value: number, minDecimals = 2, maxDecimals = minDecimals): string {
  const safe = Number.isFinite(value) ? value : 0;
  let fixed = Math.abs(safe).toFixed(maxDecimals);
  if (maxDecimals > minDecimals && fixed.includes('.')) {
    // Drop trailing zeros beyond the minimum number of decimals
    const [int, dec] = fixed.split('.');
    let trimmed = dec;
    while (trimmed.length > minDecimals && trimmed.endsWith('0')) {
      trimmed = trimmed.slice(0, -1);
    }
    fixed = trimmed.length > 0 ? `${int}.${trimmed}` : int;
  }
  const [intPart, decPart] = fixed.split('.');
  const isZero = Number(fixed) === 0;
  const sign = safe < 0 && !isZero ? '-' : '';
  return sign + groupThousands(intPart) + (decPart ? `,${decPart}` : '');
}

/** `2213.27, 'EUR'` -> `2 213,27 €` */
export function formatAmountFR(value: number, currency = 'EUR'): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${formatNumberFR(value, 2)}${NBSP}${symbol}`;
}

/** Quantity with up to 4 decimals and no trailing zeros: `1.5` -> `1,5` */
export function formatQuantityFR(value: number): string {
  return formatNumberFR(value, 0, 4);
}

/** VAT rate: `20` -> `20 %`, `5.5` -> `5,5 %` */
export function formatPercentFR(value: number): string {
  return `${formatNumberFR(value, 0, 2)}${NBSP}%`;
}

/**
 * Format an ISO 8601 date (`AAAA-MM-JJ`, optionally followed by a time) as
 * `JJ/MM/AAAA` without going through a `Date` object, so the result never
 * depends on the time zone of the machine.
 */
export function formatDateFR(isoDate: string | undefined | null): string {
  if (!isoDate) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!match) return isoDate.trim();
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export interface CompanyIdLabel {
  label: string;
  value: string;
}

/**
 * Label and display value of a French legal identifier: 9 digits = SIREN,
 * 14 digits = SIRET (the ISO 6523 scheme, when given, wins: 0002 / 0009).
 */
export function describeCompanyId(id: string, schemeId?: string): CompanyIdLabel {
  const compact = id.replace(/[\s. ]/g, '');
  const isDigits = /^\d+$/.test(compact);
  if (schemeId === '0002' || (schemeId === undefined && isDigits && compact.length === 9)) {
    return {
      label: 'SIREN',
      value: isDigits && compact.length === 9 ? compact.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : id,
    };
  }
  if (schemeId === '0009' || (schemeId === undefined && isDigits && compact.length === 14)) {
    return {
      label: 'SIRET',
      value:
        isDigits && compact.length === 14
          ? compact.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, '$1 $2 $3 $4')
          : id,
    };
  }
  if (isDigits && compact.length === 9) {
    return { label: 'SIREN', value: id };
  }
  if (isDigits && compact.length === 14) {
    return { label: 'SIRET', value: id };
  }
  return { label: "N° d'identification", value: id };
}

/** Display an IBAN in groups of 4 characters. */
export function formatIban(iban: string): string {
  const compact = iban.replace(/\s+/g, '').toUpperCase();
  return compact.replace(/(.{4})(?=.)/g, '$1 ');
}

/** Replacements for characters that the embedded font may not contain. */
const TRANSLITERATIONS: Record<string, string> = {
  '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', '⇐': '<=',
  '↑': '^', '↓': 'v',
  '‘': "'", '’': "'", '‚': "'", '′': "'", 'ʼ': "'",
  '“': '"', '”': '"', '„': '"', '″': '"',
  '«': '"', '»': '"', '‹': '<', '›': '>',
  '‐': '-', '‑': '-', '‒': '-', '–': '-', '—': '-', '―': '-',
  '−': '-', '⁃': '-',
  '…': '...', '•': '-', '●': '-', '◦': '-', '‣': '-', '·': '-',
  '✓': 'v', '✔': 'v', '✅': 'v', '✗': 'x', '✘': 'x', '❌': 'x',
  '€': 'EUR', '£': 'GBP', '¥': 'JPY',
  '™': '(TM)', '®': '(R)', '©': '(c)',
  '×': 'x', '÷': '/', '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~',
  '°': ' deg', '№': 'N°', '½': '1/2', '¼': '1/4', '¾': '3/4',
  'Œ': 'OE', 'œ': 'oe', 'Æ': 'AE', 'æ': 'ae', 'ß': 'ss',
  'Ø': 'O', 'ø': 'o', 'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd',
};

function isSpaceLike(cp: number): boolean {
  return (
    cp === 0x09 || cp === 0x1680 || (cp >= 0x2000 && cp <= 0x200a) || cp === 0x205f || cp === 0x3000
  );
}

function isInvisible(cp: number): boolean {
  return (
    cp < 0x20 || (cp >= 0x7f && cp <= 0x9f) || // control characters
    cp === 0xad || // soft hyphen
    (cp >= 0x200b && cp <= 0x200f) || // zero width spaces / joiners / marks
    (cp >= 0x2028 && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x2064) ||
    cp === 0xfeff ||
    (cp >= 0xfe00 && cp <= 0xfe0f) || // variation selectors
    (cp >= 0x0300 && cp <= 0x036f) || // combining marks left after decomposition
    (cp >= 0x1f3fb && cp <= 0x1f3ff) || // emoji skin tones
    (cp >= 0xe0000 && cp <= 0xe0fff)
  );
}

function isPictograph(cp: number): boolean {
  return (
    (cp >= 0x1f000 && cp <= 0x1faff) || // emoji & pictographs
    (cp >= 0x2600 && cp <= 0x27bf) || // misc symbols, dingbats
    (cp >= 0x2b00 && cp <= 0x2bff) ||
    (cp >= 0x2300 && cp <= 0x23ff) ||
    (cp >= 0xe000 && cp <= 0xf8ff) // private use
  );
}

/**
 * Make a text drawable with a font that only supports some characters:
 * supported characters are kept untouched; the others are transliterated
 * (`→` becomes `->`, `Ł` becomes `L`, exotic spaces become spaces...),
 * emoji and invisible characters are removed and anything else becomes `?`.
 * Never throws. Line breaks are turned into spaces: wrap before sanitizing.
 *
 * @param isSupported tells whether the font has a glyph for a code point
 */
export function sanitizeText(text: string, isSupported: (codePoint: number) => boolean): string {
  if (!text) return '';
  let out = '';
  let removedPictograph = false;

  const pushFallback = (ch: string, depth: number): void => {
    for (const c of Array.from(ch)) {
      const cp = c.codePointAt(0) as number;
      if (cp === 0x0a || cp === 0x0d) {
        out += ' ';
      } else if (isSupported(cp) && !isInvisible(cp)) {
        out += c;
      } else if (cp === 0xa0 || cp === 0x202f || isSpaceLike(cp)) {
        out += ' ';
      } else if (isInvisible(cp)) {
        // dropped
      } else if (TRANSLITERATIONS[c] !== undefined && depth < 2) {
        pushFallback(TRANSLITERATIONS[c], depth + 1);
      } else if (isPictograph(cp)) {
        removedPictograph = true;
      } else {
        const decomposed = depth < 2 ? c.normalize('NFKD') : c;
        if (decomposed !== c) {
          pushFallback(decomposed, depth + 1);
        } else {
          out += isSupported(0x3f) ? '?' : '';
        }
      }
    }
  };

  pushFallback(text, 0);

  if (removedPictograph) {
    // Removing a pictograph may leave two consecutive spaces
    out = out.replace(/ {2,}/g, ' ').trim();
  }
  return out;
}

/**
 * Wrap a text to a maximum width. Explicit line breaks are kept, words longer
 * than a full line are split. Always returns at least one line for a
 * non-empty text.
 *
 * @param measure width of a string in the font / size used for drawing
 */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  if (!text) return lines;

  for (const paragraph of text.split(/\r\n|\r|\n/)) {
    const words = paragraph.split(/[ \t]+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (let word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) {
        lines.push(current);
        current = '';
      }
      // The word alone does not fit: split it
      while (measure(word) > maxWidth && word.length > 1) {
        const chars = Array.from(word);
        let cut = chars.length - 1;
        while (cut > 1 && measure(chars.slice(0, cut).join('')) > maxWidth) {
          cut--;
        }
        lines.push(chars.slice(0, cut).join(''));
        word = chars.slice(cut).join('');
      }
      current = word;
    }
    lines.push(current);
  }

  // Trailing empty lines are useless
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}
