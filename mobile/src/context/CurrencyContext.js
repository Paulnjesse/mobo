/**
 * CurrencyContext — multi-currency support for African markets.
 * Provides formatAmount(), currency symbol, and country selection.
 * Persists preference via AsyncStorage.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CURRENCY_KEY = '@mobo_currency_country';

export const AFRICAN_COUNTRIES = [
  { code: 'CM', name: 'Cameroon',          currency: 'XAF', symbol: 'FCFA', flag: '🇨🇲', locale: 'fr-CM' },
  { code: 'NG', name: 'Nigeria',           currency: 'NGN', symbol: '₦',    flag: '🇳🇬', locale: 'en-NG' },
  { code: 'KE', name: 'Kenya',             currency: 'KES', symbol: 'KSh',  flag: '🇰🇪', locale: 'en-KE' },
  { code: 'GH', name: 'Ghana',             currency: 'GHS', symbol: 'GH₵',  flag: '🇬🇭', locale: 'en-GH' },
  { code: 'SN', name: 'Senegal',           currency: 'XOF', symbol: 'FCFA', flag: '🇸🇳', locale: 'fr-SN' },
  { code: 'CI', name: "Côte d'Ivoire",    currency: 'XOF', symbol: 'FCFA', flag: '🇨🇮', locale: 'fr-CI' },
  { code: 'TZ', name: 'Tanzania',          currency: 'TZS', symbol: 'TSh',  flag: '🇹🇿', locale: 'en-TZ' },
  { code: 'UG', name: 'Uganda',            currency: 'UGX', symbol: 'USh',  flag: '🇺🇬', locale: 'en-UG' },
  { code: 'ZA', name: 'South Africa',      currency: 'ZAR', symbol: 'R',    flag: '🇿🇦', locale: 'en-ZA' },
  { code: 'EG', name: 'Egypt',             currency: 'EGP', symbol: 'E£',   flag: '🇪🇬', locale: 'ar-EG' },
  { code: 'MA', name: 'Morocco',           currency: 'MAD', symbol: 'MAD',  flag: '🇲🇦', locale: 'fr-MA' },
  { code: 'ET', name: 'Ethiopia',          currency: 'ETB', symbol: 'Br',   flag: '🇪🇹', locale: 'en-ET' },
  { code: 'RW', name: 'Rwanda',            currency: 'RWF', symbol: 'FRw',  flag: '🇷🇼', locale: 'en-RW' },
  { code: 'TN', name: 'Tunisia',           currency: 'TND', symbol: 'DT',   flag: '🇹🇳', locale: 'fr-TN' },
  { code: 'MG', name: 'Madagascar',        currency: 'MGA', symbol: 'Ar',   flag: '🇲🇬', locale: 'fr-MG' },
  { code: 'ML', name: 'Mali',              currency: 'XOF', symbol: 'FCFA', flag: '🇲🇱', locale: 'fr-ML' },
  { code: 'BJ', name: 'Benin',             currency: 'XOF', symbol: 'FCFA', flag: '🇧🇯', locale: 'fr-BJ' },
  { code: 'GA', name: 'Gabon',             currency: 'XAF', symbol: 'FCFA', flag: '🇬🇦', locale: 'fr-GA' },
  { code: 'CG', name: 'Congo (Brazzaville)', currency: 'XAF', symbol: 'FCFA', flag: '🇨🇬', locale: 'fr-CG' },
  { code: 'TD', name: 'Chad',              currency: 'XAF', symbol: 'FCFA', flag: '🇹🇩', locale: 'fr-TD' },
];

const DEFAULT_COUNTRY = AFRICAN_COUNTRIES[0]; // Cameroon / XAF

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const [country, setCountry] = useState(DEFAULT_COUNTRY);

  useEffect(() => {
    AsyncStorage.getItem(CURRENCY_KEY).then((saved) => {
      if (saved) {
        const found = AFRICAN_COUNTRIES.find((c) => c.code === saved);
        if (found) setCountry(found);
      }
    });
  }, []);

  const changeCountry = useCallback(async (countryCode) => {
    const found = AFRICAN_COUNTRIES.find((c) => c.code === countryCode);
    if (!found) return;
    setCountry(found);
    await AsyncStorage.setItem(CURRENCY_KEY, countryCode);
  }, []);

  /**
   * Format a numeric amount using the active country's currency.
   * e.g. formatAmount(5000) → "5,000 FCFA"  (CM)
   *                         → "₦5,000"       (NG)
   *                         → "KSh 5,000"    (KE)
   */
  const formatAmount = useCallback(
    (amount) => {
      if (amount === null || amount === undefined) return '–';
      const num = Math.round(Number(amount));
      const formatted = num.toLocaleString('en');
      const { symbol, currency } = country;
      // Prefix symbols
      if (['₦', 'GH₵', 'R', 'E£', 'Br'].includes(symbol)) return `${symbol}${formatted}`;
      // Suffix symbols (XAF, XOF, KES, TZS, UGX, MAD, TND, RWF, MGA)
      return `${formatted} ${symbol}`;
    },
    [country]
  );

  /**
   * Raw currency code string, e.g. "XAF", "NGN"
   */
  const currencyCode = country.currency;

  return (
    <CurrencyContext.Provider value={{ country, changeCountry, formatAmount, currencyCode, countries: AFRICAN_COUNTRIES }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used inside CurrencyProvider');
  return ctx;
}
