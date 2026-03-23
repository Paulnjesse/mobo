import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
  StatusBar,
  TextInput,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useRide } from '../context/RideContext';
import { locationService } from '../services/location';
import { searchPlaces, getPlaceDetails } from '../services/maps';
import { colors, spacing, radius, shadows } from '../theme';
import AdBanner from '../components/AdBanner';

const { height, width } = Dimensions.get('window');

const RIDE_TYPES = [
  { id: 'standard', label: 'Standard', icon: 'car-outline', eta: '3 min', price: '1,200 XAF' },
  { id: 'comfort', label: 'Comfort', icon: 'car-sport-outline', eta: '5 min', price: '2,000 XAF' },
  { id: 'luxury', label: 'Luxury', icon: 'diamond-outline', eta: '8 min', price: '3,500 XAF' },
  { id: 'shared', label: 'Shared', icon: 'people-outline', eta: '4 min', price: '700 XAF' },
  { id: 'delivery', label: 'Delivery', icon: 'cube-outline', eta: '6 min', price: '1,500 XAF' },
  { id: 'rental', label: 'Rental', icon: 'time-outline', eta: 'By hour', price: 'From 8k' },
  { id: 'outstation', label: 'Outstation', icon: 'map-outline', eta: 'Intercity', price: 'From 25k' },
  { id: 'airport_transfer', label: 'Airport', icon: 'airplane-outline', eta: 'Pre-book', price: 'From 15k' },
  { id: 'wav', label: 'Accessible', icon: 'accessibility-outline', eta: '8 min', price: '1,500 XAF' },
  { id: 'ev', label: 'Green', icon: 'leaf-outline', eta: '6 min', price: '1,400 XAF' },
  { id: 'moto', label: 'Benskin', icon: 'bicycle-outline', eta: '2 min', price: '500 XAF' },
  { id: 'xl', label: 'XL Group', icon: 'bus-outline', eta: '6 min', price: '2,500 XAF' },
];

const RECENT_DESTINATIONS = [
  { id: '1', name: 'Yaoundé Centre Commercial', address: 'Av. Kennedy, Yaoundé' },
  { id: '2', name: 'Aéroport de Douala', address: 'Route de l\'Aéroport, Douala' },
  { id: '3', name: 'Université de Yaoundé I', address: 'Ngoa Ekele, Yaoundé' },
];

