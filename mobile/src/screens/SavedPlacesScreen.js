/**
 * Feature 34 — Rider Saved Places (Home / Work quick set)
 * Lets riders save frequently visited locations for quick booking.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, shadows } from '../theme';
import api from '../services/api';

const PLACE_ICONS = {
  home: 'home',
  work: 'briefcase',
  gym: 'barbell-outline',
  school: 'school-outline',
  church: 'heart-outline',
  market: 'basket-outline',
  custom: 'location',
};

const PLACE_COLORS = {
  home: '#00A651',
  work: '#0077CC',
  gym: '#FF6B00',
  school: '#9B59B6',
  church: '#E74C3C',
  market: '#F39C12',
  custom: '#7F8C8D',
};

const PLACE_TYPES = ['home', 'work', 'gym', 'school', 'church', 'market', 'custom'];

const MOCK_PLACES = [
  { id: '1', label: 'Home', type: 'home', address: 'Bastos, Yaoundé, Cameroon', lat: 3.880, lng: 11.488 },
  { id: '2', label: 'Work', type: 'work', address: 'Hippodrome, Yaoundé, Cameroon', lat: 3.848, lng: 11.502 },
];

export default function SavedPlacesScreen({ navigation }) {
  const { colors } = useTheme();
  const s = makeStyles(colors);

  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ label: '', type: 'custom', address: '' });

  const load = async () => {
    try {
      const res = await api.get('/users/me/saved-places');
      setPlaces(res.data?.places || MOCK_PLACES);
    } catch {
      setPlaces(MOCK_PLACES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const deletePlace = (id) => {
    Alert.alert('Remove Place', 'Remove this saved place?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try { await api.delete(`/users/me/saved-places/${id}`); } catch {}
          setPlaces((prev) => prev.filter((p) => p.id !== id));
        },
      },
    ]);
  };

  const savePlace = async () => {
    if (!form.label.trim() || !form.address.trim()) {
      Alert.alert('Missing Fields', 'Please enter a label and address.');
      return;
    }
    const newPlace = { id: Date.now().toString(), ...form };
    try {
      const res = await api.post('/users/me/saved-places', form);
      setPlaces((prev) => [...prev, res.data?.place || newPlace]);
    } catch {
      setPlaces((prev) => [...prev, newPlace]);
    }
    setForm({ label: '', type: 'custom', address: '' });
    setShowAdd(false);
  };

  const renderPlace = ({ item }) => {
    const icon = PLACE_ICONS[item.type] || 'location';
    const color = PLACE_COLORS[item.type] || colors.primary;
    return (
      <View style={s.card}>
        <View style={[s.placeIcon, { backgroundColor: color + '18' }]}>
          <Ionicons name={icon} size={22} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.placeLabel}>{item.label}</Text>
          <Text style={s.placeAddress} numberOfLines={1}>{item.address}</Text>
        </View>
        <TouchableOpacity
          style={s.useBtn}
          onPress={() => navigation.navigate('Home', { destination: item })}
        >
          <Text style={[s.useBtnText, { color: colors.primary }]}>Use</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => deletePlace(item.id)} style={{ padding: 6 }}>
          <Ionicons name="trash-outline" size={16} color={colors.gray400} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle={colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'} />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Saved Places</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => setShowAdd(true)}>
          <Ionicons name="add" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
      ) : (
        <FlatList
          data={places}
          keyExtractor={(item) => item.id}
          renderItem={renderPlace}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="bookmark-outline" size={48} color={colors.gray300} />
              <Text style={s.emptyText}>No saved places yet</Text>
              <Text style={s.emptySubText}>Tap + to add Home, Work or any frequent destination</Text>
            </View>
          }
        />
      )}

      {/* Add place bottom sheet */}
      {showAdd && (
        <View style={[s.sheet, { backgroundColor: colors.white }]}>
          <View style={s.sheetHeader}>
            <Text style={[s.sheetTitle, { color: colors.text }]}>Add Saved Place</Text>
            <TouchableOpacity onPress={() => setShowAdd(false)}>
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <Text style={s.fieldLabel}>Label</Text>
          <TextInput
            style={[s.input, { color: colors.text, borderColor: colors.gray200 }]}
            placeholder="e.g. Home, Office..."
            placeholderTextColor={colors.gray400}
            value={form.label}
            onChangeText={(v) => setForm((f) => ({ ...f, label: v }))}
          />

          <Text style={s.fieldLabel}>Type</Text>
          <View style={s.typeRow}>
            {PLACE_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[s.typeChip, form.type === t && { borderColor: PLACE_COLORS[t], backgroundColor: PLACE_COLORS[t] + '15' }]}
                onPress={() => setForm((f) => ({ ...f, type: t }))}
              >
                <Ionicons name={PLACE_ICONS[t]} size={14} color={form.type === t ? PLACE_COLORS[t] : colors.textSecondary} />
                <Text style={[s.typeChipText, { color: form.type === t ? PLACE_COLORS[t] : colors.textSecondary }]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.fieldLabel}>Address</Text>
          <TextInput
            style={[s.input, { color: colors.text, borderColor: colors.gray200 }]}
            placeholder="Enter full address..."
            placeholderTextColor={colors.gray400}
            value={form.address}
            onChangeText={(v) => setForm((f) => ({ ...f, address: v }))}
          />

          <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.primary }]} onPress={savePlace}>
            <Text style={s.saveBtnText}>Save Place</Text>
          </TouchableOpacity>
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
    card: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
    },
    placeIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    placeLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
    placeAddress: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    useBtn: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1.5, borderColor: colors.primary },
    useBtnText: { fontSize: 12, fontWeight: '700' },
    empty: { alignItems: 'center', paddingTop: 80, gap: spacing.sm },
    emptyText: { fontSize: 15, fontWeight: '600', color: colors.text },
    emptySubText: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: spacing.xl },
    sheet: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
      padding: spacing.md, paddingBottom: spacing.xl,
      shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 10,
    },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
    sheetTitle: { fontSize: 16, fontWeight: '800' },
    fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 6, marginTop: spacing.sm },
    input: {
      borderWidth: 1, borderRadius: radius.md, padding: spacing.sm,
      fontSize: 14, marginBottom: 4,
    },
    typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    typeChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      borderWidth: 1, borderColor: colors.gray200, borderRadius: radius.pill,
      paddingHorizontal: 10, paddingVertical: 5,
    },
    typeChipText: { fontSize: 11, fontWeight: '600' },
    saveBtn: { borderRadius: radius.pill, padding: spacing.md, alignItems: 'center', marginTop: spacing.md },
    saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  });
}
