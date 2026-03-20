import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Alert,
  Clipboard,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme';
import api from '../services/api';

export default function ShareTripScreen({ navigation, route }) {
  const { rideId } = route.params || {};
  const [shareUrl, setShareUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    generateShareLink();
  }, []);

  const generateShareLink = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post(`/rides/${rideId}/share`);
      const url = res.data?.share_url || res.data?.url || res.data?.link;
      if (!url) throw new Error('No share link returned from server.');
      setShareUrl(url);
    } catch (err) {
      setError(err.message || 'Failed to generate share link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!shareUrl) return;
    Clipboard.setString(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShare = async () => {
    if (!shareUrl) return;
    try {
      await Share.share({
        message: `Track my MOBO ride in real-time: ${shareUrl}`,
        url: Platform.OS === 'ios' ? shareUrl : undefined,
        title: 'Track my MOBO ride',
      });
    } catch (err) {
      if (err.message !== 'The user dismissed the dialog') {
        Alert.alert('Share failed', err.message);
      }
    }
  };

  const handleDone = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <View style={{ width: 40 }} />
        <Text style={styles.headerTitle}>Share Trip</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={handleDone} activeOpacity={0.7}>
          <Ionicons name="close" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* Hero icon */}
        <View style={styles.heroIconWrap}>
          <Ionicons name="share-social" size={48} color="#3B82F6" />
        </View>

        <Text style={styles.title}>Share Your Trip</Text>
        <Text style={styles.subtitle}>
          Anyone with this link can follow your real-time location until the ride ends.
        </Text>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Generating share link...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={28} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={generateShareLink} activeOpacity={0.8}>
              <Text style={styles.retryBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* URL box */}
            <View style={styles.urlBox}>
              <Ionicons name="link-outline" size={18} color="#3B82F6" style={{ flexShrink: 0 }} />
              <Text style={styles.urlText} numberOfLines={2} ellipsizeMode="middle">
                {shareUrl}
              </Text>
              <TouchableOpacity
                style={[styles.copyBtn, copied && styles.copyBtnActive]}
                onPress={handleCopy}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={copied ? 'checkmark' : 'copy-outline'}
                  size={18}
                  color={copied ? colors.success : '#3B82F6'}
                />
              </TouchableOpacity>
            </View>

            {copied && (
              <Text style={styles.copiedHint}>Link copied to clipboard!</Text>
            )}

            {/* Expiry note */}
            <View style={styles.infoNote}>
              <Ionicons name="time-outline" size={15} color={colors.textSecondary} />
              <Text style={styles.infoNoteText}>
                This link expires when your ride ends
              </Text>
            </View>

            {/* Share button */}
            <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.85}>
              <Ionicons name="share-social-outline" size={20} color={colors.white} />
              <Text style={styles.shareBtnText}>Share Now</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Done button */}
        <TouchableOpacity style={styles.doneBtn} onPress={handleDone} activeOpacity={0.8}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>

        {/* Privacy note */}
        <View style={styles.privacyNote}>
          <Ionicons name="shield-checkmark-outline" size={14} color={colors.textLight} />
          <Text style={styles.privacyText}>
            Your personal details are never shared. Only your real-time location is visible.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    alignItems: 'center',
  },
  heroIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(59,130,246,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.4,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  loadingBox: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
  },
  loadingText: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  errorBox: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: 'rgba(227,24,55,0.06)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(227,24,55,0.2)',
  },
  errorText: {
    fontSize: 14,
    color: colors.danger,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 20,
  },
  retryBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
  },
  retryBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },
  urlBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
    backgroundColor: 'rgba(59,130,246,0.06)',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(59,130,246,0.2)',
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  urlText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#3B82F6',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  copyBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(59,130,246,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyBtnActive: { backgroundColor: 'rgba(0,166,81,0.1)' },
  copiedHint: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.success,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xl,
    alignSelf: 'flex-start',
  },
  infoNoteText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    width: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: radius.pill,
    paddingVertical: 15,
    marginBottom: spacing.md,
    ...shadows.md,
  },
  shareBtnText: { fontSize: 16, fontWeight: '800', color: colors.white },
  doneBtn: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: colors.gray300,
    marginBottom: spacing.lg,
  },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: colors.text },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  privacyText: {
    flex: 1,
    fontSize: 12,
    color: colors.textLight,
    lineHeight: 16,
    fontWeight: '400',
  },
});