function getGreeting(t) {
  const h = new Date().getHours();
  if (h < 12) return t('goodMorning');
  if (h < 17) return t('goodAfternoon');
  return t('goodEvening');
}

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { nearbyDrivers, surgeInfo, getNearbyDrivers, getSurgeInfo } = useRide();
  const insets = useSafeAreaInsets();

  const [location, setLocation] = useState(null);
  const [selectedType, setSelectedType] = useState('standard');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchDebounce, setSearchDebounce] = useState(null);
  const mapRef = useRef(null);

  const firstName = user?.name?.split(' ')[0] || 'there';

  const initLocation = useCallback(async () => {
    try {
      const loc = await locationService.getLocation();
      setLocation(loc.coords);
      await Promise.all([
        getNearbyDrivers(loc.coords.latitude, loc.coords.longitude, selectedType),
        getSurgeInfo(loc.coords.latitude, loc.coords.longitude),
      ]);
    } catch (err) {
      console.warn('Location init failed:', err);
    }
  }, [selectedType, getNearbyDrivers, getSurgeInfo]);

  useEffect(() => {
    initLocation();
  }, []);

  // Google Places autocomplete with debounce
  const handleSearchChange = useCallback((text) => {
    setSearchQuery(text);
    if (searchDebounce) clearTimeout(searchDebounce);
    if (!text || text.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const bias = location
        ? { lat: location.latitude, lng: location.longitude }
        : null;
      const results = await searchPlaces(text, bias);
      setSearchResults(results);
    }, 350);
    setSearchDebounce(timer);
  }, [location, searchDebounce]);

  const handlePlaceSelect = async (place) => {
    setSearchQuery(place.description);
    setSearchResults([]);
    setSearchFocused(false);

    // Delivery ride type goes straight to DeliveryBookingScreen
    if (selectedType === 'delivery') {
      navigation.navigate('DeliveryBooking');
      setSearchQuery('');
      return;
    }
    if (selectedType === 'rental') {
      navigation.navigate('RentalRide', {
        pickup: location ? { lat: location.latitude, lng: location.longitude } : null,
      });
      setSearchQuery('');
      return;
    }

    // Navigate to BookRide with the selected destination
    const details = await getPlaceDetails(place.placeId);
    navigation.navigate('BookRide', {
      initialRideType: selectedType,
      dropoff: {
        name: place.mainText,
        address: place.description,
        coords: details ? { latitude: details.lat, longitude: details.lng } : null,
      },
    });
    setSearchQuery('');
  };

  const handleBookRide = () => {
    if (selectedType === 'delivery') {
      navigation.navigate('DeliveryBooking');
      return;
    }
    if (selectedType === 'rental') {
      navigation.navigate('RentalRide', {
        pickup: location ? { lat: location.latitude, lng: location.longitude } : null,
      });
      return;
    }
    if (selectedType === 'outstation') {
      navigation.navigate('OutstationRide');
      return;
    }
    navigation.navigate('BookRide', { initialRideType: selectedType });
  };

  const handleDestinationPress = (dest) => {
    if (selectedType === 'delivery') {
      navigation.navigate('DeliveryBooking');
      return;
    }
    navigation.navigate('BookRide', { initialRideType: selectedType, dropoff: dest });
  };

  const mapRegion = location
    ? {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.018,
        longitudeDelta: 0.018,
      }
    : {
        latitude: 3.848,
        longitude: 11.502,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };

  const BOTTOM_SHEET_HEIGHT = height * 0.44;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Full-screen map — Google Maps provider for better African city maps + traffic */}
      <MapView
        testID="home-map-view"
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        region={mapRegion}
        showsUserLocation
        showsMyLocationButton={false}
        showsTraffic
        customMapStyle={[]}
      >
        {nearbyDrivers.map((driver, idx) => (
          <Marker
            key={driver._id || driver.id || idx}
            coordinate={{
              latitude: driver.location?.latitude || driver.location?.lat || driver.lat || mapRegion.latitude + (Math.random() - 0.5) * 0.01,
              longitude: driver.location?.longitude || driver.location?.lng || driver.lng || mapRegion.longitude + (Math.random() - 0.5) * 0.01,
            }}
            title={driver.name || driver.full_name}
          >
            <View style={styles.driverMarker}>
              <Ionicons name="car" size={13} color={colors.white} />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Surge badge overlay on map */}
      {surgeInfo?.multiplier > 1 && (
        <View style={[styles.surgeBadge, { top: insets.top + 64 }]}>
          <Ionicons name="flash" size={13} color={colors.white} />
          <Text style={styles.surgeBadgeText}>{surgeInfo.multiplier.toFixed(1)}x surge</Text>
        </View>
      )}

      {/* Top overlay — hamburger + avatar */}
      <View style={[styles.topBar, { top: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.topBarBtn}
          onPress={() => navigation.openDrawer?.() || navigation.navigate('Settings')}
          activeOpacity={0.8}
        >
          <Ionicons name="menu" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.driverCountRow}>
          <View style={styles.onlineDot} />
          <Text style={styles.driverCountText}>{nearbyDrivers.length} {t('nearbyDrivers')}</Text>
        </View>

        <TouchableOpacity
          style={styles.avatarBtn}
          onPress={() => navigation.navigate('Profile')}
          activeOpacity={0.8}
        >
          <Text style={styles.avatarLetter}>{firstName.charAt(0).toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      {/* My location button */}
      <TouchableOpacity
        style={[styles.myLocationBtn, { bottom: BOTTOM_SHEET_HEIGHT + 12 }]}
        onPress={() => {
          if (location) {
            mapRef.current?.animateToRegion({
              latitude: location.latitude,
              longitude: location.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            });
          }
        }}
        activeOpacity={0.8}
      >
        <Ionicons name="locate" size={20} color={colors.text} />
      </TouchableOpacity>

      {/* White bottom sheet */}
      <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + spacing.sm }]}>
        {/* Handle bar */}
        <View style={styles.handleBar} />

        {/* "Where to?" search pill — Google Places autocomplete */}
        <View testID="where-to-pill" style={[styles.searchPill, searchFocused && styles.searchPillFocused]}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            testID="destination-search-input"
            style={styles.searchPillInput}
            placeholder={t('whereAreYouGoing')}
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={handleSearchChange}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => {
              // Small delay so place tap registers
              setTimeout(() => setSearchFocused(false), 200);
            }}
            returnKeyType="search"
          />
          {searchQuery ? (
            <TouchableOpacity
              onPress={() => { setSearchQuery(''); setSearchResults([]); }}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle" size={18} color={colors.gray400} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              testID="confirm-ride-button"
              style={styles.searchPillArrow}
              onPress={handleBookRide}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-forward" size={14} color={colors.white} />
            </TouchableOpacity>
          )}
        </View>

        {/* Autocomplete dropdown */}
        {searchFocused && searchResults.length > 0 && (
          <View style={styles.autocompleteDropdown}>
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.placeId}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  testID={`search-result-${index}`}
                  style={styles.autocompleteItem}
                  onPress={() => handlePlaceSelect(item)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="location-outline" size={16} color={colors.primary} style={{ marginRight: spacing.sm }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.autocompleteMain} numberOfLines={1}>{item.mainText}</Text>
                    {item.secondaryText ? (
                      <Text style={styles.autocompleteSecondary} numberOfLines={1}>{item.secondaryText}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        {/* Ride type selector — horizontal scroll */}
        <View style={styles.rideTypesHeader}>
          <Text style={styles.rideTypesSectionLabel}>Ride type</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('RideCompare', { initialRideType: selectedType })}
            activeOpacity={0.75}
          >
            <Text style={styles.compareAllBtn}>Compare all</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rideTypesScroll}
        >
          {RIDE_TYPES.map((type) => {
            const isSelected = selectedType === type.id;
            return (
              <TouchableOpacity
                key={type.id}
                testID={`ride-type-${type.id}`}
                style={[styles.rideTypeCard, isSelected && styles.rideTypeCardSelected]}
                onPress={() => setSelectedType(type.id)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={type.icon}
                  size={22}
                  color={isSelected ? colors.primary : colors.gray500}
                />
                <Text style={[styles.rideTypeLabel, isSelected && styles.rideTypeLabelSelected]}>
                  {type.label}
                </Text>
                <Text style={[styles.rideTypePrice, isSelected && styles.rideTypePriceSelected]}>
                  {type.price}
                </Text>
                <Text style={styles.rideTypeEta}>{type.eta}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Recent destinations */}
        {!searchFocused && (
          <>
            <Text style={styles.sectionLabel}>{t('recentDestinations')}</Text>
            {RECENT_DESTINATIONS.map((dest) => (
              <TouchableOpacity
                key={dest.id}
                style={styles.recentRow}
                onPress={() => handleDestinationPress(dest)}
                activeOpacity={0.75}
              >
                <View style={styles.recentIcon}>
                  <Ionicons name="time-outline" size={16} color={colors.gray500} />
                </View>
                <View style={styles.recentInfo}>
                  <Text style={styles.recentName} numberOfLines={1}>{dest.name}</Text>
                  <Text style={styles.recentAddress} numberOfLines={1}>{dest.address}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.gray300} />
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Ad banner — rotating promos */}
        {!searchFocused && (
          <AdBanner onCtaPress={(ad) => {
            if (ad.id === '3') navigation.navigate('CommuterPass');
            else if (ad.id === '4') navigation.navigate('Referral');
            else if (ad.id === '5') navigation.navigate('BookRide', { initialRideType: 'moto' });
          }} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.mapBackground,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  topBar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
  },
  topBarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  driverCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    gap: spacing.xs,
    ...shadows.sm,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.online,
  },
  driverCountText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  avatarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  avatarLetter: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.white,
  },
  surgeBadge: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surge,
    borderRadius: 100,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    gap: spacing.xs,
    zIndex: 15,
    ...shadows.sm,
  },
  surgeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  driverMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  myLocationBtn: {
    position: 'absolute',
    right: spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    ...shadows.md,
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 16,
    zIndex: 10,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray300,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  searchPillFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.white,
  },
  searchPillInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    fontWeight: '400',
    paddingVertical: 0,
  },
  searchPillArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  autocompleteDropdown: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    maxHeight: 220,
    borderWidth: 1,
    borderColor: colors.gray200,
    ...shadows.md,
    overflow: 'hidden',
  },
  autocompleteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  autocompleteMain: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  autocompleteSecondary: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  rideTypesHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xs, marginBottom: 4,
  },
  rideTypesSectionLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  compareAllBtn: { fontSize: 12, fontWeight: '700', color: colors.primary },
  rideTypesScroll: {
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  rideTypeCard: {
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.gray200,
    backgroundColor: colors.white,
    minWidth: 88,
    gap: 3,
    ...shadows.sm,
  },
  rideTypeCardSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255,0,191,0.04)',
    transform: [{ scale: 1.03 }],
  },
  rideTypeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  rideTypeLabelSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  rideTypePrice: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
  },
  rideTypePriceSelected: {
    color: colors.primary,
  },
  rideTypeEta: {
    fontSize: 10,
    color: colors.textLight,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
    gap: spacing.sm,
  },
  recentIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentInfo: {
    flex: 1,
  },
  recentName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  recentAddress: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
