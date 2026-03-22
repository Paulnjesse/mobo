/**
 * MOBO ThemeContext
 * Provides dynamic light/dark colors based on system color scheme.
 * Screens that opt-in: const { colors } = useTheme()
 * Screens using static import { colors } from '../theme' still work in light mode.
 */
import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

// ── Light palette ────────────────────────────────────────────────────────────
export const lightColors = {
  primary: '#FF00BF',
  primaryDark: '#CC0099',
  primaryLight: '#FF66D9',
  secondary: '#1A1A1A',
  background: '#FFFFFF',
  surface: '#F6F6F6',
  mapBackground: '#E8E8E8',
  white: '#FFFFFF',
  black: '#1A1A1A',
  gray100: '#F6F6F6',
  gray200: '#EBEBEB',
  gray300: '#D4D4D4',
  gray400: '#A0A0A0',
  gray500: '#717171',
  gray600: '#484848',
  text: '#1A1A1A',
  textSecondary: '#717171',
  textLight: '#A0A0A0',
  success: '#00A651',
  danger: '#E31837',
  warning: '#FF8C00',
  surge: '#FF8C00',
  online: '#00A651',
  offline: '#A0A0A0',
  cardBorder: '#EBEBEB',
  inputBorder: '#D4D4D4',
  shadow: 'rgba(0,0,0,0.08)',
  overlay: 'rgba(0,0,0,0.5)',
  gray: '#717171',
  lightGray: '#EBEBEB',
  border: '#EBEBEB',
  card: '#FFFFFF',
  accent: '#FF8C00',
  secondaryLight: 'rgba(255,0,191,0.1)',
  accentLight: 'rgba(255,140,0,0.15)',
  surgeBg: 'rgba(255,140,0,0.15)',
};

// ── Dark palette ─────────────────────────────────────────────────────────────
export const darkColors = {
  primary: '#FF00BF',
  primaryDark: '#CC0099',
  primaryLight: '#FF66D9',
  secondary: '#E5E5E5',
  background: '#0F0F0F',
  surface: '#1C1C1E',
  mapBackground: '#2C2C2E',
  white: '#1C1C1E',      // cards / sheets use dark surface instead of white
  black: '#FFFFFF',
  gray100: '#1C1C1E',
  gray200: '#2C2C2E',
  gray300: '#3A3A3C',
  gray400: '#636366',
  gray500: '#8E8E93',
  gray600: '#AEAEB2',
  text: '#FFFFFF',
  textSecondary: '#8E8E93',
  textLight: '#636366',
  success: '#30D158',
  danger: '#FF453A',
  warning: '#FF9F0A',
  surge: '#FF9F0A',
  online: '#30D158',
  offline: '#636366',
  cardBorder: '#2C2C2E',
  inputBorder: '#3A3A3C',
  shadow: 'rgba(0,0,0,0.4)',
  overlay: 'rgba(0,0,0,0.7)',
  gray: '#8E8E93',
  lightGray: '#2C2C2E',
  border: '#2C2C2E',
  card: '#1C1C1E',
  accent: '#FF9F0A',
  secondaryLight: 'rgba(255,0,191,0.15)',
  accentLight: 'rgba(255,159,10,0.2)',
  surgeBg: 'rgba(255,159,10,0.2)',
};

const ThemeContext = createContext({ colors: lightColors, isDark: false });

export function ThemeProvider({ children }) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const value = useMemo(() => ({
    colors: isDark ? darkColors : lightColors,
    isDark,
  }), [isDark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

// Default export for convenience
export default ThemeContext;
