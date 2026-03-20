import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

const CATEGORIES = ['Phone', 'Wallet/Bag', 'Keys', 'Clothing', 'Electronics', 'Documents', 'Other'];
const STATUS_COLORS = {
  reported: '#FFF3E0', driver_contacted: '#E3F2FD', found: '#E8F5E9',
  returned: '#E8F5E9', not_found: '#FFEBEE', closed: '#F5F5F5'
};

const LostAndFoundScreen = ({ navigation, route }) => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [rideId, setRideId] = useState(route?.params?.ride_id || '');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { loadReports(); }, []);

  const loadReports = async () => {
    try {
      const res = await api.get('/rides/lost-and-found');
      setReports(res.data.reports);
    } catch (e) {
      Alert.alert('Error', 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const submitReport = async () => {
    if (!description.trim() || !rideId.trim()) {
      return Alert.alert('Required', 'Please enter a description and ride ID');
    }
    setSubmitting(true);
    try {
      await api.post('/rides/lost-and-found', {
        ride_id: rideId,
        item_description: description,
        item_category: category
      });
      Alert.alert('Report Submitted', 'We will contact your driver shortly.');
      setShowReport(false);
      setDescription('');
      setCategory('');
      loadReports();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  const statusLabel = s => s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#FF00BF" /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.title}>Lost & Found</Text>
        <TouchableOpacity onPress={() => setShowReport(true)} style={styles.reportBtn}>
          <Text style={styles.reportBtnText}>+ Report</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }}>
        {reports.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={56} color="#ddd" />
            <Text style={styles.emptyText}>No lost item reports</Text>
            <TouchableOpacity style={styles.newReportBtn} onPress={() => setShowReport(true)}>
              <Text style={styles.newReportBtnText}>Report a Lost Item</Text>
            </TouchableOpacity>
          </View>
        ) : (
          reports.map(r => (
            <View key={r.id} style={[styles.reportCard, { backgroundColor: STATUS_COLORS[r.status] || '#F6F6F6' }]}>
              <View style={styles.reportTop}>
                <View style={styles.categoryIcon}>
                  <Ionicons name="cube-outline" size={20} color="#FF00BF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reportDesc}>{r.item_description}</Text>
                  {r.item_category && <Text style={styles.reportCat}>{r.item_category}</Text>}
                </View>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>{statusLabel(r.status)}</Text>
                </View>
              </View>
              <Text style={styles.reportRide}>Ride: {r.pickup_address} → {r.dropoff_address}</Text>
              {r.driver_name && <Text style={styles.reportDriver}>Driver: {r.driver_name} · {r.driver_phone}</Text>}
              {r.driver_response && <Text style={styles.driverResponse}>"{r.driver_response}"</Text>}
              <Text style={styles.reportDate}>{new Date(r.created_at).toLocaleDateString()}</Text>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={showReport} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Report Lost Item</Text>
            <TextInput
              style={styles.input}
              value={rideId}
              onChangeText={setRideId}
              placeholder="Ride ID (from your receipt)"
            />
            <TextInput
              style={[styles.input, { height: 80 }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe the item..."
              multiline
            />
            <Text style={styles.catLabel}>Category (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
              {CATEGORIES.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.catChip, category === c && styles.catChipActive]}
                  onPress={() => setCategory(category === c ? '' : c)}
                >
                  <Text style={[styles.catChipText, category === c && { color: '#fff' }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.submitBtn} onPress={submitReport} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Submit Report</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowReport(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 50, gap: 12 },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  reportBtn: { backgroundColor: '#FF00BF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  reportBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  empty: { alignItems: 'center', padding: 48 },
  emptyText: { fontSize: 16, color: '#999', marginTop: 12, marginBottom: 20 },
  newReportBtn: { backgroundColor: '#FF00BF', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 },
  newReportBtnText: { color: '#fff', fontWeight: '700' },
  reportCard: { margin: 12, marginBottom: 0, borderRadius: 14, padding: 14 },
  reportTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  categoryIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFF0FA', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  reportDesc: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', flex: 1 },
  reportCat: { fontSize: 12, color: '#666', marginTop: 2 },
  statusBadge: { backgroundColor: 'rgba(0,0,0,0.08)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '600', color: '#333' },
  reportRide: { fontSize: 12, color: '#666', marginBottom: 4 },
  reportDriver: { fontSize: 12, color: '#333', fontWeight: '500', marginBottom: 4 },
  driverResponse: { fontSize: 12, color: '#555', fontStyle: 'italic', marginBottom: 4 },
  reportDate: { fontSize: 11, color: '#999' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderRadius: 20, padding: 20, margin: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 14 },
  catLabel: { fontSize: 13, color: '#666', marginBottom: 8 },
  catRow: { marginBottom: 12 },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', marginRight: 8 },
  catChipActive: { backgroundColor: '#FF00BF', borderColor: '#FF00BF' },
  catChipText: { fontSize: 13, color: '#333', fontWeight: '500' },
  submitBtn: { backgroundColor: '#FF00BF', padding: 14, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { padding: 10, alignItems: 'center' },
  cancelText: { color: '#666', fontWeight: '600' },
});

export default LostAndFoundScreen;
