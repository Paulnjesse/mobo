import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

const WomenConnectScreen = ({ navigation, route }) => {
  const currentPref = route?.params?.current_preference || 'any';
  const [selected, setSelected] = useState(currentPref);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/social/gender-preference', { gender_preference: selected });
      Alert.alert('Saved', 'Your preference has been updated', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (e) {
      Alert.alert('Error', 'Failed to save preference');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.title}>Women+ Connect</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Text style={{ fontSize: 40 }}>👩</Text>
        </View>

        <Text style={styles.heading}>Ride with women & non-binary drivers</Text>
        <Text style={styles.sub}>
          When available, we'll match you with women and non-binary drivers. Wait times may be longer in some areas.
        </Text>

        <TouchableOpacity
          style={[styles.option, selected === 'any' && styles.optionSelected]}
          onPress={() => setSelected('any')}
        >
          <View style={styles.optionLeft}>
            <View style={[styles.radio, selected === 'any' && styles.radioSelected]}>
              {selected === 'any' && <View style={styles.radioDot} />}
            </View>
            <View>
              <Text style={styles.optionTitle}>No preference</Text>
              <Text style={styles.optionSub}>Match with any available driver</Text>
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.option, selected === 'women_nonbinary' && styles.optionSelected]}
          onPress={() => setSelected('women_nonbinary')}
        >
          <View style={styles.optionLeft}>
            <View style={[styles.radio, selected === 'women_nonbinary' && styles.radioSelected]}>
              {selected === 'women_nonbinary' && <View style={styles.radioDot} />}
            </View>
            <View>
              <Text style={styles.optionTitle}>Women & non-binary drivers</Text>
              <Text style={styles.optionSub}>Prefer women and non-binary drivers when available</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={18} color="#666" />
          <Text style={styles.noteText}>
            This preference may increase wait times. If no preferred driver is available, you'll be matched with any driver.
          </Text>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Preference</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 50, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  content: { flex: 1, padding: 20 },
  iconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFF0FA', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 20 },
  heading: { fontSize: 20, fontWeight: '800', color: '#1A1A1A', textAlign: 'center', marginBottom: 8 },
  sub: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  option: { borderWidth: 2, borderColor: '#ddd', borderRadius: 14, padding: 16, marginBottom: 12 },
  optionSelected: { borderColor: '#FF00BF', backgroundColor: '#FFF0FA' },
  optionLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#ddd', justifyContent: 'center', alignItems: 'center' },
  radioSelected: { borderColor: '#FF00BF' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF00BF' },
  optionTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  optionSub: { fontSize: 13, color: '#666', marginTop: 2 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#F6F6F6', padding: 12, borderRadius: 10, marginBottom: 24, marginTop: 8 },
  noteText: { flex: 1, fontSize: 13, color: '#555', lineHeight: 18 },
  saveBtn: { backgroundColor: '#FF00BF', padding: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

export default WomenConnectScreen;
