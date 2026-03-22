/**
 * Feature 33 — Driver Demand Heat Map
 * Shows real-time demand intensity zones overlaid on the map.
 * Hot zones = more ride requests. Helps drivers position for higher earnings.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as ExpoLocation from 'expo-location';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../theme';
import api from '../services/api';

const INTENSITY_COLORS = {
  low:    'rgba(0, 200, 100, 0.25)',
  medium: 'rgba(255, 165, 0, 0.30)',
  high:   'rgba(255, 50,  50, 0.35)',
};
const INTENSITY_STROKE = {
  low: 'rgba(0,200,100,0.5)', medium: 'rgba(255,165,0,0.6)', high: 'rgba(255,50,50,0.7)',
};

// Fallback mock zones for Yaoundé/Douala if API unavailable
const MOCK_ZONES = [
  { id: '1', lat: 3.866,  lng: 11.516, radius: 800,  intensity: 'high',   label: 'Mokolo Market',   demand: 24 },
  { id: '2', lat: 3.848,  lng: 11.502, radius: 600,  intensity: 'high',   label: 'Centre-Ville',    demand: 31 },
  { id: '3', lat: 3.880,  lng: 11.488, radius: 500,  intensity: 'medium', label: 'Bastos',          demand: 14 },
  { id: '4', lat: 3.830,  lng: 11.530, radius: 700,  intensity: 'medium', label: 'Mvan',            demand: 11 },
  { id: '5', lat: 3.862,  lng: 11.545, radius: 900,  intensity: 'low',    label: 'Biyem-Assi',      demand: 6  },
  { id: '6', lat: 3.840,  lng: 11.470, radius: 550,  intensity: 'high',   label: 'Carrefour Warda', demand: 19 },
  { id: '7', lat: 4.063,  lng: 9.726,  radius: 1000, intensity: 'high',   label: 'Douala Akwa',     demand: 28 },
  { id: '8', lat: 4.050,  lng: 9.742,  radius: 700,  intensity: 'medium', label: 'Douala Deïdo',    demand: 12 },
];

export default function DriverHeatMapScreen({ navigation }) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const mapRef = useRef(null);

  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'high' | 'medium'

  useEffect(() => {
    (async () => {
      try {
        const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await ExpoLocation.getCurrentPositionAsync({});
          setLocation(loc.coords);
        }
      } catch (_) {}

      try {
        const res = await api.get('/rides/heatmap/zones');
        setZones(res.data?.zones || MOCK_ZONES);
      } catch {
        setZones(MOCK_ZONES);
      }
      setLoading(false);
    })();
  }, []);

  const filteredZones = zones.filter((z) => filter === 'all' || z.intensity === filter);

  const mapRegion = location
    ? { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.06, longitudeDelta: 0.06 }
    : { latitude: 3.848, longitude: 11.502, latitudeDelta: 0.06, longitudeDelta: 0.06 };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle={colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Demand Heat Map</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => {
          if (location && mapRef.current) {
            mapRef.current.animateToRegion({ ...mapRegion, latitudeDelta: 0.04, longitudeDelta: 0.04 });
          }
        }}>
          <Ionicons name="locate-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Filter chips */}
      <View style={s.filterRow}>
        {['all', 'high', 'medium', 'low'].map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.filterChip, filter === f && s.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            {f !== 'all' && (
              <View style={[s.filterDot, { backgroundColor: INTENSITY_STROKE[f] }]} />
            )}
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>
              {f === 'all' ? 'All Zones' : f.charAt(0).toUpperCase() + f.slice(1) + ' Demand'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Map */}
      <View style={{ flex: 1 }}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          provider={PROVIDER_GOOGLE}
          region={mapRegion}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {filteredZones.map((zone) => (
            <React.Fragment key={zone.id}>
              <Circle
                center={{ latitude: zone.lat, longitude: zone.lng }}
                radius={zone.radius}
                fillColor={INTENSITY_COLORS[zone.intensity]}
                strokeColor={INTENSITY_STROKE[zone.intensity]}
                strokeWidth={1.5}
                onPress={() => setSelectedZone(zone)}
              />
              <Marker
                coordinate={{ latitude: zone.lat, longitude: zone.lng }}
                onPress={() => setSelectedZone(zone)}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={[s.zoneLabel, { backgroundColor: INTENSITY_STROKE[zone.intensity] }]}>
                  <Text style={s.zoneLabelText}>{zone.demand}</Text>
                </View>
              </Marker>
            </React.Fragment>
          ))}
        </MapView>

        {loading && (
          <View style={s.loadingOverlay}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[s.loadingText, { color: colors.text }]}>Loading demand zones…</Text>
          </View>
        )}

        {/* Selected zone info card */}
        {selectedZone && (
          <View style={[s.zoneCard, { backgroundColor: colors.white }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.zoneName, { color: colors.text }]}>{selectedZone.label}</Text>
              <Text style={[s.zoneInfo, { color: colors.textSecondary }]}>
                {selectedZone.demand} active requests · {selectedZone.intensity.toUpperCase()} demand
              </Text>
            </View>
            <TouchableOpacity
              style={[s.goBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                navigation.goBack();
              }}
            >
              <Text style={s.goBtnText}>Head Here</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSelectedZone(null)} style={{ padding: 4 }}>
              <Ionicons name="close" size={18} color={colors.gray400} />
            </TouchableOpacity>
          </View>
        )}

        {/* Legend */}
        <View style={[s.legend, { backgroundColor: colors.white }]}>
          <Text style={[s.legendTitle, { color: colors.text }]}>Demand</Text>
          {[['high', '#FF3232'], ['medium', '#FFA500'], ['low', '#00C864']].map(([label, color]) => (
            <View key={label} style={s.legendRow}>
              <View style={[s.legendDot, { backgroundColor: color }]} />
              <Text style={[s.legendText, { color: colors.textSecondary }]}>{label.charAt(0).toUpperCase() + label.slice(1)}</Text>
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.md, paddingVertical: spacing.md,
      backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray200,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
    filterRow: { flexDirection: 'row', gap: spacing.xs, padding: spacing.sm, backgroundColor: colors.white },
    filterChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill,
      borderWidth: 1, borderColor: colors.gray200, backgroundColor: colors.white,
    },
    filterChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '12' },
    filterDot: { width: 8, height: 8, borderRadius: 4 },
    filterText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
    filterTextActive: { color: colors.primary },
    zoneLabel: {
      paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
      minWidth: 24, alignItems: 'center',
    },
    zoneLabelText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    loadingOverlay: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.6)',
      gap: spacing.sm,
    },
    loadingText: { fontSize: 13, fontWeight: '600' },
    zoneCard: {
      position: 'absolute', bottom: 16, left: 16, right: 16,
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      borderRadius: radius.lg, padding: spacing.md,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12, shadowRadius: 8, elevation: 5,
    },
    zoneName: { fontSize: 15, fontWeight: '700' },
    zoneInfo: { fontSize: 12, marginTop: 2 },
    goBtn: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
    goBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    legend: {
      position: 'absolute', top: 16, right: 16,
      borderRadius: radius.md, padding: spacing.sm, gap: 4,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
    },
    legendTitle: { fontSize: 10, fontWeight: '800', marginBottom: 2 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendText: { fontSize: 10, fontWeight: '600' },
  });
}
