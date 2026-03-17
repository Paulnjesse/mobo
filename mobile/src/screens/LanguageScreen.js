import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../context/LanguageContext';
import { colors, spacing, radius, shadows } from '../theme';

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧', native: 'English' },
  { code: 'fr', name: 'Français', flag: '🇫🇷', native: 'French' },
  { code: 'sw', name: 'Kiswahili', flag: '🇹🇿', native: 'Swahili' },
];

export default function LanguageScreen({ navigation }) {
  const { language, changeLanguage, t } = useLanguage();
  const [selected, setSelected] = useState(language);

  const handleContinue = async () => {
    await changeLanguage(selected);
    navigation.navigate('Login');
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      <View style={styles.header}>
        <View style={styles.logoMark}>
          <Text style={styles.logoLetter}>M</Text>
        </View>
        <Text style={styles.title}>{t('chooseLanguage')}</Text>
        <Text style={styles.subtitle}>{t('languageSubtitle')}</Text>
      </View>

      <View style={styles.langList}>
        {LANGUAGES.map((lang) => {
          const isSelected = selected === lang.code;
          return (
            <TouchableOpacity
              key={lang.code}
              style={[styles.langCard, isSelected && styles.langCardSelected]}
              onPress={() => setSelected(lang.code)}
              activeOpacity={0.8}
            >
              <Text style={styles.flag}>{lang.flag}</Text>
              <View style={styles.langInfo}>
                <Text style={[styles.langName, isSelected && styles.langNameSelected]}>
                  {lang.name}
                </Text>
                <Text style={styles.langNative}>{lang.native}</Text>
              </View>
              <View style={[styles.radio, isSelected && styles.radioSelected]}>
                {isSelected && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.continueBtn}
          onPress={handleContinue}
          activeOpacity={0.88}
        >
          <Text style={styles.continueBtnText}>{t('continueBtn')}</Text>
          <Ionicons name="arrow-forward" size={20} color={colors.white} style={styles.continueBtnIcon} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  logoLetter: {
    fontSize: 34,
    fontWeight: '900',
    color: colors.white,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.xs,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  langList: {
    flex: 1,
    gap: spacing.sm,
  },
  langCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md + 4,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: spacing.md,
    ...shadows.sm,
  },
  langCardSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255,0,191,0.05)',
  },
  flag: {
    fontSize: 36,
  },
  langInfo: {
    flex: 1,
  },
  langName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  langNameSelected: {
    color: colors.primary,
  },
  langNative: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.gray300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  footer: {
    paddingVertical: spacing.lg,
  },
  continueBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  continueBtnText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
  continueBtnIcon: {
    marginLeft: spacing.sm,
  },
});
