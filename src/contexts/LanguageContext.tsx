'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppLanguage, Translations, getTranslations, getTextDirection } from '@/lib/translations';

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  t: Translations;
  dir: 'ltr' | 'rtl';
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

interface LanguageProviderProps {
  children: ReactNode;
  initialLanguage?: AppLanguage;
}

export function LanguageProvider({ children, initialLanguage = 'en' }: LanguageProviderProps) {
  const [language, setLanguageState] = useState<AppLanguage>(initialLanguage);
  const [t, setT] = useState<Translations>(getTranslations(initialLanguage));
  const [dir, setDir] = useState<'ltr' | 'rtl'>(getTextDirection(initialLanguage));

  // Update language
  const setLanguage = (lang: AppLanguage) => {
    setLanguageState(lang);
    setT(getTranslations(lang));
    setDir(getTextDirection(lang));

    // Update document direction for RTL support
    if (typeof document !== 'undefined') {
      document.documentElement.dir = getTextDirection(lang);
      document.documentElement.lang = lang;
    }
  };

  // Sync document direction on mount and language change (external system update only)
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = getTextDirection(language);
      document.documentElement.lang = language;
    }
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, dir }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

// Hook to get just translations (for components that don't need to change language)
export function useTranslations(): Translations {
  const { t } = useLanguage();
  return t;
}
