import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

const DOUALA_DEFAULT = { latitude: 4.0511, longitude: 9.7679 };

export default function HomeLocationScreen({ navigation, route }) {
  const isOnboarding = route?.params?.isOnboarding !== false; // true by default
  const mapRef = useRef(null);

  const [region, setRegion] = useState({
    ...DOUALA_DEFAULT,
    latitudeDelta: 0.015,
    longitudeDelta: 0.015,
  });
  const [pin, setPin] = useState(null);        // { latitude, longitude }
  const [address, setAddress] = useState('');
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // On mount, try to get current location automatically
  useEffect(() => {
    detectLocation();
  }, []);

  const detectLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        setLocating(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const coords = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };
      setPin(coords);
      const newRegion = { ...coords, latitudeDelta: 0.008, longitudeDelta: 0.008 };
      setRegion(newRegion);
      mapRef.current?.animateToRegion(newRegion, 600);
      await reverseGeocode(coords);
    } catch (e) {
      console.warn('Location error', e.message);
    } finally {
      setLocating(false);
    }
  };

  const reverseGeocode = async (coords) => {
    try {
      const results = await Location.reverseGeocodeAsync(coords);
      if (results && results.length > 0) {
        const r = results[0];
        const parts = [r.streetNumber, r.street, r.district, r.city].filter(Boolean);
        setAddress(parts.join(', '));
      }
    } catch (_) {
      setAddress('');
    }
  };

  const onMapPress = async (e) => {
    const coords = e.nativeEvent.coordinate;
    setPin(coords);
    await reverseGeocode(coords);
  };

  const handleSave = async () => {
    if (!pin) {
      Alert.alert('No location selected', 'Tap the map or use "My location" to set your home.');
      return;
    }
    setSaving(true);
    try {
      // api interceptor attaches the Bearer token from SecureStore automatically
      await api.post('/auth/driver/home-location', {
        latitude: pin.latitude, longitude: pin.longitude, address,
      });
      Alert.alert(
        'Home saved!',
        'We\'ll use this to match you with rides on your way home.',
        [{ text: 'Continue', onPress: () => navigateNext() }]
      );
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not save location. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const navigateNext = () => {
    if (isOnboarding) {
      navigation.replace('DriverHome');
    } else {
      navigation.goBack();
    }
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip for now?',
      'You can set your home location later in Settings. It helps us match you with rides on your way home.',
      [
        { text: 'Set it now', style: 'cancel' },
        { text: 'Skip', onPress: navigateNext },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Set Your Home</Text>
          <Text style={styles.headerSub}>
            We use this to find riders on your route home
          </Text>
        </View>
        {isOnboarding && (
          <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          region={region}
          onRegionChangeComplete={setRegion}
          onPress={onMapPress}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {pin && (
            <>
              <Marker coordinate={pin} title="Home">
                <View style={styles.markerOuter}>
                  <Ionicons name="home" size={20} color="#fff" />
                </View>
              </Marker>
              <Circle
                center={pin}
                radius={200}
                fillColor="rgba(59,130,246,0.12)"
                strokeColor="rgba(59,130,246,0.4)"
                strokeWidth={1}
              />
            </>
          )}
        </MapView>

        {/* My Location button */}
        <TouchableOpacity
          style={styles.locateBtn}
          onPress={detectLocation}
          disabled={locating}
        >
          {locating ? (
            <ActivityIndicator color="#3B82F6" size="small" />
          ) : (
            <Ionicons name="navigate" size={22} color="#3B82F6" />
          )}
        </TouchableOpacity>

        {/* Hint overlay */}
        {!pin && !locating && (
          <View style={styles.hintOverlay} pointerEvents="none">
            <Ionicons name="finger-print-outline" size={28} color="#fff" />
            <Text style={styles.hintText}>Tap the map to pin your home</Text>
          </View>
        )}
      </View>

      {/* Address preview + action */}
      <View style={styles.footer}>
        {pin ? (
          <View style={styles.addressRow}>
            <Ionicons name="home-outline" size={20} color="#3B82F6" style={{ marginTop: 2 }} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.addressLabel}>Home address</Text>
              <Text style={styles.addressText} numberOfLines={2}>
                {address || `${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`}
              </Text>
            </View>
            <TouchableOpacity onPress={detectLocation}>
              <Ionicons name="refresh" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.addressRow}>
            <Ionicons name="information-circle-outline" size={20} color="#9CA3AF" />
            <Text style={[styles.addressText, { color: '#9CA3AF', marginLeft: 8 }]}>
              {permissionDenied
                ? 'Location permission denied — tap the map to pin your home'
                : 'Getting your location…'}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.saveBtn, (!pin || saving) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!pin || saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.saveBtnText}>Save Home Location</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.privacyNote}>
          <Ionicons name="lock-closed-outline" size={11} color="#9CA3AF" />
          {' '}Your home location is private and never shown to riders.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  headerSub:  { fontSize: 13, color: '#6B7280', marginTop: 2 },
  skipBtn:    { paddingVertical: 6, paddingHorizontal: 2 },
  skipText:   { fontSize: 14, color: '#6B7280', fontWeight: '500' },

  mapContainer: { flex: 1, position: 'relative' },
  map:          { ...StyleSheet.absoluteFillObject },

  locateBtn: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: '#fff',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },

  hintOverlay: {
    position: 'absolute',
    bottom: 70,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  hintText: { color: '#fff', fontSize: 14, fontWeight: '500' },

  markerOuter: {
    backgroundColor: '#3B82F6',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },

  footer: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 12,
  },

  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    gap: 0,
  },
  addressLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  addressText:  { fontSize: 14, color: '#111827', marginTop: 2, lineHeight: 20 },

  saveBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { backgroundColor: '#93C5FD' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  privacyNote: {
    textAlign: 'center',
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 18,
  },
});
