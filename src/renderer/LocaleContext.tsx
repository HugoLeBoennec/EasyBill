import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import fr from './locales/fr';
import type { Strings } from './locales/fr';
import en from './locales/en';

import { formatAmount, formatDate, formatDecimalInput, formatNumber, interpolate } from './i18n';
import type { Locale } from './i18n';

export type { Locale };

/**
 * Reduce a BCP 47 tag ("fr-FR", "en-US", ...) to a supported locale.
 * The app targets French freelancers: anything that is not English is French.
 */
export const normalizeLocale = (locale?: string | null): Locale =>
  (locale ?? '').toLowerCase().startsWith('en') ? 'en' : 'fr';

export const LocaleContext = createContext<Locale>('fr');

type LocaleProviderProps = {
  children: ReactNode;
  /** Any language tag, e.g. `navigator.language` */
  locale?: string | null;
};

export const LocaleProvider = ({ children, locale }: LocaleProviderProps) => {
  return (
    <LocaleContext.Provider value={normalizeLocale(locale)}>
      {children}
    </LocaleContext.Provider>
  );
};

/** Strings of the current locale (see ./locales). */
export const useStrings = (): Strings => {
  const locale = useContext(LocaleContext);
  return locale === 'en' ? en : fr;
};

/** Active locale code ('fr' | 'en'). */
export const useLocale = (): Locale => useContext(LocaleContext);

/**
 * Strings plus locale-bound helpers: `t` (strings), `fmt` (interpolation) and
 * the Intl formatters. Prefer this over formatting by hand in screens.
 */
export const useI18n = () => {
  const locale = useContext(LocaleContext);
  return useMemo(
    () => ({
      locale,
      t: locale === 'en' ? en : fr,
      fmt: interpolate,
      formatAmount: (cents: number) => formatAmount(cents, locale),
      formatDate: (date?: string | null) => formatDate(date, locale),
      formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
        formatNumber(value, locale, options),
      formatDecimalInput: (cents: number) => formatDecimalInput(cents, locale),
    }),
    [locale]
  );
};
