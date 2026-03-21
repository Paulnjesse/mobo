import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Switch,
  StyleSheet,
  Alert,
  Linking,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import api from '../services/api';

// ─── helpers ─────────────────────────────────────────────────────────────────

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${pad(m)}:${pad(s)}`;
}

// ─── pulsing dot ─────────────────────────────────────────────────────────────

function PulsingDot() {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.5, duration: 700, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
          Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 700, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
          Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [scale, opacity]);

  return (
    <Animated.View
      style={[
        styles.dot,
        { transform: [{ scale }], opacity },
      ]}
    />
  );
}

// ─── main component ──────────────────────────────────────────────────────────

/**
 * AudioRecordingToggle
 *
 * Props:
 *   rideId              {string}    — current ride ID
 *   onRecordingComplete {function}  — called when ride ends externally; triggers save
 */
export default function AudioRecordingToggle({ rideId, onRecordingComplete }) {
  const [enabled, setEnabled] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle | recording | saving | saved | error
  const [duration, setDuration] = useState(0);     // seconds elapsed
  const [errorMsg, setErrorMsg] = useState('');

  const recordingRef = useRef(null);   // expo-av Recording instance
  const startTimeRef = useRef(null);   // Date.now() when recording started
  const timerRef = useRef(null);       // setInterval id

  // ─── cleanup on unmount / ride end ──
  const stopAndSave = useCallback(async () => {
    if (recordingRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      setPhase('saving');
      try {
        await recordingRef.current.stopAndUnloadAsync();
        const uri = recordingRef.current.getURI();
        const elapsed = startTimeRef.current
          ? Math.round((Date.now() - startTimeRef.current) / 1000)
          : 0;
        recordingRef.current = null;

        if (rideId && uri) {
          await api.post(`/rides/${rideId}/recording`, {
            storage_url: uri,
            duration_sec: elapsed,
            role: 'rider',
          });
        }
        setPhase('saved');
      } catch (err) {
        console.warn('[AudioRecordingToggle] save error:', err);
        setPhase('error');
        setErrorMsg('Failed to save recording.');
      }
    }
  }, [rideId]);

  // Allow parent to trigger save via onRecordingComplete prop
  useEffect(() => {
    // We expose stopAndSave through the prop callback if the parent calls it
    if (typeof onRecordingComplete === 'function') {
      onRecordingComplete.currentSave = stopAndSave;
    }
  }, [onRecordingComplete, stopAndSave]);

  // Auto-stop on unmount
  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        clearInterval(timerRef.current);
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  // ─── toggle handler ──────────────────────────────────────────────────────

  const handleToggle = async (value) => {
    setErrorMsg('');

    if (value) {
      // ── Turning ON ──
      // 1. Request microphone permission
      let permStatus;
      try {
        permStatus = await Audio.requestPermissionsAsync();
      } catch {
        permStatus = { granted: false };
      }

      if (!permStatus.granted) {
        Alert.alert(
          'Microphone Access Required',
          'MOBO needs microphone access to record for safety. Please enable it in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return; // Don't toggle ON
      }

      // 2. Configure audio session
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
      } catch (err) {
        console.warn('[AudioRecordingToggle] setAudioMode error:', err);
      }

      // 3. Start recording
      try {
        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        recordingRef.current = recording;
        startTimeRef.current = Date.now();
        setDuration(0);
        setPhase('recording');
        setEnabled(true);

        timerRef.current = setInterval(() => {
          setDuration(Math.round((Date.now() - startTimeRef.current) / 1000));
        }, 1000);
      } catch (err) {
        console.warn('[AudioRecordingToggle] start error:', err);
        setPhase('error');
        setErrorMsg('Could not start recording. Please try again.');
        return;
      }
    } else {
      // ── Turning OFF ──
      setEnabled(false);
      await stopAndSave();
    }
  };

  // ─── render ──────────────────────────────────────────────────────────────

  const isRecording = phase === 'recording';
  const isSaving = phase === 'saving';
  const isSaved = phase === 'saved';

  return (
    <View style={styles.wrapper}>
      {/* Main row */}
      <View style={[styles.row, isRecording && styles.rowActive]}>
        {/* Mic icon */}
        <View style={[styles.iconWrap, isRecording && styles.iconWrapActive]}>
          <Ionicons
            name={isRecording ? 'mic' : 'mic-outline'}
            size={22}
            color={isRecording ? '#E94560' : '#666'}
          />
        </View>

        {/* Label / status */}
        <View style={styles.labelWrap}>
          {isRecording ? (
            <View style={styles.recordingRow}>
              <PulsingDot />
              <Text style={styles.recordingLabel}>Recording...</Text>
              <Text style={styles.durationText}>{formatDuration(duration)}</Text>
            </View>
          ) : isSaving ? (
            <View style={styles.recordingRow}>
              <ActivityIndicator size="small" color="#1A1A2E" />
              <Text style={styles.savingLabel}>Saving...</Text>
            </View>
          ) : isSaved ? (
            <View style={styles.recordingRow}>
              <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
              <Text style={styles.savedLabel}>Saved for 30 days</Text>
            </View>
          ) : (
            <Text style={styles.label}>Record for safety</Text>
          )}
        </View>

        {/* Toggle switch — disabled while saving */}
        <Switch
          value={enabled}
          onValueChange={handleToggle}
          disabled={isSaving}
          trackColor={{ false: '#ddd', true: 'rgba(233,69,96,0.3)' }}
          thumbColor={enabled ? '#E94560' : '#f5f5f5'}
          ios_backgroundColor="#ddd"
        />
      </View>

      {/* Privacy note */}
      <View style={styles.privacyRow}>
        <Ionicons name="lock-closed-outline" size={12} color="rgba(0,0,0,0.35)" />
        <Text style={styles.privacyText}>
          Recording is encrypted and only accessible for dispute resolution
        </Text>
      </View>

      {/* Error message */}
      {(phase === 'error' || errorMsg) && (
        <View style={styles.errorRow}>
          <Ionicons name="warning-outline" size={14} color="#E94560" />
          <Text style={styles.errorText}>{errorMsg || 'An error occurred.'}</Text>
        </View>
      )}
    </View>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    gap: 10,
  },
  rowActive: {
    backgroundColor: 'rgba(233,69,96,0.04)',
    borderColor: 'rgba(233,69,96,0.2)',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: 'rgba(233,69,96,0.12)',
  },
  labelWrap: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E94560',
  },
  recordingLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E94560',
  },
  durationText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E94560',
    fontVariant: ['tabular-nums'],
  },
  savingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A2E',
    marginLeft: 6,
  },
  savedLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  privacyText: {
    fontSize: 11,
    color: 'rgba(0,0,0,0.4)',
    flex: 1,
    lineHeight: 15,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#E94560',
    fontWeight: '500',
  },
});
