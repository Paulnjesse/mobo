import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Switch
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

const DestinationModeScreen = ({ navigation }) => {
  const [enabled, setEnabled] = useState(false);
  const [address, setAddress] = useState('');
  const [currentDest, setCurrentDest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadDestination(); }, []);

  const loadDestination = async () => {
    try {
      const res = await api.get('/location/destination-mode');
      const d = res.data.destination;
      setEnabled(d.destination_mode);
      setCurrentDest(d);
      if (d.destination_address) setAddress(d.destination_address);
    } catch (e) {
      console.log(e.response?.data);
    } finally {
      setLoading(false);
    }
  };

  const saveDestination = async () => {
    if (!address.trim()) return Alert.alert('Required', 'Enter a destination address');
    setSaving(true);
    try {
      // Use a dummy location — in production, geocode the address
      await api.post('/location/destination-mode', {
        enabled: true,
        destination_address: address,
        destination_location: { lat: 3.848, lng: 11.502 } // Yaoundé fallback
      });
      Alert.alert('Destination Mode On', `Only rides toward "${address}" will be offered for 2 hours.`);
      loadDestination();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to set destination mode');
    } finally {
      setSaving(false);
    }
  };

  const disableDestination = async () => {
    setSaving(true);
    try {
      await api.post('/location/destination-mode', { enabled: false });
      setEnabled(false);
      setCurrentDest(null);
      setAddress('');
    } catch (e) {
      Alert.alert('Error', 'Failed to disable destination mode');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#FF00BF" /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.title}>Destination Mode</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.iconRow}>
          <View style={[styles.iconCircle, enabled && styles.iconCircleActive]}>
            <Ionicons name="navigate" size={32} color={enabled ? '#FF00BF' : '#999'} />
          </View>
        </View>

        <Text style={styles.heading}>Head home, your way</Text>
        <Text style={styles.sub}>
          Only receive ride requests that take you toward your destination. Active for 2 hours or until you go offline.
        </Text>

        {enabled && currentDest?.destination_address ? (
          <View style={styles.activeCard}>
            <View style={styles.activeRow}>
              <Ionicons name="location" size={20} color="#FF00BF" />
              <Text style={styles.activeAddress}>{currentDest.destination_address}</Text>
            </View>
            {currentDest.destination_expires_at && (
              <Text style={styles.expiresAt}>
                Expires {new Date(currentDest.destination_expires_at).toLocaleTimeString()}
              </Text>
            )}
            <TouchableOpacity style={styles.disableBtn} onPress={disableDestination} disabled={saving}>
              {saving ? <ActivityIndicator color="#FF00BF" size="small" /> : <Text style={styles.disableBtnText}>Turn Off Destination Mode</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Where are you heading?</Text>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="Enter your destination"
            />
            <TouchableOpacity style={styles.saveBtn} onPress={saveDestination} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Turn On Destination Mode</Text>}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.tips}>
          <Text style={styles.tipTitle}>How it works</Text>
          <Text style={styles.tip}>• You'll only see rides going in your direction</Text>
          <Text style={styles.tip}>• Activates for up to 2 hours</Text>
          <Text style={styles.tip}>• You can turn it off anytime</Text>
          <Text style={styles.tip}>• Goes offline automatically when it expires</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 50, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  content: { flex: 1, padding: 20 },
  iconRow: { alignItems: 'center', marginBottom: 20 },
  iconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F6F6F6', justifyContent: 'center', alignItems: 'center' },
  iconCircleActive: { backgroundColor: '#FFF0FA' },
  heading: { fontSize: 22, fontWeight: '800', color: '#1A1A1A', textAlign: 'center', marginBottom: 8 },
  sub: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  activeCard: { backgroundColor: '#FFF0FA', borderRadius: 14, padding: 16, marginBottom: 20 },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  activeAddress: { fontSize: 15, fontWeight: '600', color: '#1A1A1A', flex: 1 },
  expiresAt: { fontSize: 12, color: '#999', marginBottom: 12 },
  disableBtn: { alignItems: 'center', paddingVertical: 10 },
  disableBtnText: { color: '#FF00BF', fontWeight: '700', fontSize: 14 },
  inputContainer: { marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 12 },
  saveBtn: { backgroundColor: '#FF00BF', padding: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  tips: { backgroundColor: '#F6F6F6', borderRadius: 12, padding: 14 },
  tipTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  tip: { fontSize: 13, color: '#555', marginBottom: 6 },
});

export default DestinationModeScreen;
