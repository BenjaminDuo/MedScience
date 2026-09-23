import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Language = 'en' | 'zh';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (enText: string, zhText: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = 'medscience_desktop_lang';

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      // ?lang= wins over the stored choice, mirroring ?theme= in ThemeContext:
      // it makes a link open in a known language regardless of what this
      // browser last used, which is what documentation links and scripted
      // screenshot captures need.
      const param = new URLSearchParams(window.location.search).get('lang');
      if (param === 'en' || param === 'zh') return param;
      const saved = localStorage.getItem(STORAGE_KEY) as Language;
      if (saved === 'en' || saved === 'zh') {
        return saved;
      }
    }
    return 'zh';
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, lang);
      document.documentElement.lang = lang;
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'en' ? 'zh' : 'en');
  }, [language, setLanguage]);

  // Stable identity per language. `t` used to be recreated on every render,
  // so any hook or memo that (correctly) listed it as a dependency re-ran on
  // every render -- for a hook that fetches on mount, that is an endless
  // fetch loop, which is exactly what the group-chat page hit.
  const t = useCallback(
    (enText: string, zhText: string): string => (language === 'zh' ? zhText : enText),
    [language]
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  const value = useMemo(
    () => ({ language, setLanguage, toggleLanguage, t }),
    [language, setLanguage, toggleLanguage, t]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
