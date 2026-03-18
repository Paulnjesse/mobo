import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../theme';

const ROLES = [
  {
    key: 'rider',
    icon: 'walk-outline',
    title: 'I need rides',
    subtitle: 'Book rides around the city',
    emoji: '🧍',
  },
  {
    key: 'driver',
    icon: 'car-outline',
    title: 'I want to drive',
    subtitle: 'Earn money driving passengers',
    emoji: '🚗',
  },
  {
    key: 'fleet_owner',
    icon: 'car-sport-outline',
    title: 'I own a fleet',
    subtitle: 'Manage 5–15 vehicles per fleet',
    emoji: '🚙',
  },
];

export default function RoleSelectionScreen({ navigation }) {
  const [selectedRole, setSelectedRole] = useState(null);

  const handleContinue = () => {
    if (!selectedRole) return;
    if (selectedRole === 'rider') {
      navigation.navigate('RiderRegister');
    } else if (selectedRole === 'driver') {
      navigation.navigate('DriverRegister');
    } else if (selectedRole === 'fleet_owner') {
      navigation.navigate('FleetOwnerRegister');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#1A1A1A" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>How will you use MOBO?</Text>
        <Text style={styles.subtitle}>Choose your account type</Text>

        <View style={styles.cardsContainer}>
          {ROLES.map((role) => {
            const isSelected = selectedRole === role.key;
            return (
              <TouchableOpacity
                key={role.key}
                style={[styles.card, isSelected && styles.cardSelected]}
                onPress={() => setSelectedRole(role.key)}
                activeOpacity={0.85}
              >
                {/* Left: Icon */}
                <View style={[styles.iconWrap, isSelected && styles.iconWrapSelected]}>
                  <Text style={styles.emoji}>{role.emoji}</Text>
                </View>

                {/* Center: Text */}
                <View style={styles.cardText}>
                  <Text style={[styles.cardTitle, isSelected && styles.cardTitleSelected]}>
                    {role.title}
                  </Text>
                  <Text style={[styles.cardSubtitle, isSelected && styles.cardSubtitleSelected]}>
                    {role.subtitle}
                  </Text>
                </View>

                {/* Right: Checkmark */}
                <View style={[styles.checkCircle, isSelected && styles.checkCircleSelected]}>
                  {isSelected && (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Continue Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueButton, !selectedRole && styles.continueButtonDisabled]}
          onPress={handleContinue}
          activeOpacity={selectedRole ? 0.88 : 1}
          disabled={!selectedRole}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F6F6F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: spacing.xs,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginBottom: spacing.xl,
    fontWeight: '400',
  },
  cardsContainer: {
    gap: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: spacing.md + 2,
    borderWidth: 2,
    borderColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255,0,191,0.03)',
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#F6F6F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  iconWrapSelected: {
    backgroundColor: 'rgba(255,0,191,0.1)',
  },
  emoji: {
    fontSize: 26,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  cardTitleSelected: {
    color: colors.primary,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#888',
    fontWeight: '400',
    lineHeight: 18,
  },
  cardSubtitleSelected: {
    color: 'rgba(255,0,191,0.7)',
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  checkCircleSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    backgroundColor: '#fff',
  },
  continueButton: {
    backgroundColor: colors.primary,
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  continueButtonDisabled: {
    backgroundColor: '#E0E0E0',
    shadowOpacity: 0,
    elevation: 0,
  },
  continueButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
});
