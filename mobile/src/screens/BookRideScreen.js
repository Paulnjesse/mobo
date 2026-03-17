import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../context/LanguageContext';
import { useRide } from '../context/RideContext';
import { locationService } from '../services/location';
import { colors, spacing, radius, shadows } from '../theme';

const RECENT_DESTINATIONS = [
  { id: '1', name: 'Yaoundé Centre Commercial', address: 'Av. Kennedy, Yaoundé' },
  { id: '2', name: 'Aéroport de Douala', address: 'Route de l\'Aéroport, Douala' },
  { id: '3', name: 'Université de Yaoundé I', address: 'Ngoa Ekele, Yaoundé' },
  { id: '4', name: 'Hôpital Central', address: 'Rue du Château, Yaoundé' },
  { id: '5', name: 'Marché Central Douala', address: 'Bd de la Liberté, Douala' },
];

export default function BookRideScreen({ navigation, route }) {
  const { t } = useLanguage();
  const { getFareEstimate } = useRide();

  const initialRideType = route.params?.initialRideType || 'standard';
  const initialDropoff = route.params?.dropoff || null;

  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState(initialDropoff?.name || '');
  const [pickupFocused, setPickupFocused] = useState(false);
  const [dropoffFocused, setDropoffFocused] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [loadingEstimate, setLoadingEstimate] = useState(false);

  const getCurrentLocation = async () => {
    setLoadingLocation(true);
    try {
      const loc = await locationService.getLocation();
      const address = await locationService.reverseGeocode(
        loc.coords.latitude,
        loc.coords.longitude
      );
      setPickup(address);
    } catch (err) {
      Alert.alert('Location Error', 'Could not get your current location.');
    } finally {
      setLoadingLocation(false);
    }
  };

  const handleSelectRecent = (dest) => {
    setDropoff(dest.name);
  };

  const handleContinue = async () => {
    if (!pickup.trim() || !dropoff.trim()) {
      Alert.alert('Missing Locations', t('locationRequired'));
      return;
    }
    setLoadingEstimate(true);
    try {
      const estimate = await getFareEstimate(
        { address: pickup },
        { address: dropoff },
        initialRideType
      );
      navigation.navigate('FareEstimate', {
        pickup,
        dropoff,
        rideType: initialRideType,
        estimate,
      });
    } catch (err) {
      navigation.navigate('FareEstimate', {
        pickup,
        dropoff,
        rideType: initialRideType,
        estimate: null,
      });
    } finally {
      setLoadingEstimate(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('bookRide')}</Text>
            <View style={styles.headerSpacer} />
          </View>

          {/* Input section — Lyft style with connecting dots */}
          <View style={styles.inputSection}>
            <View style={styles.dotsColumn}>
              <View style={styles.pickupDot} />
              <View style={styles.connectingLine} />
              <View style={styles.dropoffDot} />
            </View>
            <View style={styles.inputsColumn}>
              <View style={[styles.inputWrap, pickupFocused && styles.inputWrapFocused]}>
                <TextInput
                  style={styles.inputField}
                  placeholder={t('pickupLocation')}
                  placeholderTextColor={colors.textLight}
                  value={pickup}
                  onChangeText={setPickup}
                  onFocus={() => setPickupFocused(true)}
                  onBlur={() => setPickupFocused(false)}
                />
                {loadingLocation ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : !pickup ? (
                  <TouchableOpacity onPress={getCurrentLocation} activeOpacity={0.7}>
                    <Ionicons name="locate" size={18} color={colors.primary} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => setPickup('')} activeOpacity={0.7}>
                    <Ionicons name="close-circle" size={18} color={colors.gray400} />
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.inputGap} />
              <View style={[styles.inputWrap, dropoffFocused && styles.inputWrapFocused]}>
                <TextInput
                  style={styles.inputField}
                  placeholder={t('dropoffLocation')}
                  placeholderTextColor={colors.textLight}
                  value={dropoff}
                  onChangeText={setDropoff}
                  onFocus={() => setDropoffFocused(true)}
                  onBlur={() => setDropoffFocused(false)}
                  autoFocus={!!initialDropoff}
                />
                {dropoff ? (
                  <TouchableOpacity onPress={() => setDropoff('')} activeOpacity={0.7}>
                    <Ionicons name="close-circle" size={18} color={colors.gray400} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>

          {/* Current location shortcut */}
          {!pickup && (
            <TouchableOpacity
              style={styles.currentLocationRow}
              onPress={getCurrentLocation}
              activeOpacity={0.75}
            >
              <View style={styles.currentLocationIcon}>
                <Ionicons name="locate" size={18} color={colors.primary} />
              </View>
              <Text style={styles.currentLocationText}>{t('usingCurrentLocation')}</Text>
            </TouchableOpacity>
          )}

          {/* Recent destinations */}
          <ScrollView
            style={styles.listScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sectionLabel}>{t('recentDestinations')}</Text>
            {RECENT_DESTINATIONS.map((dest) => (
              <TouchableOpacity
                key={dest.id}
                style={styles.recentItem}
                onPress={() => handleSelectRecent(dest)}
                activeOpacity={0.75}
              >
                <View style={styles.recentIconWrap}>
                  <Ionicons name="time-outline" size={18} color={colors.gray500} />
                </View>
                <View style={styles.recentInfo}>
                  <Text style={styles.recentName}>{dest.name}</Text>
                  <Text style={styles.recentAddr}>{dest.address}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.gray300} />
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Continue / Fare Estimate button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.continueBtn,
                (!pickup || !dropoff) && styles.continueBtnDisabled,
              ]}
              onPress={handleContinue}
              disabled={!pickup || !dropoff || loadingEstimate}
              activeOpacity={0.88}
            >
              {loadingEstimate ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.continueBtnText}>{t('fareEstimate')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  headerSpacer: {
    width: 40,
  },
  inputSection: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  dotsColumn: {
    alignItems: 'center',
    paddingTop: 17,
    paddingBottom: 17,
    marginRight: spacing.md,
    width: 16,
  },
  pickupDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  connectingLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.gray300,
    marginVertical: 4,
    minHeight: 28,
  },
  dropoffDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: colors.text,
  },
  inputsColumn: {
    flex: 1,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 50,
  },
  inputWrapFocused: {
    backgroundColor: colors.gray200,
  },
  inputField: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: spacing.sm + 2,
  },
  inputGap: {
    height: spacing.sm,
  },
  currentLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  currentLocationIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,0,191,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentLocationText: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: '600',
  },
  listScroll: {
    flex: 1,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md - 2,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  recentIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentInfo: {
    flex: 1,
  },
  recentName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  recentAddr: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 1,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
  },
  continueBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  continueBtnDisabled: {
    backgroundColor: colors.gray300,
    shadowOpacity: 0,
    elevation: 0,
  },
  continueBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
  },
});
