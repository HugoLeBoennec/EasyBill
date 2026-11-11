import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import fr from './locales/fr';
import type { Strings } from './locales/fr';
import en from './locales/en';

export type Locale = 'fr' | 'en';

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
