import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, shadows } from '../theme';

export default function DriverRatingFilterScreen({ navigation }) {
  const { user } = useAuth();
  const [filterEnabled, setFilterEnabled] = useState(false);
  const [minRating, setMinRating] = useState(4.5);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If we had preferences saved in user context
    if (user?.preferences?.minRiderRating) {
      setFilterEnabled(true);
      setMinRating(user.preferences.minRiderRating);
    }
  }, [user]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const payload = {
        minRiderRating: filterEnabled ? minRating : null,
      };
      // In a real app, this would update the driver's preferences in the backend
      await api.put('/users/profile', { preferences: payload });
      Alert.alert('Saved', 'Your trip radar and requests will now filter riders based on this rating.');
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not save preferences');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rider Rating Filter</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark" size={32} color={colors.primary} />
          <Text style={styles.infoTitle}>Control who you drive</Text>
          <Text style={styles.infoDesc}>
            Only receive requests from riders who meet your minimum rating standard. High-rated riders tend to be more respectful and punctual.
          </Text>
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Filter by Rating</Text>
            <Text style={styles.settingSub}>On / Off</Text>
          </View>
          <Switch
            value={filterEnabled}
            onValueChange={setFilterEnabled}
            trackColor={{ false: colors.gray300, true: colors.primary + '80' }}
            thumbColor={filterEnabled ? colors.primary : colors.white}
          />
        </View>

        {filterEnabled && (
          <View style={styles.sliderContainer}>
            <View style={styles.sliderHeader}>
              <Text style={styles.sliderLabel}>Minimum Rating</Text>
              <View style={styles.ratingBadge}>
                <Ionicons name="star" size={14} color={colors.warning} />
                <Text style={styles.ratingValue}>{minRating.toFixed(1)}</Text>
              </View>
            </View>
            <Slider
              style={{ width: '100%', height: 40 }}
              minimumValue={3.0}
              maximumValue={5.0}
              step={0.1}
              value={minRating}
              onValueChange={setMinRating}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.gray300}
              thumbTintColor={colors.primary}
            />
            <View style={styles.sliderLabelsRow}>
              <Text style={styles.sliderBound}>3.0</Text>
              <Text style={styles.sliderBound}>5.0</Text>
            </View>
            
            <View style={styles.warningBox}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.warningText}>
                Setting this too high (e.g., above 4.8) may significantly reduce the number of trip requests you receive.
              </Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.saveBtn} 
          onPress={handleSave} 
          disabled={loading}
          activeOpacity={0.88}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.saveBtnText}>Save Preferences</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.md,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.gray200,
  },
  backBtn: { padding: spacing.xs, marginLeft: -spacing.xs },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: colors.text },
  headerSpacer: { width: 32 },
  content: { flex: 1, padding: spacing.md },
  infoCard: {
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg,
    alignItems: 'center', marginBottom: spacing.lg, ...shadows.sm,
  },
  infoTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: spacing.md, marginBottom: spacing.xs },
  infoDesc: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.white, padding: spacing.md, borderRadius: radius.lg, ...shadows.sm,
  },
  settingInfo: { flex: 1 },
  settingLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  settingSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  sliderContainer: {
    backgroundColor: colors.white, padding: spacing.md, borderRadius: radius.lg,
    marginTop: spacing.md, ...shadows.sm,
  },
  sliderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  sliderLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  ratingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,140,0,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  ratingValue: { fontSize: 15, fontWeight: '700', color: colors.warning },
  sliderLabelsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10 },
  sliderBound: { fontSize: 12, color: colors.textLight, fontWeight: '600' },
  warningBox: {
    flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.surface,
    padding: spacing.sm, borderRadius: radius.md, marginTop: spacing.lg,
  },
  warningText: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  footer: { padding: spacing.md, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.gray200 },
  saveBtn: {
    backgroundColor: colors.primary, height: 54, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  saveBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
