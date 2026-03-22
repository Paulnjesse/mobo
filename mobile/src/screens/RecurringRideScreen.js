/**
 * Feature 41 — Recurring / Series Scheduled Rides
 * Lets riders set up repeating rides (daily, weekdays, weekends, weekly).
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  StatusBar, ActivityIndicator, Alert, Switch, ScrollView, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, shadows } from '../theme';
import api from '../services/api';

const FREQ_OPTIONS = [
  { key: 'daily',    label: 'Every Day',     icon: 'calendar' },
  { key: 'weekdays', label: 'Mon–Fri',        icon: 'briefcase-outline' },
  { key: 'weekends', label: 'Sat & Sun',      icon: 'sunny-outline' },
  { key: 'weekly',   label: 'Once a Week',   icon: 'repeat-outline' },
];

const RIDE_TYPES = ['standard', 'comfort', 'moto', 'xl', 'luxury'];

const MOCK_SERIES = [
  {
    id: 's1', frequency: 'weekdays', ride_type: 'standard',
    pickup_address: 'Bastos, Yaoundé', dropoff_address: 'Hippodrome, Yaoundé',
    time: '07:30', active: true, next_ride: '2026-03-25T07:30:00Z',
  },
];

export default function RecurringRideScreen({ navigation }) {
  const { colors } = useTheme();
  const s = makeStyles(colors);

  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    frequency: 'weekdays', ride_type: 'standard',
    pickup_address: '', dropoff_address: '', time: '07:30',
  });

  const load = async () => {
    try {
      const res = await api.get('/rides/recurring');
      setSeries(res.data?.series || MOCK_SERIES);
    } catch {
      setSeries(MOCK_SERIES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (id, current) => {
    try { await api.patch(`/rides/recurring/${id}`, { active: !current }); } catch {}
    setSeries((prev) => prev.map((s) => s.id === id ? { ...s, active: !current } : s));
  };

  const deleteSeries = (id) => {
    Alert.alert('Cancel Series', 'Cancel this recurring ride series?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Cancel Series', style: 'destructive', onPress: async () => {
          try { await api.delete(`/rides/recurring/${id}`); } catch {}
          setSeries((prev) => prev.filter((s) => s.id !== id));
        },
      },
    ]);
  };

  const createSeries = async () => {
    if (!form.pickup_address.trim() || !form.dropoff_address.trim()) {
      Alert.alert('Missing Fields', 'Please enter pickup and dropoff addresses.');
      return;
    }
    const newSeries = { id: Date.now().toString(), ...form, active: true, next_ride: null };
    try {
      const res = await api.post('/rides/recurring', form);
      setSeries((prev) => [...prev, res.data?.series || newSeries]);
    } catch {
      setSeries((prev) => [...prev, newSeries]);
    }
    setShowCreate(false);
    setForm({ frequency: 'weekdays', ride_type: 'standard', pickup_address: '', dropoff_address: '', time: '07:30' });
  };

  const freqLabel = (key) => FREQ_OPTIONS.find((f) => f.key === key)?.label || key;

  const renderSeries = ({ item }) => (
    <View style={s.card}>
      <View style={s.cardTop}>
        <View style={[s.freqIcon, { backgroundColor: colors.primary + '15' }]}>
          <Ionicons name="repeat-outline" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>{freqLabel(item.frequency)} · {item.time}</Text>
          <Text style={s.cardRideType}>{item.ride_type.charAt(0).toUpperCase() + item.ride_type.slice(1)}</Text>
        </View>
        <Switch
          value={item.active}
          onValueChange={() => toggleActive(item.id, item.active)}
          trackColor={{ true: colors.primary, false: colors.gray200 }}
          thumbColor="#fff"
        />
      </View>

      <View style={s.route}>
        <View style={s.routeDots}>
          <View style={s.dotGreen} />
          <View style={s.routeLine} />
          <View style={s.dotRed} />
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          <Text style={s.routeText} numberOfLines={1}>{item.pickup_address}</Text>
          <Text style={s.routeText} numberOfLines={1}>{item.dropoff_address}</Text>
        </View>
      </View>

      {item.next_ride && (
        <Text style={s.nextRide}>Next: {new Date(item.next_ride).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
      )}

      <TouchableOpacity style={s.deleteBtn} onPress={() => deleteSeries(item.id)}>
        <Ionicons name="trash-outline" size={14} color="#CC0000" />
        <Text style={s.deleteBtnText}>Cancel Series</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle={colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'} />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Recurring Rides</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => setShowCreate(true)}>
          <Ionicons name="add" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
      ) : (
        <FlatList
          data={series}
          keyExtractor={(item) => item.id}
          renderItem={renderSeries}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="repeat-outline" size={48} color={colors.gray300} />
              <Text style={s.emptyText}>No recurring rides</Text>
              <Text style={s.emptySubText}>Tap + to set up your daily commute or weekly trip.</Text>
            </View>
          }
        />
      )}

      {showCreate && (
        <View style={[s.sheet, { backgroundColor: colors.white }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={s.sheetHeader}>
              <Text style={[s.sheetTitle, { color: colors.text }]}>New Recurring Ride</Text>
              <TouchableOpacity onPress={() => setShowCreate(false)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={s.fieldLabel}>Frequency</Text>
            <View style={s.chipRow}>
              {FREQ_OPTIONS.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[s.chip, form.frequency === f.key && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
                  onPress={() => setForm((prev) => ({ ...prev, frequency: f.key }))}
                >
                  <Text style={[s.chipText, { color: form.frequency === f.key ? colors.primary : colors.textSecondary }]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>Ride Type</Text>
            <View style={s.chipRow}>
              {RIDE_TYPES.map((rt) => (
                <TouchableOpacity
                  key={rt}
                  style={[s.chip, form.ride_type === rt && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
                  onPress={() => setForm((prev) => ({ ...prev, ride_type: rt }))}
                >
                  <Text style={[s.chipText, { color: form.ride_type === rt ? colors.primary : colors.textSecondary }]}>
                    {rt.charAt(0).toUpperCase() + rt.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>Pickup Time</Text>
            <TextInput
              style={[s.input, { color: colors.text, borderColor: colors.gray200 }]}
              placeholder="e.g. 07:30"
              placeholderTextColor={colors.gray400}
              value={form.time}
              onChangeText={(v) => setForm((prev) => ({ ...prev, time: v }))}
            />

            <Text style={s.fieldLabel}>Pickup Address</Text>
            <TextInput
              style={[s.input, { color: colors.text, borderColor: colors.gray200 }]}
              placeholder="Enter pickup address..."
              placeholderTextColor={colors.gray400}
              value={form.pickup_address}
              onChangeText={(v) => setForm((prev) => ({ ...prev, pickup_address: v }))}
            />

            <Text style={s.fieldLabel}>Dropoff Address</Text>
            <TextInput
              style={[s.input, { color: colors.text, borderColor: colors.gray200 }]}
              placeholder="Enter dropoff address..."
              placeholderTextColor={colors.gray400}
              value={form.dropoff_address}
              onChangeText={(v) => setForm((prev) => ({ ...prev, dropoff_address: v }))}
            />

            <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.primary }]} onPress={createSeries}>
              <Text style={s.saveBtnText}>Create Series</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}
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
    list: { padding: spacing.md, gap: spacing.sm },
    card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    freqIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
    cardRideType: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    route: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm, marginBottom: spacing.sm },
    routeDots: { alignItems: 'center', paddingTop: 2 },
    dotGreen: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
    routeLine: { width: 2, flex: 1, backgroundColor: colors.gray200, marginVertical: 2 },
    dotRed: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
    routeText: { fontSize: 13, color: colors.text, fontWeight: '500' },
    nextRide: { fontSize: 11, color: colors.textSecondary, marginBottom: spacing.xs },
    deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
    deleteBtnText: { fontSize: 12, color: '#CC0000', fontWeight: '600' },
    empty: { alignItems: 'center', paddingTop: 80, gap: spacing.sm },
    emptyText: { fontSize: 15, fontWeight: '600', color: colors.text },
    emptySubText: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: spacing.xl },
    sheet: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
      padding: spacing.md, paddingBottom: spacing.xl, maxHeight: '85%',
      shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 10,
    },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
    sheetTitle: { fontSize: 16, fontWeight: '800' },
    fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 6, marginTop: spacing.sm },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    chip: {
      borderWidth: 1, borderColor: colors.gray200, borderRadius: radius.pill,
      paddingHorizontal: 12, paddingVertical: 6,
    },
    chipText: { fontSize: 12, fontWeight: '600' },
    input: {
      borderWidth: 1, borderRadius: radius.md, padding: spacing.sm,
      fontSize: 14, marginBottom: 4,
    },
    saveBtn: { borderRadius: radius.pill, padding: spacing.md, alignItems: 'center', marginTop: spacing.md },
    saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  });
}
