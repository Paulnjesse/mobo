import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  StatusBar,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { colors, spacing, radius, shadows } from '../theme';
import api from '../services/api';

export default function SettingsScreen({ navigation }) {
  const { logout, user } = useAuth();
  const { t, language, changeLanguage } = useLanguage();

  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [locationAlways, setLocationAlways] = useState(false);
  const [businessProfile, setBusinessProfile] = useState(user?.business_profile_enabled || false);

  const handleBusinessProfileToggle = async (value) => {
    setBusinessProfile(value);
    try {
      await api.put('/users/profile', { business_profile_enabled: value });
    } catch (err) {
      // Revert on failure
      setBusinessProfile(!value);
      Alert.alert('Error', 'Could not update Business Profile. Please try again.');
    }
  };

  const SECTIONS = [
    {
      title: 'Account',
      items: [
        {
          icon: 'person-outline', label: 'Edit Profile', color: colors.primary,
          onPress: () => {},
        },
        {
          icon: 'lock-closed-outline', label: 'Change Password', color: colors.text,
          onPress: () => Alert.alert('Change Password', 'Password reset link will be sent to your email.'),
        },
        {
          icon: 'language-outline', label: 'Language', color: colors.primary,
          value: language?.toUpperCase() || 'EN',
          onPress: () => navigation.navigate('Language'),
        },
        {
          icon: 'briefcase-outline', label: 'Business Profile', color: colors.text,
          toggle: true, value: businessProfile, onToggle: handleBusinessProfileToggle,
        },
      ],
    },
    {
      title: 'Features',
      items: [
        ...(user?.role === 'driver' ? [{
          icon: 'home', label: 'My Home Location', color: '#3B82F6',
          value: user?.driver?.home_address ? 'Set' : 'Not set',
          onPress: () => navigation.navigate('HomeLocation', { isOnboarding: false }),
        }] : []),
        {
          icon: 'female-outline', label: 'Women+ Connect', color: colors.primary,
          onPress: () => navigation.navigate('WomenConnect'),
        },
        {
          icon: 'people-outline', label: 'Preferred Drivers', color: colors.text,
          onPress: () => navigation.navigate('PreferredDrivers'),
        },
        {
          icon: 'home-outline', label: 'Family Account', color: colors.text,
          onPress: () => navigation.navigate('FamilyAccount'),
        },
        {
          icon: 'gift-outline', label: 'Refer a Friend', color: colors.success,
          onPress: () => navigation.navigate('Referral'),
        },
        {
          icon: 'search-outline', label: 'Lost & Found', color: colors.warning,
          onPress: () => navigation.navigate('LostAndFound'),
        },
      ],
    },
    {
      title: 'Notifications',
      items: [
        {
          icon: 'notifications-outline', label: 'Push Notifications', color: colors.warning,
          toggle: true, value: pushEnabled, onToggle: setPushEnabled,
        },
        {
          icon: 'mail-outline', label: 'Email Updates', color: colors.text,
          toggle: true, value: emailEnabled, onToggle: setEmailEnabled,
        },
      ],
    },
    {
      title: 'Privacy & Safety',
      items: [
        {
          icon: 'location-outline', label: 'Always On Location', color: colors.success,
          toggle: true, value: locationAlways, onToggle: setLocationAlways,
        },
        {
          icon: 'shield-outline', label: 'Privacy Policy', color: colors.text,
          onPress: () => Linking.openURL('https://mobo.app/privacy'),
        },
        {
          icon: 'document-text-outline', label: 'Terms of Service', color: colors.text,
          onPress: () => Linking.openURL('https://mobo.app/terms'),
        },
      ],
    },
    {
      title: 'Support',
      items: [
        {
          icon: 'help-circle-outline', label: 'Help Center', color: colors.text,
          onPress: () => Linking.openURL('https://mobo.app/help'),
        },
        {
          icon: 'star-outline', label: 'Rate the App', color: colors.warning,
          onPress: () => Alert.alert('Rate MOBO', 'Thank you for using MOBO!'),
        },
        {
          icon: 'chatbubble-outline', label: 'Contact Support', color: colors.primary,
          onPress: () => navigation.navigate('Messages'),
        },
      ],
    },
    {
      title: 'Danger Zone',
      items: [
        {
          icon: 'trash-outline', label: 'Delete Account', color: colors.danger,
          onPress: () => Alert.alert('Delete Account', 'This action is permanent and cannot be undone. All your data will be erased.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => {} },
          ]),
        },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('settings')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {SECTIONS.map((section, sIdx) => (
          <View key={sIdx} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionCard}>
              {section.items.map((item, iIdx) => (
                <TouchableOpacity
                  key={iIdx}
                  style={[styles.row, iIdx < section.items.length - 1 && styles.rowBorder]}
                  onPress={item.onPress}
                  activeOpacity={item.toggle ? 1 : 0.7}
                  disabled={item.toggle && !item.onPress}
                >
                  <View style={[styles.iconWrap, { backgroundColor: item.color + '15' }]}>
                    <Ionicons name={item.icon} size={20} color={item.color} />
                  </View>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  {item.toggle ? (
                    <Switch
                      value={item.value}
                      onValueChange={item.onToggle}
                      trackColor={{ false: colors.gray200, true: colors.primary + '60' }}
                      thumbColor={item.value ? colors.primary : colors.white}
                      ios_backgroundColor={colors.gray200}
                    />
                  ) : item.value ? (
                    <Text style={styles.rowValue}>{item.value}</Text>
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color={colors.gray300} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* App version */}
        <Text style={styles.version}>MOBO v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray200,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.text },
  headerSpacer: { width: 40 },
  scroll: { paddingBottom: 40 },
  section: { marginTop: spacing.md, paddingHorizontal: spacing.md },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.sm, marginLeft: spacing.xs },
  sectionCard: { backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden', ...shadows.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md - 2,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.gray200 },
  iconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.text },
  rowValue: { fontSize: 13, fontWeight: '600', color: colors.primary },
  version: { textAlign: 'center', fontSize: 12, color: colors.textLight, paddingVertical: spacing.xl },
});
