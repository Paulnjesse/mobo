import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  StatusBar,
  FlatList,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme';

const RIDE_TYPES = [
  { type: 'Standard', icon: 'car-outline', price: 1500 },
  { type: 'Comfort', icon: 'car-sport-outline', price: 2500 },
  { type: 'Luxury', icon: 'diamond-outline', price: 5000 },
  { type: 'Shared', icon: 'people-outline', price: 900 },
];

const MOCK_SCHEDULED = [
  {
    id: '1',
    pickup: 'Bastos, Yaoundé',
    dropoff: 'Aéroport International de Yaoundé-Nsimalen',
    date: 'Fri, Mar 20',
    time: '08:00',
    rideType: 'Comfort',
    fare: 4500,
    status: 'upcoming',
  },
  {
    id: '2',
    pickup: 'Centre-Ville, Yaoundé',
    dropoff: 'Université de Yaoundé I',
    date: 'Sat, Mar 21',
    time: '09:30',
    rideType: 'Standard',
    fare: 1200,
    status: 'upcoming',
  },
];

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

export default function ScheduledRideScreen({ navigation }) {
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedHour, setSelectedHour] = useState('09');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedRideType, setSelectedRideType] = useState('Standard');
  const [scheduledRides, setScheduledRides] = useState(MOCK_SCHEDULED);
  const [loading, setLoading] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Generate next 7 days
  const getDays = () => {
    const days = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const value = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      days.push({ label, value, date: d });
    }
    return days;
  };

  const days = getDays();

  useEffect(() => {
    setSelectedDate(days[0].value);
  }, []);

  const handleSchedule = () => {
    if (!pickup.trim()) {
      Alert.alert('Missing pickup', 'Please enter a pickup location.');
      return;
    }
    if (!dropoff.trim()) {
      Alert.alert('Missing dropoff', 'Please enter a dropoff location.');
      return;
    }
    if (!selectedDate) {
      Alert.alert('Missing date', 'Please select a date.');
      return;
    }
    setLoading(true);
    const rideType = RIDE_TYPES.find((r) => r.type === selectedRideType);
    const newRide = {
      id: String(Date.now()),
      pickup,
      dropoff,
      date: selectedDate,
      time: `${selectedHour}:${selectedMinute}`,
      rideType: selectedRideType,
      fare: rideType?.price || 1500,
      status: 'upcoming',
    };
    setTimeout(() => {
      setScheduledRides((prev) => [newRide, ...prev]);
      setLoading(false);
      setPickup('');
      setDropoff('');
      Alert.alert('Ride Scheduled!', `Your ${selectedRideType} ride on ${selectedDate} at ${selectedHour}:${selectedMinute} has been scheduled.`);
    }, 1200);
  };

  const handleCancel = (rideId) => {
    Alert.alert(
      'Cancel Scheduled Ride',
      'Are you sure you want to cancel this scheduled ride?',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Ride',
          style: 'destructive',
          onPress: () => {
            setScheduledRides((prev) => prev.filter((r) => r.id !== rideId));
          },
        },
      ]
    );
  };

  const renderScheduledRide = ({ item }) => (
    <View style={styles.scheduledCard}>
      <View style={styles.scheduledCardTop}>
        <View style={styles.scheduledDateBadge}>
          <Ionicons name="calendar-outline" size={14} color={colors.primary} />
          <Text style={styles.scheduledDate}>{item.date}</Text>
          <Text style={styles.scheduledTime}>{item.time}</Text>
        </View>
        <View style={styles.rideTypePill}>
          <Text style={styles.rideTypePillText}>{item.rideType}</Text>
        </View>
      </View>

      <View style={styles.locationRow}>
        <View style={styles.locationDots}>
          <View style={styles.dotGreen} />
          <View style={styles.locationLine} />
          <View style={styles.dotPink} />
        </View>
        <View style={styles.locationTexts}>
          <Text style={styles.locationText} numberOfLines={1}>{item.pickup}</Text>
          <Text style={styles.locationText} numberOfLines={1}>{item.dropoff}</Text>
        </View>
      </View>

      <View style={styles.scheduledCardBottom}>
        <Text style={styles.scheduledFare}>{item.fare.toLocaleString()} XAF</Text>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => handleCancel(item.id)}
          activeOpacity={0.7}
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Schedule a Ride</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Booking Card */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Where to?</Text>

          {/* Pickup */}
          <View style={styles.inputRow}>
            <View style={styles.dotGreenLg} />
            <TextInput
              style={styles.input}
              placeholder="Pickup location"
              placeholderTextColor={colors.textLight}
              value={pickup}
              onChangeText={setPickup}
            />
          </View>

          <View style={styles.inputDivider} />

          {/* Dropoff */}
          <View style={styles.inputRow}>
            <View style={styles.dotPinkLg} />
            <TextInput
              style={styles.input}
              placeholder="Dropoff location"
              placeholderTextColor={colors.textLight}
              value={dropoff}
              onChangeText={setDropoff}
            />
          </View>
        </View>

        {/* Date Picker */}
        <View style={[styles.card, { marginTop: spacing.sm }]}>
          <Text style={styles.sectionLabel}>Select Date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.daysScroll}>
            {days.map((day) => (
              <TouchableOpacity
                key={day.value}
                style={[styles.dayChip, selectedDate === day.value && styles.dayChipSelected]}
                onPress={() => setSelectedDate(day.value)}
                activeOpacity={0.8}
              >
                <Text style={[styles.dayChipText, selectedDate === day.value && styles.dayChipTextSelected]}>
                  {day.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Time Picker */}
        <View style={[styles.card, { marginTop: spacing.sm }]}>
          <Text style={styles.sectionLabel}>Select Time</Text>
          <TouchableOpacity
            style={styles.timeSelector}
            onPress={() => setShowTimePicker(!showTimePicker)}
            activeOpacity={0.8}
          >
            <Ionicons name="time-outline" size={20} color={colors.primary} />
            <Text style={styles.timeSelectorText}>{selectedHour}:{selectedMinute}</Text>
            <Ionicons
              name={showTimePicker ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {showTimePicker && (
            <View style={styles.timePickerRow}>
              <View style={styles.timeColumn}>
                <Text style={styles.timeColumnLabel}>Hour</Text>
                <ScrollView style={styles.timeScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                  {HOURS.map((h) => (
                    <TouchableOpacity
                      key={h}
                      style={[styles.timeOption, selectedHour === h && styles.timeOptionSelected]}
                      onPress={() => setSelectedHour(h)}
                    >
                      <Text style={[styles.timeOptionText, selectedHour === h && styles.timeOptionTextSelected]}>
                        {h}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <Text style={styles.colonSep}>:</Text>
              <View style={styles.timeColumn}>
                <Text style={styles.timeColumnLabel}>Min</Text>
                <ScrollView style={styles.timeScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                  {MINUTES.map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.timeOption, selectedMinute === m && styles.timeOptionSelected]}
                      onPress={() => setSelectedMinute(m)}
                    >
                      <Text style={[styles.timeOptionText, selectedMinute === m && styles.timeOptionTextSelected]}>
                        {m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          )}
        </View>

        {/* Ride Type */}
        <View style={[styles.card, { marginTop: spacing.sm }]}>
          <Text style={styles.sectionLabel}>Ride Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rideTypeScroll}>
            {RIDE_TYPES.map((rt) => (
              <TouchableOpacity
                key={rt.type}
                style={[styles.rideTypeChip, selectedRideType === rt.type && styles.rideTypeChipSelected]}
                onPress={() => setSelectedRideType(rt.type)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={rt.icon}
                  size={22}
                  color={selectedRideType === rt.type ? colors.white : colors.text}
                />
                <Text style={[styles.rideTypeChipName, selectedRideType === rt.type && styles.rideTypeChipNameSelected]}>
                  {rt.type}
                </Text>
                <Text style={[styles.rideTypeChipPrice, selectedRideType === rt.type && styles.rideTypeChipPriceSelected]}>
                  {rt.price.toLocaleString()} XAF
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Schedule Button */}
        <TouchableOpacity
          style={[styles.scheduleBtn, loading && styles.scheduleBtnDisabled]}
          onPress={handleSchedule}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons name="calendar-outline" size={20} color={colors.white} />
              <Text style={styles.scheduleBtnText}>Schedule Ride</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Upcoming Scheduled Rides */}
        {scheduledRides.length > 0 && (
          <View style={styles.upcomingSection}>
            <Text style={styles.upcomingTitle}>Upcoming Rides ({scheduledRides.length})</Text>
            {scheduledRides.map((item) => (
              <View key={item.id}>
                {renderScheduledRide({ item })}
              </View>
            ))}
          </View>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  scrollContent: { padding: spacing.md },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
    paddingVertical: 6,
  },
  inputDivider: {
    height: 1,
    backgroundColor: colors.gray200,
    marginLeft: 28,
  },
  dotGreenLg: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#00A651',
  },
  dotPinkLg: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  daysScroll: { marginHorizontal: -4 },
  dayChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    backgroundColor: colors.white,
    marginHorizontal: 4,
  },
  dayChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  dayChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  dayChipTextSelected: {
    color: colors.white,
  },
  timeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  timeSelectorText: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  timePickerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  timeColumn: { alignItems: 'center' },
  timeColumnLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  timeScroll: { height: 160, width: 60 },
  timeOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  timeOptionSelected: { backgroundColor: colors.primary },
  timeOptionText: { fontSize: 16, fontWeight: '600', color: colors.text },
  timeOptionTextSelected: { color: colors.white },
  colonSep: { fontSize: 24, fontWeight: '700', color: colors.text, paddingTop: 28 },
  rideTypeScroll: { marginHorizontal: -4 },
  rideTypeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    backgroundColor: colors.white,
    marginHorizontal: 4,
    alignItems: 'center',
    minWidth: 90,
    gap: 4,
  },
  rideTypeChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  rideTypeChipName: { fontSize: 13, fontWeight: '700', color: colors.text },
  rideTypeChipNameSelected: { color: colors.white },
  rideTypeChipPrice: { fontSize: 11, fontWeight: '500', color: colors.textSecondary },
  rideTypeChipPriceSelected: { color: 'rgba(255,255,255,0.85)' },
  scheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 16,
    marginTop: spacing.md,
    ...shadows.md,
  },
  scheduleBtnDisabled: { opacity: 0.6 },
  scheduleBtnText: { fontSize: 16, fontWeight: '800', color: colors.white, letterSpacing: -0.2 },
  upcomingSection: { marginTop: spacing.lg },
  upcomingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.md,
    letterSpacing: -0.3,
  },
  scheduledCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  scheduledCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  scheduledDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  scheduledDate: { fontSize: 13, fontWeight: '600', color: colors.text },
  scheduledTime: { fontSize: 13, fontWeight: '700', color: colors.primary },
  rideTypePill: {
    backgroundColor: 'rgba(255,0,191,0.1)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  rideTypePillText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  locationDots: { alignItems: 'center', width: 12 },
  dotGreen: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
  },
  locationLine: {
    width: 2,
    height: 24,
    backgroundColor: colors.gray300,
    marginVertical: 2,
  },
  dotPink: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  locationTexts: { flex: 1, gap: 18 },
  locationText: { fontSize: 13, fontWeight: '500', color: colors.text },
  scheduledCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
    paddingTop: spacing.sm,
  },
  scheduledFare: { fontSize: 16, fontWeight: '800', color: colors.text },
  cancelBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(227,24,55,0.3)',
  },
  cancelBtnText: { fontSize: 13, fontWeight: '700', color: colors.danger },
});
