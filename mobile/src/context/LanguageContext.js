import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from '../locales/en';
import fr from '../locales/fr';
import sw from '../locales/sw';

const LANGUAGE_KEY = '@mobo_language';

const locales = { en, fr, sw };

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState('en');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    try {
      const saved = await AsyncStorage.getItem(LANGUAGE_KEY);
      if (saved && locales[saved]) {
        setLanguage(saved);
      }
    } catch (err) {
      console.warn('Failed to load language preference:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const changeLanguage = useCallback(async (lang) => {
    if (!locales[lang]) return;
    try {
      await AsyncStorage.setItem(LANGUAGE_KEY, lang);
      setLanguage(lang);
    } catch (err) {
      console.warn('Failed to save language preference:', err);
    }
  }, []);

  const t = useCallback(
    (key) => {
      const locale = locales[language] || locales.en;
      const keys = key.split('.');
      let value = locale;
      for (const k of keys) {
        if (value && typeof value === 'object') {
          value = value[k];
        } else {
          value = undefined;
          break;
        }
      }
      if (value === undefined) {
        const fallback = locales.en;
        let fbVal = fallback;
        for (const k of keys) {
          fbVal = fbVal?.[k];
        }
        return fbVal ?? key;
      }
      return value;
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, changeLanguage, t, isLoading }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
}
