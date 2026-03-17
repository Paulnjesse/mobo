// MOBO Theme — Lyft-inspired design system
export const colors = {
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
  // Legacy compat aliases
  gray: '#717171',
  lightGray: '#EBEBEB',
  border: '#EBEBEB',
  card: '#FFFFFF',
  accent: '#FF8C00',
  secondaryLight: 'rgba(255,0,191,0.1)',
  accentLight: 'rgba(255,140,0,0.15)',
  surgeBg: 'rgba(255,140,0,0.15)',
};

export const fonts = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
  sizes: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 24,
    xxxl: 32,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 28,
  round: 100,
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
  },
};

export const typography = {
  heroTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1A1A1A',
    letterSpacing: -0.5,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  body: {
    fontSize: 16,
    fontWeight: '400',
    color: '#1A1A1A',
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: '400',
    color: '#1A1A1A',
  },
  caption: {
    fontSize: 12,
    fontWeight: '400',
    color: '#717171',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#717171',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  price: {
    fontSize: 36,
    fontWeight: '800',
    color: '#1A1A1A',
    letterSpacing: -1,
  },
};

export default { colors, fonts, spacing, radius, shadows, typography };
