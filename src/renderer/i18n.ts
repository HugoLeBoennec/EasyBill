/**
 * Locale helpers shared by every screen: string interpolation and the
 * Intl-based number / currency / date formatters.
 *
 * Only the UI follows the locale. Dates are always stored and sent to the
 * backend as ISO strings (YYYY-MM-DD) and legal documents stay French.
 */

export type Locale = 'fr' | 'en';

/** BCP 47 tag used by Intl for each UI locale (amounts are always EUR). */
export const INTL_LOCALES: Record<Locale, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
};

/**
 * Replace `{name}` placeholders. Unknown placeholders are left untouched so a
 * typo is visible instead of silently rendering "undefined".
 */
export const interpolate = (
  template: string,
  values: Record<string, string | number> = {}
): string =>
  template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );

/** Amount in cents -> localised EUR string ("1 234,50 €" / "€1,234.50"). */
export const formatAmount = (cents: number, locale: Locale): string =>
  new Intl.NumberFormat(INTL_LOCALES[locale], {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);

/** Plain localised number (quantities, percentages, counters). */
export const formatNumber = (
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions
): string => new Intl.NumberFormat(INTL_LOCALES[locale], options).format(value);

/**
 * ISO date (YYYY-MM-DD, optionally followed by a time) -> localised date.
 * Built from the calendar parts so no time zone shifts the day. Returns '-'
 * for an empty value and the raw input when it is not an ISO date.
 */
export const formatDate = (
  dateStr: string | null | undefined,
  locale: Locale
): string => {
  if (!dateStr) return '-';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!match) return dateStr;
  const [, year, month, day] = match;
  // Noon UTC formatted in UTC: immune to the machine time zone
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
};

/** Decimal text for an amount input, with the locale's decimal separator. */
export const formatDecimalInput = (cents: number, locale: Locale): string =>
  (cents / 100).toFixed(2).replace('.', locale === 'fr' ? ',' : '.');
