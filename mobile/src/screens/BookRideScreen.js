import React, { useState, useCallback, useRef } from 'react';
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
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../context/LanguageContext';
import { useRide } from '../context/RideContext';
import { locationService } from '../services/location';
import { searchPlaces, getPlaceDetails, getDirections } from '../services/maps';
import { colors, spacing, radius, shadows } from '../theme';

// Decode a Google Maps encoded polyline string into an array of { latitude, longitude }
function decodePolyline(encoded) {
  if (!encoded) return [];
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let b;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

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
  const mapRef = useRef(null);

  const initialRideType = route.params?.initialRideType || 'standard';
  const initialDropoff = route.params?.dropoff || null;

  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState(initialDropoff?.name || '');
  const [pickupFocused, setPickupFocused] = useState(false);
  const [dropoffFocused, setDropoffFocused] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [loadingEstimate, setLoadingEstimate] = useState(false);

  // Coordinates for selected locations
  const [pickupCoords, setPickupCoords] = useState(null);
  const [dropoffCoords, setDropoffCoords] = useState(
    initialDropoff?.coords
      ? { latitude: initialDropoff.coords.latitude, longitude: initialDropoff.coords.longitude }
      : null
  );

  // Google Places autocomplete
  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [dropoffSuggestions, setDropoffSuggestions] = useState([]);
  const pickupDebounce = useRef(null);
  const dropoffDebounce = useRef(null);

  // Map route preview
  const [routeCoords, setRouteCoords] = useState([]);
  const [showMapPreview, setShowMapPreview] = useState(false);

  // ---------------------------------------------------------------------------
  // Current location
  // ---------------------------------------------------------------------------
  const getCurrentLocation = async () => {
    setLoadingLocation(true);
    try {
      const loc = await locationService.getLocation();
      const address = await locationService.reverseGeocode(
        loc.coords.latitude,
        loc.coords.longitude
      );
      setPickup(address || 'Current Location');
      setPickupCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      setPickupSuggestions([]);
    } catch (err) {
      Alert.alert('Location Error', 'Could not get your current location.');
    } finally {
      setLoadingLocation(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Places autocomplete handlers
  // ---------------------------------------------------------------------------
  const handlePickupChange = useCallback((text) => {
    setPickup(text);
    setPickupCoords(null);
    setRouteCoords([]);
    setShowMapPreview(false);
    if (pickupDebounce.current) clearTimeout(pickupDebounce.current);
    if (!text || text.length < 2) { setPickupSuggestions([]); return; }
    pickupDebounce.current = setTimeout(async () => {
      const results = await searchPlaces(text, pickupCoords || dropoffCoords
        ? { lat: (pickupCoords || dropoffCoords).latitude, lng: (pickupCoords || dropoffCoords).longitude }
        : null
      );
      setPickupSuggestions(results);
    }, 350);
  }, [pickupCoords, dropoffCoords]);

  const handleDropoffChange = useCallback((text) => {
    setDropoff(text);
    setDropoffCoords(null);
    setRouteCoords([]);
    setShowMapPreview(false);
    if (dropoffDebounce.current) clearTimeout(dropoffDebounce.current);
    if (!text || text.length < 2) { setDropoffSuggestions([]); return; }
    dropoffDebounce.current = setTimeout(async () => {
      const results = await searchPlaces(text, pickupCoords
        ? { lat: pickupCoords.latitude, lng: pickupCoords.longitude }
        : null
      );
      setDropoffSuggestions(results);
    }, 350);
  }, [pickupCoords]);

  const selectPickupPlace = async (place) => {
    setPickup(place.description);
    setPickupSuggestions([]);
    const details = await getPlaceDetails(place.placeId);
    if (details) {
      const coords = { latitude: details.lat, longitude: details.lng };
      setPickupCoords(coords);
      await tryFetchRoute(coords, dropoffCoords);
    }
  };

  const selectDropoffPlace = async (place) => {
    setDropoff(place.description);
    setDropoffSuggestions([]);
    const details = await getPlaceDetails(place.placeId);
    if (details) {
      const coords = { latitude: details.lat, longitude: details.lng };
      setDropoffCoords(coords);
      await tryFetchRoute(pickupCoords, coords);
    }
  };

  // ---------------------------------------------------------------------------
  // Fetch route preview once both coords are known
  // ---------------------------------------------------------------------------
  const tryFetchRoute = async (pCoords, dCoords) => {
    if (!pCoords || !dCoords) return;
    try {
      const result = await getDirections(
        { lat: pCoords.latitude, lng: pCoords.longitude },
        { lat: dCoords.latitude, lng: dCoords.longitude }
      );
      if (result.polyline) {
        const decoded = decodePolyline(result.polyline);
        setRouteCoords(decoded);
        setShowMapPreview(true);
        setTimeout(() => {
          if (mapRef.current && decoded.length > 1) {
            mapRef.current.fitToCoordinates(decoded, {
              edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
              animated: true,
            });
          }
        }, 300);
      } else {
        setShowMapPreview(true);
      }
    } catch (err) {
      console.warn('[BookRide] Route preview failed:', err.message);
      setShowMapPreview(true);
    }
  };

  // ---------------------------------------------------------------------------
  // Recent destinations
  // ---------------------------------------------------------------------------
  const handleSelectRecent = (dest) => {
    setDropoff(dest.name);
    setDropoffSuggestions([]);
    // If coords provided (e.g. from initialDropoff)
    if (dest.coords) {
      const coords = { latitude: dest.coords.latitude, longitude: dest.coords.longitude };
      setDropoffCoords(coords);
      tryFetchRoute(pickupCoords, coords);
    }
  };

  // ---------------------------------------------------------------------------
  // Continue → FareEstimate
  // ---------------------------------------------------------------------------
  const handleContinue = async () => {
    if (!pickup.trim() || !dropoff.trim()) {
      Alert.alert('Missing Locations', t('locationRequired'));
      return;
    }
    setLoadingEstimate(true);
    try {
      const estimate = await getFareEstimate(
        { address: pickup, coords: pickupCoords },
        { address: dropoff, coords: dropoffCoords },
        initialRideType
      );
      navigation.navigate('FareEstimate', {
        pickup,
        dropoff,
        pickupCoords,
        dropoffCoords,
        rideType: initialRideType,
        estimate,
        routePolyline: routeCoords.length > 0 ? routeCoords : null,
      });
    } catch (err) {
      navigation.navigate('FareEstimate', {
        pickup,
        dropoff,
        pickupCoords,
        dropoffCoords,
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
              {/* Pickup input with Google Places autocomplete */}
              <View style={[styles.inputWrap, pickupFocused && styles.inputWrapFocused]}>
                <TextInput
                  style={styles.inputField}
                  placeholder={t('pickupLocation')}
                  placeholderTextColor={colors.textLight}
                  value={pickup}
                  onChangeText={handlePickupChange}
                  onFocus={() => setPickupFocused(true)}
                  onBlur={() => setTimeout(() => setPickupFocused(false), 200)}
                />
                {loadingLocation ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : !pickup ? (
                  <TouchableOpacity onPress={getCurrentLocation} activeOpacity={0.7}>
                    <Ionicons name="locate" size={18} color={colors.primary} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => { setPickup(''); setPickupCoords(null); setPickupSuggestions([]); setRouteCoords([]); setShowMapPreview(false); }} activeOpacity={0.7}>
                    <Ionicons name="close-circle" size={18} color={colors.gray400} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Pickup autocomplete dropdown */}
              {pickupFocused && pickupSuggestions.length > 0 && (
                <View style={styles.suggestionsDropdown}>
                  <FlatList
                    data={pickupSuggestions}
                    keyExtractor={(item) => item.placeId}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={styles.suggestionItem}
                        onPress={() => selectPickupPlace(item)}
                        activeOpacity={0.75}
                      >
                        <Ionicons name="location-outline" size={14} color={colors.primary} style={{ marginRight: 8 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.suggestionMain} numberOfLines={1}>{item.mainText}</Text>
                          {item.secondaryText ? <Text style={styles.suggestionSub} numberOfLines={1}>{item.secondaryText}</Text> : null}
                        </View>
                      </TouchableOpacity>
                    )}
                  />
                </View>
              )}

              <View style={styles.inputGap} />

              {/* Dropoff input with Google Places autocomplete */}
              <View style={[styles.inputWrap, dropoffFocused && styles.inputWrapFocused]}>
                <TextInput
                  style={styles.inputField}
                  placeholder={t('dropoffLocation')}
                  placeholderTextColor={colors.textLight}
                  value={dropoff}
                  onChangeText={handleDropoffChange}
                  onFocus={() => setDropoffFocused(true)}
                  onBlur={() => setTimeout(() => setDropoffFocused(false), 200)}
                  autoFocus={!!initialDropoff}
                />
                {dropoff ? (
                  <TouchableOpacity onPress={() => { setDropoff(''); setDropoffCoords(null); setDropoffSuggestions([]); setRouteCoords([]); setShowMapPreview(false); }} activeOpacity={0.7}>
                    <Ionicons name="close-circle" size={18} color={colors.gray400} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Dropoff autocomplete dropdown */}
              {dropoffFocused && dropoffSuggestions.length > 0 && (
                <View style={styles.suggestionsDropdown}>
                  <FlatList
                    data={dropoffSuggestions}
                    keyExtractor={(item) => item.placeId}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={styles.suggestionItem}
                        onPress={() => selectDropoffPlace(item)}
                        activeOpacity={0.75}
                      >
                        <Ionicons name="location-outline" size={14} color={colors.text} style={{ marginRight: 8 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.suggestionMain} numberOfLines={1}>{item.mainText}</Text>
                          {item.secondaryText ? <Text style={styles.suggestionSub} numberOfLines={1}>{item.secondaryText}</Text> : null}
                        </View>
                      </TouchableOpacity>
                    )}
                  />
                </View>
              )}
            </View>
          </View>

          {/* Map preview of route — shown after both locations selected */}
          {showMapPreview && pickupCoords && dropoffCoords && (
            <View style={styles.mapPreviewContainer}>
              <MapView
                ref={mapRef}
                style={styles.mapPreview}
                provider={PROVIDER_GOOGLE}
                initialRegion={{
                  latitude: (pickupCoords.latitude + dropoffCoords.latitude) / 2,
                  longitude: (pickupCoords.longitude + dropoffCoords.longitude) / 2,
                  latitudeDelta: Math.abs(pickupCoords.latitude - dropoffCoords.latitude) * 2.5 + 0.01,
                  longitudeDelta: Math.abs(pickupCoords.longitude - dropoffCoords.longitude) * 2.5 + 0.01,
                }}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
              >
                {routeCoords.length > 1 && (
                  <Polyline
                    coordinates={routeCoords}
                    strokeWidth={3}
                    strokeColor={colors.primary}
                  />
                )}
                <Marker coordinate={pickupCoords} title="Pickup">
                  <View style={styles.mapPickupDot} />
                </Marker>
                <Marker coordinate={dropoffCoords} title="Dropoff">
                  <View style={styles.mapDropoffDot}>
                    <Ionicons name="location" size={16} color={colors.white} />
                  </View>
                </Marker>
              </MapView>
            </View>
          )}

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
  suggestionsDropdown: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    marginTop: 4,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: colors.gray200,
    ...shadows.md,
    overflow: 'hidden',
    zIndex: 100,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  suggestionMain: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  suggestionSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  mapPreviewContainer: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.gray200,
    ...shadows.sm,
  },
  mapPreview: {
    height: 160,
    width: '100%',
  },
  mapPickupDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.white,
  },
  mapDropoffDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
