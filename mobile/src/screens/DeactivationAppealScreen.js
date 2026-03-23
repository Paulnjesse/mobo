import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { colors, spacing, radius, shadows } from '../theme';

export default function DeactivationAppealScreen({ navigation, route }) {
  const { reason = 'Violation of community guidelines' } = route.params || {};
  const [appealText, setAppealText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (appealText.trim().length < 20) {
      Alert.alert('More Details Needed', 'Please provide a more detailed explanation for your appeal (at least 20 characters).');
      return;
    }
    
    setLoading(true);
    try {
      await api.post('/users/appeal', { reason: appealText });
      Alert.alert(
        'Appeal Submitted',
        'Our trust and safety team will review your account and notify you within 24-48 hours.',
        [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
      );
    } catch (err) {
      Alert.alert('Submission Failed', err.message || 'There was an error submitting your appeal. Please try again later.');
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
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account Review</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.container}
      >
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons name="shield-outline" size={48} color={colors.danger} />
          </View>
          
          <Text style={styles.title}>Your account is suspended</Text>
          <Text style={styles.subtitle}>
            You cannot currently go online because your account was flagged for:
          </Text>
          <View style={styles.reasonBox}>
            <Text style={styles.reasonText}>{reason}</Text>
          </View>

          <Text style={styles.instruction}>
            If you believe this was an error or would like to submit additional information for our human review team, please explain below.
          </Text>

          <TextInput
            style={styles.textInput}
            multiline
            numberOfLines={6}
            placeholder="Tell us what happened..."
            placeholderTextColor={colors.textLight}
            value={appealText}
            onChangeText={setAppealText}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.footer}>
          <TouchableOpacity 
            style={[styles.submitBtn, (!appealText.trim() || loading) && styles.submitBtnDisabled]} 
            onPress={handleSubmit}
            disabled={!appealText.trim() || loading}
            activeOpacity={0.88}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.submitBtnText}>Submit Appeal</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  container: { flex: 1 },
  content: { flex: 1, padding: spacing.xl, alignItems: 'center' },
  iconContainer: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(227,24,55,0.1)',
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: spacing.md },
  subtitle: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  reasonBox: {
    backgroundColor: colors.white, paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger,
    marginTop: spacing.md, marginBottom: spacing.xl, ...shadows.sm,
  },
  reasonText: { fontSize: 15, fontWeight: '700', color: colors.danger, textAlign: 'center' },
  instruction: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg, lineHeight: 20 },
  textInput: {
    width: '100%', backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.gray300, padding: spacing.md,
    fontSize: 15, color: colors.text, minHeight: 120,
    ...shadows.sm,
  },
  footer: { padding: spacing.lg, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.gray200 },
  submitBtn: {
    height: 54, borderRadius: radius.pill, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  submitBtnDisabled: { opacity: 0.5, shadowOpacity: 0 },
  submitBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
