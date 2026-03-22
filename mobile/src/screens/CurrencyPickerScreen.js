/**
 * CurrencyPickerScreen — lets users choose their country & currency.
 * Accessible from Settings or Profile screen.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, TextInput, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useCurrency, AFRICAN_COUNTRIES } from '../context/CurrencyContext';
import { spacing, radius, shadows } from '../theme';

export default function CurrencyPickerScreen({ navigation }) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const { country: activeCountry, changeCountry } = useCurrency();
  const [query, setQuery] = useState('');

  const filtered = AFRICAN_COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.currency.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = async (c) => {
    await changeCountry(c.code);
    navigation.goBack();
  };

  const renderItem = ({ item }) => {
    const isActive = item.code === activeCountry.code;
    return (
      <TouchableOpacity
        style={[s.row, isActive && s.rowActive]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.8}
      >
        <Text style={s.flag}>{item.flag}</Text>
        <View style={s.rowInfo}>
          <Text style={[s.countryName, isActive && { color: colors.primary }]}>{item.name}</Text>
          <Text style={s.currencyLabel}>{item.currency} · {item.symbol}</Text>
        </View>
        {isActive && (
          <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle={colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Country & Currency</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Current selection banner */}
      <View style={[s.activeBanner, { backgroundColor: colors.primary + '15' }]}>
        <Text style={s.activeBannerFlag}>{activeCountry.flag}</Text>
        <View>
          <Text style={[s.activeBannerName, { color: colors.primary }]}>{activeCountry.name}</Text>
          <Text style={s.activeBannerCurrency}>{activeCountry.currency} — {activeCountry.symbol}</Text>
        </View>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={18} color={colors.gray400} />
        <TextInput
          style={[s.searchInput, { color: colors.text }]}
          placeholder="Search country or currency..."
          placeholderTextColor={colors.gray400}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={16} color={colors.gray400} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.code}
        renderItem={renderItem}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={s.separator} />}
        ListEmptyComponent={
          <Text style={s.empty}>No countries found for "{query}"</Text>
        }
      />
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

    activeBanner: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      marginHorizontal: spacing.md, marginTop: spacing.md,
      borderRadius: radius.lg, padding: spacing.md,
    },
    activeBannerFlag: { fontSize: 32 },
    activeBannerName: { fontSize: 15, fontWeight: '800' },
    activeBannerCurrency: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

    searchWrap: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: colors.gray100, borderRadius: radius.md,
      marginHorizontal: spacing.md, marginVertical: spacing.md,
      paddingHorizontal: spacing.md, height: 44,
    },
    searchInput: { flex: 1, fontSize: 14 },

    list: { paddingHorizontal: spacing.md, paddingBottom: 40 },
    separator: { height: 1, backgroundColor: colors.gray100 },

    row: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      paddingVertical: spacing.md, borderRadius: radius.md,
    },
    rowActive: { backgroundColor: colors.primary + '08' },
    flag: { fontSize: 26, width: 36, textAlign: 'center' },
    rowInfo: { flex: 1 },
    countryName: { fontSize: 15, fontWeight: '600', color: colors.text },
    currencyLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },

    empty: { textAlign: 'center', color: colors.textSecondary, marginTop: 40, fontSize: 14 },
  });
}
