import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

const PreferredDriversScreen = ({ navigation }) => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDrivers(); }, []);

  const loadDrivers = async () => {
    try {
      const res = await api.get('/rides/preferred-drivers');
      setDrivers(res.data.preferred_drivers);
    } catch (e) {
      Alert.alert('Error', 'Failed to load preferred drivers');
    } finally {
      setLoading(false);
    }
  };

  const remove = (driverId, name) => {
    Alert.alert('Remove', `Remove ${name} from preferred drivers?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/rides/preferred-drivers/${driverId}`);
            loadDrivers();
          } catch (e) {
            Alert.alert('Error', 'Failed to remove driver');
          }
        }
      }
    ]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#FF00BF" /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.title}>Preferred Drivers</Text>
      </View>

      <Text style={styles.subtitle}>We'll try to match you with these drivers first when they're available.</Text>

      {drivers.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="star-outline" size={56} color="#ddd" />
          <Text style={styles.emptyTitle}>No preferred drivers yet</Text>
          <Text style={styles.emptySub}>After a great ride, you'll be able to add that driver to your preferred list.</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }}>
          {drivers.map(d => (
            <View key={d.id} style={styles.driverCard}>
              <View style={styles.avatar}>
                {d.profile_picture
                  ? <Image source={{ uri: d.profile_picture }} style={styles.avatarImg} />
                  : <Text style={styles.avatarText}>{d.full_name?.[0] || '?'}</Text>
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.driverName}>{d.full_name}</Text>
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={12} color="#FFD700" />
                  <Text style={styles.rating}>{parseFloat(d.rating || 5).toFixed(1)}</Text>
                </View>
                {d.make && (
                  <Text style={styles.vehicle}>{d.color} {d.make} {d.model} · {d.plate}</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => remove(d.driver_id, d.full_name)} style={styles.removeBtn}>
                <Ionicons name="close" size={20} color="#999" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 50, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  subtitle: { fontSize: 13, color: '#666', paddingHorizontal: 16, marginBottom: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginTop: 16 },
  emptySub: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 8 },
  driverCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FF00BF', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  avatarImg: { width: 52, height: 52, borderRadius: 26 },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 20 },
  driverName: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  rating: { fontSize: 12, color: '#666' },
  vehicle: { fontSize: 12, color: '#999', marginTop: 2 },
  removeBtn: { padding: 8 },
});

export default PreferredDriversScreen;
