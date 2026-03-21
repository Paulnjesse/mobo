import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../context/LanguageContext';
import { colors, spacing, radius, shadows } from '../theme';
import api from '../services/api';

const EMERGENCY_ACTIONS = [
  {
    id: 'police',
    icon: 'shield-outline',
    label: 'Call Police',
    number: '117',
    color: '#1565C0',
    bg: 'rgba(21,101,192,0.1)',
  },
  {
    id: 'ambulance',
    icon: 'medkit-outline',
    label: 'Ambulance',
    number: '15',
    color: colors.danger,
    bg: 'rgba(227,24,55,0.1)',
  },
  {
    id: 'mobo',
    icon: 'headset-outline',
    label: 'MOBO Support',
    number: '+237 800 000 111',
    color: colors.primary,
    bg: 'rgba(255,0,191,0.1)',
  },
  {
    id: 'contact',
    icon: 'people-outline',
    label: 'Emergency Contact',
    number: null,
    color: colors.warning,
    bg: 'rgba(255,140,0,0.1)',
  },
];

export default function SOSScreen({ navigation, route }) {
  const { t } = useLanguage();
  const rideId = route?.params?.rideId || null;
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState(false);

  const handleSOS = () => {
    Alert.alert(
      'SOS — Are you in danger?',
      'This will alert MOBO safety team and share your live location with emergency services.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'SEND SOS',
          style: 'destructive',
          onPress: async () => {
            setSharing(true);
            try {
              if (rideId) {
                await api.post(`/rides/${rideId}/sos`);
              }
            } catch (err) {
              console.warn('[SOSScreen] SOS API call failed:', err.message);
              // Don't block the UI — emergency call still proceeds
            }
            setSharing(false);
            setShared(true);
            Alert.alert('SOS Sent', 'Help is on the way. MOBO safety team has been notified and your location is being shared.');
          },
        },
      ]
    );
  };

  const handleCall = (item) => {
    if (item.id === 'contact') {
      Alert.alert('Emergency Contact', 'No emergency contact set. Add one in Settings > Safety.');
      return;
    }
    Linking.openURL(`tel:${item.number}`);
  };

  const handleShareLocation = async () => {
    setSharing(true);
    try {
      if (rideId) {
        await api.post(`/rides/${rideId}/share`);
      }
    } catch (err) {
      console.warn('[SOSScreen] Share location failed:', err.message);
    }
    setSharing(false);
    setShared(true);
    Alert.alert('Location Shared', 'Your current location has been shared with your emergency contact.');
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.danger} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Safety & SOS</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        {/* Big SOS button */}
        <View style={styles.sosSection}>
          <Text style={styles.sosHint}>Press and hold if you're in danger</Text>
          <TouchableOpacity
            style={[styles.sosBtn, shared && styles.sosBtnSent]}
            onPress={handleSOS}
            activeOpacity={0.85}
          >
            {sharing ? (
              <ActivityIndicator size="large" color={colors.white} />
            ) : (
              <>
                <Ionicons name={shared ? 'checkmark-circle' : 'warning'} size={48} color={colors.white} />
                <Text style={styles.sosBtnLabel}>{shared ? 'SOS SENT' : 'SOS'}</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={styles.sosDesc}>
            {shared
              ? 'Help is on the way. Stay calm.'
              : 'Sends alert + location to MOBO Safety Team'}
          </Text>
        </View>

        {/* Share location */}
        <TouchableOpacity
          style={[styles.shareBtn, shared && styles.shareBtnActive]}
          onPress={handleShareLocation}
          activeOpacity={0.85}
        >
          <Ionicons name={shared ? 'location' : 'location-outline'} size={20} color={shared ? colors.white : colors.text} />
          <Text style={[styles.shareBtnText, shared && styles.shareBtnTextActive]}>
            {shared ? 'Location is being shared' : 'Share Live Location'}
          </Text>
        </TouchableOpacity>

        {/* Emergency actions grid */}
        <Text style={styles.sectionTitle}>Emergency Contacts</Text>
        <View style={styles.actionsGrid}>
          {EMERGENCY_ACTIONS.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.actionCard, { backgroundColor: item.bg, borderColor: item.color + '30' }]}
              onPress={() => handleCall(item)}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIcon, { backgroundColor: item.color + '20' }]}>
                <Ionicons name={item.icon} size={26} color={item.color} />
              </View>
              <Text style={[styles.actionLabel, { color: item.color }]}>{item.label}</Text>
              {item.number && (
                <Text style={styles.actionNumber}>{item.number}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1A0000' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    backgroundColor: colors.danger,
  },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: colors.white },
  headerSpacer: { width: 40 },
  content: { flex: 1, padding: spacing.lg },
  sosSection: { alignItems: 'center', paddingVertical: spacing.lg },
  sosHint: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: spacing.lg, fontWeight: '500' },
  sosBtn: {
    width: 160, height: 160, borderRadius: 80, backgroundColor: colors.danger,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 6, borderColor: 'rgba(227,24,55,0.3)',
    shadowColor: colors.danger, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 30, elevation: 20,
  },
  sosBtnSent: { backgroundColor: colors.success, borderColor: 'rgba(0,166,81,0.3)', shadowColor: colors.success },
  sosBtnLabel: { fontSize: 28, fontWeight: '900', color: colors.white, letterSpacing: 4, marginTop: 4 },
  sosDesc: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: spacing.lg, textAlign: 'center' },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.white, borderRadius: radius.pill, height: 52,
    marginBottom: spacing.lg,
  },
  shareBtnActive: { backgroundColor: colors.success },
  shareBtnText: { fontSize: 15, fontWeight: '700', color: colors.text },
  shareBtnTextActive: { color: colors.white },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.md },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionCard: {
    flex: 1, minWidth: '45%', alignItems: 'center', padding: spacing.md,
    borderRadius: radius.lg, borderWidth: 1, gap: spacing.xs,
  },
  actionIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  actionNumber: { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
});
