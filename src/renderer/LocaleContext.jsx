import React from 'react';

export const LocaleContext = React.createContext('fr');

// eslint-disable-next-line react/prop-types
export const LocaleProvider = ({ children, locale }) => {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
};
