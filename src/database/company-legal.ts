/**
 * French legal mentions of the seller: default texts and small pure helpers
 * shared by the company page (renderer) and the invoice mapper (main).
 *
 * No Electron / database / React dependency.
 */

/** Mention required when the seller benefits from the VAT franchise. */
export const VAT_FRANCHISE_MENTION = 'TVA non applicable, art. 293 B du CGI';

/** Default late-payment penalty mention (art. L441-10 du Code de commerce). */
export const DEFAULT_LATE_PENALTY_TEXT =
  "En cas de retard de paiement, application de pénalités au taux de 3 fois le taux d'intérêt légal";

/** Fixed recovery fee mention, mandatory between professionals. */
export const RECOVERY_FEE_TEXT =
  'Indemnité forfaitaire pour frais de recouvrement : 40 €';

/** Default early-payment discount mention. */
export const DEFAULT_EARLY_PAYMENT_DISCOUNT_TEXT =
  "Pas d'escompte pour paiement anticipé";

/** Payment term proposed when the company has not chosen one. */
export const DEFAULT_PAYMENT_TERMS_DAYS = 30;

/** Mention every individual entrepreneur must print since 15 May 2022. */
export const INDIVIDUAL_ENTREPRENEUR_MENTION = 'EI';

const normalize = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

/**
 * Whether a free-text legal form designates an individual entrepreneur
 * ("EI", "EI (micro-entrepreneur)", "EIRL", "Entrepreneur individuel",
 * "Auto-entrepreneur", "Micro-entreprise"...). Such sellers have no share
 * capital and must print "EI" next to their name.
 */
export function isIndividualEntrepreneur(
  legalForm: string | null | undefined
): boolean {
  const form = normalize(legalForm);
  if (!form) return false;
  return (
    /^ei(rl)?\b/.test(form) ||
    form.includes('entrepreneur individuel') ||
    form.includes('entreprise individuelle') ||
    /\b(micro|auto)[\s-]?entre/.test(form)
  );
}

/**
 * Whether a share capital may apply: everything but individual entrepreneurs
 * and associations (an unknown / empty legal form is given the benefit of
 * the doubt).
 */
export function hasShareCapital(legalForm: string | null | undefined): boolean {
  const form = normalize(legalForm);
  if (isIndividualEntrepreneur(form)) return false;
  return !/^(association|profession liberale)/.test(form);
}

/**
 * Amount in euros as printed in France: "10 000 €", "1 500,50 €".
 * Plain spaces only, so the text can be drawn with any PDF font.
 */
export function formatEuroAmount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const [integer, decimals] = Math.abs(rounded).toFixed(2).split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const sign = rounded < 0 ? '-' : '';
  return `${sign}${grouped}${decimals === '00' ? '' : `,${decimals}`} €`;
}

/** "732829320" -> "732 829 320" ; "73282932000074" -> "732 829 320 00074" */
export function formatSirenOrSiret(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length === 9) return digits.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
  if (digits.length === 14) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, '$1 $2 $3 $4');
  }
  return (value ?? '').trim();
}

/** IBAN in groups of 4 characters, as printed on a RIB. */
export function formatIban(iban: string | null | undefined): string {
  const compact = (iban ?? '').replace(/\s+/g, '').toUpperCase();
  return compact.replace(/(.{4})(?=.)/g, '$1 ');
}
