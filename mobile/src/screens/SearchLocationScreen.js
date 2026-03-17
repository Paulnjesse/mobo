import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  StatusBar,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme';

const RECENT_LOCATIONS = [
  { id: 'r1', name: 'Bastos', address: 'Bastos, Yaoundé, Cameroon', icon: 'time-outline' },
  { id: 'r2', name: 'Centre-Ville', address: 'Centre-Ville, Yaoundé, Cameroon', icon: 'time-outline' },
  { id: 'r3', name: 'Marché Central', address: 'Marché Central, Yaoundé, Cameroon', icon: 'time-outline' },
  { id: 'r4', name: 'Aéroport de Nsimalen', address: 'Aéroport International de Yaoundé-Nsimalen', icon: 'time-outline' },
];

const NEARBY_PLACES = [
  { id: 'n1', name: 'Palais des Congrès', address: 'Avenue Konrad Adenauer, Yaoundé', icon: 'location-outline', distance: '0.8 km' },
  { id: 'n2', name: 'Shopping Mall Yaoundé', address: 'Rue de Nachtigal, Yaoundé', icon: 'storefront-outline', distance: '1.2 km' },
  { id: 'n3', name: 'Université de Yaoundé I', address: 'BP 337, Yaoundé, Cameroon', icon: 'school-outline', distance: '2.5 km' },
  { id: 'n4', name: 'Hôpital Central', address: 'Rue Henri Dunant, Yaoundé', icon: 'medical-outline', distance: '1.8 km' },
];

const SEARCH_RESULTS_MOCK = [
  { id: 's1', name: 'Bastos Résidence', address: 'Quartier Bastos, Yaoundé', icon: 'location-outline' },
  { id: 's2', name: 'Bastos Marché', address: 'Marché de Bastos, Yaoundé', icon: 'location-outline' },
  { id: 's3', name: 'Bastos Ambassade', address: 'Zone Diplomatique Bastos, Yaoundé', icon: 'business-outline' },
];

export default function SearchLocationScreen({ navigation, route }) {
  const mode = route?.params?.mode || 'pickup'; // 'pickup' | 'dropoff'
  const onSelect = route?.params?.onSelect;

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState(null);

  const inputRef = useRef(null);

  useEffect(() => {
    // Auto-focus input on mount
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setShowResults(false);
      setResults([]);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      // In production: call Google Places API
      const filtered = SEARCH_RESULTS_MOCK.filter(
        (place) =>
          place.name.toLowerCase().includes(query.toLowerCase()) ||
          place.address.toLowerCase().includes(query.toLowerCase())
      );
      setResults(filtered.length > 0 ? filtered : [
        { id: 'q1', name: query, address: `${query}, Yaoundé, Cameroon`, icon: 'location-outline' },
      ]);
      setShowResults(true);
      setLoading(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (place) => {
    Keyboard.dismiss();
    setSelectedPreview(place);
    // Delay briefly to show preview, then navigate back
    setTimeout(() => {
      if (onSelect) {
        onSelect(place);
      } else {
        navigation.navigate('BookRide', {
          [mode === 'pickup' ? 'selectedPickup' : 'selectedDropoff']: place,
        });
      }
    }, 300);
  };

  const handleBack = () => {
    Keyboard.dismiss();
    navigation.goBack();
  };

  const isPickup = mode === 'pickup';
  const modeLabel = isPickup ? 'Pickup location' : 'Where to?';
  const modeColor = isPickup ? colors.success : colors.primary;

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.resultItem}
      onPress={() => handleSelect(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.placeIconWrap, { backgroundColor: modeColor + '15' }]}>
        <Ionicons name={item.icon || 'location-outline'} size={18} color={modeColor} />
      </View>
      <View style={styles.placeTexts}>
        <Text style={styles.placeName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.placeAddress} numberOfLines={1}>{item.address}</Text>
      </View>
      {item.distance && (
        <Text style={styles.placeDistance}>{item.distance}</Text>
      )}
      <Ionicons name="chevron-forward" size={16} color={colors.gray300} />
    </TouchableOpacity>
  );

  const renderSectionHeader = (title) => (
    <Text style={styles.sectionHeader}>{title}</Text>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <SafeAreaView style={styles.safeArea}>
        {/* Search Bar */}
        <View style={styles.searchHeader}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.searchInputWrap}>
            <View style={[styles.modeIndicator, { backgroundColor: modeColor }]} />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder={modeLabel}
              placeholderTextColor={colors.textLight}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn} activeOpacity={0.7}>
                <Ionicons name="close-circle" size={18} color={colors.gray300} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Loading indicator */}
        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>Searching...</Text>
          </View>
        )}

        <FlatList
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          data={
            showResults
              ? results
              : [...RECENT_LOCATIONS, ...NEARBY_PLACES]
          }
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            !showResults ? (
              <>
                {renderSectionHeader('Recent locations')}
                {RECENT_LOCATIONS.map((item) => (
                  <View key={item.id}>{renderItem({ item })}</View>
                ))}
                {renderSectionHeader('Nearby places')}
                {NEARBY_PLACES.map((item) => (
                  <View key={item.id}>{renderItem({ item })}</View>
                ))}
              </>
            ) : (
              renderSectionHeader(`Results for "${query}"`)
            )
          }
          renderItem={showResults ? renderItem : null}
          contentContainerStyle={styles.listContent}
        />

        {/* Map thumbnail preview on select */}
        {selectedPreview && (
          <View style={styles.previewCard}>
            <View style={styles.previewMapPlaceholder}>
              <Ionicons name="map" size={28} color={colors.gray300} />
            </View>
            <View style={styles.previewInfo}>
              <Text style={styles.previewName} numberOfLines={1}>{selectedPreview.name}</Text>
              <Text style={styles.previewAddress} numberOfLines={1}>{selectedPreview.address}</Text>
            </View>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  safeArea: { flex: 1 },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
    gap: spacing.xs,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
    height: 44,
  },
  modeIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  clearBtn: { padding: 2 },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
  },
  loadingText: { fontSize: 13, fontWeight: '400', color: colors.textSecondary },
  listContent: { paddingBottom: spacing.xl },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
    backgroundColor: colors.white,
  },
  placeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeTexts: { flex: 1 },
  placeName: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 2 },
  placeAddress: { fontSize: 12, fontWeight: '400', color: colors.textSecondary },
  placeDistance: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginRight: 4 },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadows.lg,
  },
  previewMapPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewInfo: { flex: 1 },
  previewName: { fontSize: 14, fontWeight: '700', color: colors.text },
  previewAddress: { fontSize: 12, fontWeight: '400', color: colors.textSecondary, marginTop: 2 },
});
