/**
 * FoodDeliveryScreen — restaurant food delivery (Feature 1)
 * Tabs: Browse restaurants → View menu → Cart → Checkout
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, FlatList, Alert, ActivityIndicator, Image, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, shadows } from '../theme';
import api from '../services/api';

// ── helpers ──────────────────────────────────────────────────────────────────
function fmt(xaf) {
  return `${Number(xaf).toLocaleString()} XAF`;
}

// ── Category chips ────────────────────────────────────────────────────────────
const CATEGORIES = ['All', 'African', 'Burgers', 'Pizza', 'Italian', 'Fast Food', 'International'];

// ── Restaurant card ───────────────────────────────────────────────────────────
function RestaurantCard({ restaurant, onPress, colors }) {
  return (
    <TouchableOpacity style={[styles.restCard, { backgroundColor: colors.white }]} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.restLogo, { backgroundColor: colors.gray100 }]}>
        {restaurant.logo_url
          ? <Image source={{ uri: restaurant.logo_url }} style={styles.restLogoImg} />
          : <Ionicons name="restaurant" size={28} color={colors.gray400} />
        }
      </View>
      <View style={styles.restInfo}>
        <Text style={[styles.restName, { color: colors.text }]} numberOfLines={1}>{restaurant.name}</Text>
        <Text style={[styles.restCategory, { color: colors.textSecondary }]} numberOfLines={1}>{restaurant.category}</Text>
        <View style={styles.restMeta}>
          <Ionicons name="star" size={11} color="#F59E0B" />
          <Text style={[styles.restMetaText, { color: colors.text }]}>{Number(restaurant.avg_rating || 0).toFixed(1)}</Text>
          <Text style={[styles.restMetaDot, { color: colors.textSecondary }]}>·</Text>
          <Text style={[styles.restMetaText, { color: colors.textSecondary }]}>{fmt(restaurant.delivery_fee)} delivery</Text>
          {restaurant.distance_km && (
            <>
              <Text style={[styles.restMetaDot, { color: colors.textSecondary }]}>·</Text>
              <Text style={[styles.restMetaText, { color: colors.textSecondary }]}>{Number(restaurant.distance_km).toFixed(1)} km</Text>
            </>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.gray400} />
    </TouchableOpacity>
  );
}

// ── Menu item card ─────────────────────────────────────────────────────────────
function MenuItemCard({ item, qty, onAdd, onRemove, colors }) {
  return (
    <View style={[styles.menuCard, { backgroundColor: colors.white }]}>
      <View style={styles.menuInfo}>
        {item.is_popular && (
          <View style={styles.popularBadge}><Text style={styles.popularBadgeText}>Popular</Text></View>
        )}
        <Text style={[styles.menuName, { color: colors.text }]}>{item.name}</Text>
        {item.description && (
          <Text style={[styles.menuDesc, { color: colors.textSecondary }]} numberOfLines={2}>{item.description}</Text>
        )}
        <Text style={[styles.menuPrice, { color: colors.primary }]}>{fmt(item.price)}</Text>
      </View>
      <View style={styles.menuQtyCol}>
        {item.image_url && (
          <Image source={{ uri: item.image_url }} style={styles.menuImg} />
        )}
        <View style={styles.qtyRow}>
          {qty > 0 && (
            <TouchableOpacity style={[styles.qtyBtn, { borderColor: colors.primary }]} onPress={onRemove}>
              <Ionicons name="remove" size={16} color={colors.primary} />
            </TouchableOpacity>
          )}
          {qty > 0 && (
            <Text style={[styles.qtyText, { color: colors.text }]}>{qty}</Text>
          )}
          <TouchableOpacity style={[styles.qtyBtnAdd, { backgroundColor: colors.primary }]} onPress={onAdd}>
            <Ionicons name="add" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function FoodDeliveryScreen({ navigation }) {
  const { colors } = useTheme();

  // screen: 'list' | 'menu' | 'cart' | 'order'
  const [screen, setScreen] = useState('list');

  // Restaurant list
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchText, setSearchText] = useState('');

  // Selected restaurant + menu
  const [restaurant, setRestaurant] = useState(null);
  const [menu, setMenu] = useState([]);
  const [menuGrouped, setMenuGrouped] = useState({});
  const [loadingMenu, setLoadingMenu] = useState(false);

  // Cart: { [menu_item_id]: { item, qty } }
  const [cart, setCart] = useState({});

  // Checkout state
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [specialNote, setSpecialNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [submitting, setSubmitting] = useState(false);
  const [placedOrder, setPlacedOrder] = useState(null);

  // Load restaurants
  useEffect(() => {
    loadRestaurants();
  }, []);

  const loadRestaurants = async () => {
    setLoading(true);
    try {
      const res = await api.get('/food/restaurants');
      setRestaurants(res.data.restaurants || []);
    } catch {
      setRestaurants([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMenu = async (rest) => {
    setRestaurant(rest);
    setLoadingMenu(true);
    setScreen('menu');
    setCart({});
    try {
      const res = await api.get(`/food/restaurants/${rest.id}`);
      setMenu(res.data.menu || []);
      setMenuGrouped(res.data.menu_grouped || {});
    } catch {
      setMenu([]);
    } finally {
      setLoadingMenu(false);
    }
  };

  const addToCart = (item) => {
    setCart((prev) => ({
      ...prev,
      [item.id]: { item, qty: (prev[item.id]?.qty || 0) + 1 },
    }));
  };

  const removeFromCart = (item) => {
    setCart((prev) => {
      const qty = (prev[item.id]?.qty || 0) - 1;
      if (qty <= 0) { const next = { ...prev }; delete next[item.id]; return next; }
      return { ...prev, [item.id]: { item, qty } };
    });
  };

  const cartItems = Object.values(cart).filter((c) => c.qty > 0);
  const cartSubtotal = cartItems.reduce((s, c) => s + c.item.price * c.qty, 0);
  const cartTotal = cartSubtotal + (restaurant?.delivery_fee || 500);
  const cartCount = cartItems.reduce((s, c) => s + c.qty, 0);

  const handlePlaceOrder = async () => {
    if (!deliveryAddress.trim()) {
      Alert.alert('Delivery address required', 'Please enter your delivery address.');
      return;
    }
    setSubmitting(true);
    try {
      const items = cartItems.map((c) => ({
        menu_item_id: c.item.id,
        name: c.item.name,
        price: c.item.price,
        qty: c.qty,
      }));
      const res = await api.post('/food/orders', {
        restaurant_id: restaurant.id,
        items,
        delivery_address: deliveryAddress,
        payment_method: paymentMethod,
        special_note: specialNote.trim() || undefined,
      });
      setPlacedOrder(res.data.order);
      setScreen('order');
    } catch (err) {
      Alert.alert('Order failed', err.response?.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Filtered restaurants ────────────────────────────────────────────────────
  const filtered = restaurants.filter((r) => {
    const matchCat = selectedCategory === 'All' || r.category === selectedCategory;
    const matchSearch = !searchText || r.name.toLowerCase().includes(searchText.toLowerCase()) ||
      (r.category || '').toLowerCase().includes(searchText.toLowerCase());
    return matchCat && matchSearch;
  });

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.white }]}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              if (screen === 'list') navigation.goBack();
              else if (screen === 'menu') { setScreen('list'); setCart({}); }
              else if (screen === 'cart') setScreen('menu');
              else if (screen === 'order') { setScreen('list'); setCart({}); setPlacedOrder(null); }
            }}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {screen === 'list' ? 'Food Delivery'
              : screen === 'menu' ? (restaurant?.name || 'Menu')
              : screen === 'cart' ? 'Your Order'
              : 'Order Placed'}
          </Text>
          {screen === 'menu' && cartCount > 0 && (
            <TouchableOpacity style={[styles.cartBtn, { backgroundColor: colors.primary }]} onPress={() => setScreen('cart')}>
              <Ionicons name="cart" size={16} color="#fff" />
              <Text style={styles.cartBtnText}>{cartCount}</Text>
            </TouchableOpacity>
          )}
          {screen !== 'menu' && <View style={{ width: 44 }} />}
        </View>

        {/* ── RESTAURANT LIST ─────────────────────────────────────────── */}
        {screen === 'list' && (
          <>
            {/* Search bar */}
            <View style={[styles.searchWrap, { backgroundColor: colors.white }]}>
              <Ionicons name="search-outline" size={16} color={colors.gray400} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Search restaurants..."
                placeholderTextColor={colors.gray400}
                value={searchText}
                onChangeText={setSearchText}
              />
              {searchText ? (
                <TouchableOpacity onPress={() => setSearchText('')}>
                  <Ionicons name="close-circle" size={16} color={colors.gray400} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Category chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catContent}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catChip, selectedCategory === cat && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text style={[styles.catChipText, selectedCategory === cat && { color: '#fff' }]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Finding restaurants...</Text>
              </View>
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(r) => r.id}
                contentContainerStyle={{ padding: spacing.md, paddingTop: spacing.sm }}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.center}>
                    <Ionicons name="restaurant-outline" size={48} color={colors.gray300} />
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No restaurants found</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <RestaurantCard restaurant={item} onPress={() => loadMenu(item)} colors={colors} />
                )}
              />
            )}
          </>
        )}

        {/* ── MENU ────────────────────────────────────────────────────── */}
        {screen === 'menu' && (
          <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
            {/* Restaurant banner */}
            <View style={[styles.restBanner, { backgroundColor: colors.primary + '18' }]}>
              <View style={styles.restBannerIcon}>
                <Ionicons name="restaurant" size={32} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.restBannerName, { color: colors.text }]}>{restaurant?.name}</Text>
                <Text style={[styles.restBannerMeta, { color: colors.textSecondary }]}>
                  {restaurant?.category} · Min. {fmt(restaurant?.min_order || 0)} · Delivery {fmt(restaurant?.delivery_fee || 500)}
                </Text>
              </View>
            </View>

            {loadingMenu ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              Object.entries(menuGrouped).map(([category, items]) => (
                <View key={category} style={styles.menuSection}>
                  <Text style={[styles.menuSectionTitle, { color: colors.text }]}>{category}</Text>
                  {items.filter((i) => i.is_available).map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      qty={cart[item.id]?.qty || 0}
                      onAdd={() => addToCart(item)}
                      onRemove={() => removeFromCart(item)}
                      colors={colors}
                    />
                  ))}
                </View>
              ))
            )}
          </ScrollView>
        )}

        {/* Floating cart bar on menu screen */}
        {screen === 'menu' && cartCount > 0 && (
          <TouchableOpacity
            style={[styles.floatingCart, { backgroundColor: colors.primary }]}
            onPress={() => setScreen('cart')}
            activeOpacity={0.9}
          >
            <View style={styles.floatingCartBadge}><Text style={styles.floatingCartBadgeText}>{cartCount}</Text></View>
            <Text style={styles.floatingCartText}>View order</Text>
            <Text style={styles.floatingCartTotal}>{fmt(cartTotal)}</Text>
          </TouchableOpacity>
        )}

        {/* ── CART / CHECKOUT ──────────────────────────────────────────── */}
        {screen === 'cart' && (
          <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 120 }}>
            {/* Items */}
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Your items</Text>
            {cartItems.map((c) => (
              <View key={c.item.id} style={[styles.cartRow, { backgroundColor: colors.white }]}>
                <View style={styles.qtyRow}>
                  <TouchableOpacity style={[styles.qtyBtn, { borderColor: colors.primary }]} onPress={() => removeFromCart(c.item)}>
                    <Ionicons name="remove" size={14} color={colors.primary} />
                  </TouchableOpacity>
                  <Text style={[styles.qtyText, { color: colors.text }]}>{c.qty}</Text>
                  <TouchableOpacity style={[styles.qtyBtnAdd, { backgroundColor: colors.primary }]} onPress={() => addToCart(c.item)}>
                    <Ionicons name="add" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={[styles.cartItemName, { color: colors.text }]}>{c.item.name}</Text>
                </View>
                <Text style={[styles.cartItemPrice, { color: colors.text }]}>{fmt(c.item.price * c.qty)}</Text>
              </View>
            ))}

            {/* Totals */}
            <View style={[styles.totalsCard, { backgroundColor: colors.white }]}>
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Subtotal</Text>
                <Text style={[styles.totalValue, { color: colors.text }]}>{fmt(cartSubtotal)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Delivery fee</Text>
                <Text style={[styles.totalValue, { color: colors.text }]}>{fmt(restaurant?.delivery_fee || 500)}</Text>
              </View>
              <View style={[styles.totalRow, { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: spacing.sm }]}>
                <Text style={[styles.totalLabel, { color: colors.text, fontWeight: '800' }]}>Total</Text>
                <Text style={[styles.totalValue, { color: colors.primary, fontWeight: '800' }]}>{fmt(cartTotal)}</Text>
              </View>
            </View>

            {/* Delivery details */}
            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: spacing.md }]}>Delivery details</Text>
            <TextInput
              style={[styles.textInputField, { color: colors.text, borderColor: '#e5e7eb', backgroundColor: colors.white }]}
              placeholder="Delivery address..."
              placeholderTextColor={colors.gray400}
              value={deliveryAddress}
              onChangeText={setDeliveryAddress}
              multiline
            />
            <TextInput
              style={[styles.textInputField, { color: colors.text, borderColor: '#e5e7eb', backgroundColor: colors.white, marginTop: spacing.sm }]}
              placeholder="Special instructions (optional)"
              placeholderTextColor={colors.gray400}
              value={specialNote}
              onChangeText={setSpecialNote}
              multiline
            />

            {/* Payment method */}
            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: spacing.md }]}>Payment</Text>
            <View style={styles.paymentRow}>
              {[['cash', 'Cash', 'cash-outline'], ['mtn', 'MTN MoMo', 'phone-portrait-outline'], ['wallet', 'Wallet', 'wallet-outline']].map(([val, label, icon]) => (
                <TouchableOpacity
                  key={val}
                  style={[styles.paymentChip, paymentMethod === val && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => setPaymentMethod(val)}
                >
                  <Ionicons name={icon} size={14} color={paymentMethod === val ? '#fff' : colors.text} />
                  <Text style={[styles.paymentChipText, { color: paymentMethod === val ? '#fff' : colors.text }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {/* Cart checkout button */}
        {screen === 'cart' && (
          <View style={[styles.footer, { backgroundColor: colors.white }]}>
            <TouchableOpacity
              style={[styles.orderBtn, { backgroundColor: colors.primary }]}
              onPress={handlePlaceOrder}
              disabled={submitting || cartItems.length === 0}
              activeOpacity={0.88}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.orderBtnText}>Place Order · {fmt(cartTotal)}</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* ── ORDER PLACED ─────────────────────────────────────────────── */}
        {screen === 'order' && placedOrder && (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, alignItems: 'center' }}>
            <View style={[styles.successIcon, { backgroundColor: '#dcfce7' }]}>
              <Ionicons name="checkmark-circle" size={52} color="#16a34a" />
            </View>
            <Text style={[styles.successTitle, { color: colors.text }]}>Order Placed!</Text>
            <Text style={[styles.successSubtitle, { color: colors.textSecondary }]}>
              Your food is being prepared. Estimated arrival: {placedOrder.estimated_minutes} minutes
            </Text>

            <View style={[styles.orderCard, { backgroundColor: colors.white }]}>
              <View style={styles.orderCardRow}>
                <Text style={[styles.orderCardLabel, { color: colors.textSecondary }]}>Order ID</Text>
                <Text style={[styles.orderCardValue, { color: colors.text }]}>{placedOrder.id?.substring(0, 8).toUpperCase()}</Text>
              </View>
              <View style={styles.orderCardRow}>
                <Text style={[styles.orderCardLabel, { color: colors.textSecondary }]}>Total</Text>
                <Text style={[styles.orderCardValue, { color: colors.primary, fontWeight: '800' }]}>{fmt(placedOrder.total)}</Text>
              </View>
              <View style={styles.orderCardRow}>
                <Text style={[styles.orderCardLabel, { color: colors.textSecondary }]}>Status</Text>
                <Text style={[styles.orderCardValue, { color: colors.text }]}>Pending</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.orderBtn, { backgroundColor: colors.primary, marginTop: spacing.xl, width: '100%' }]}
              onPress={() => { setScreen('list'); setCart({}); setPlacedOrder(null); }}
            >
              <Text style={styles.orderBtnText}>Order Again</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
    ...shadows.sm,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  cartBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill,
  },
  cartBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.md, marginVertical: spacing.sm,
    borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  searchInput: { flex: 1, fontSize: 14 },

  catScroll: { flexGrow: 0 },
  catContent: { paddingHorizontal: spacing.md, gap: 8, paddingBottom: spacing.sm },
  catChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill,
    borderWidth: 1, borderColor: '#d1d5db',
  },
  catChipText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },

  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  loadingText: { marginTop: spacing.sm, fontSize: 14 },
  emptyText: { marginTop: spacing.md, fontSize: 15 },

  restCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm,
    ...shadows.sm,
  },
  restLogo: {
    width: 56, height: 56, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  restLogoImg: { width: 56, height: 56 },
  restInfo: { flex: 1 },
  restName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  restCategory: { fontSize: 12, marginBottom: 4 },
  restMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  restMetaText: { fontSize: 11, fontWeight: '500' },
  restMetaDot: { fontSize: 11 },

  restBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    margin: spacing.md, borderRadius: radius.lg, padding: spacing.md,
  },
  restBannerIcon: {
    width: 52, height: 52, borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  restBannerName: { fontSize: 17, fontWeight: '800', marginBottom: 3 },
  restBannerMeta: { fontSize: 12 },

  menuSection: { marginHorizontal: spacing.md, marginBottom: spacing.md },
  menuSectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: spacing.sm },
  menuCard: {
    flexDirection: 'row', borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.sm, ...shadows.sm,
  },
  menuInfo: { flex: 1, marginRight: spacing.sm },
  menuName: { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  menuDesc: { fontSize: 12, marginBottom: 4 },
  menuPrice: { fontSize: 14, fontWeight: '700' },
  popularBadge: {
    alignSelf: 'flex-start', backgroundColor: '#FEF3C7', borderRadius: radius.pill,
    paddingHorizontal: 6, paddingVertical: 2, marginBottom: 4,
  },
  popularBadgeText: { fontSize: 10, fontWeight: '700', color: '#D97706' },
  menuQtyCol: { alignItems: 'flex-end', justifyContent: 'space-between' },
  menuImg: { width: 60, height: 60, borderRadius: radius.md, marginBottom: spacing.sm },

  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  qtyBtnAdd: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontSize: 15, fontWeight: '700', minWidth: 20, textAlign: 'center' },

  floatingCart: {
    position: 'absolute', bottom: 20, left: spacing.md, right: spacing.md,
    flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg,
    padding: spacing.md, paddingHorizontal: spacing.lg, ...shadows.lg,
  },
  floatingCartBadge: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm,
  },
  floatingCartBadgeText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  floatingCartText: { flex: 1, fontSize: 15, fontWeight: '700', color: '#fff' },
  floatingCartTotal: { fontSize: 15, fontWeight: '800', color: '#fff' },

  cartRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm,
  },
  cartItemName: { fontSize: 14, fontWeight: '600' },
  cartItemPrice: { fontSize: 13, fontWeight: '700' },

  sectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: spacing.sm },
  totalsCard: { borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  totalLabel: { fontSize: 14 },
  totalValue: { fontSize: 14, fontWeight: '600' },

  textInputField: {
    borderWidth: 1, borderRadius: radius.lg, padding: spacing.md,
    fontSize: 14, minHeight: 44,
  },

  paymentRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: spacing.md },
  paymentChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: radius.pill,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  paymentChipText: { fontSize: 12, fontWeight: '600' },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: spacing.md, borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  orderBtn: {
    borderRadius: radius.lg, padding: spacing.md + 2,
    alignItems: 'center', justifyContent: 'center',
  },
  orderBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },

  successIcon: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  successTitle: { fontSize: 24, fontWeight: '900', marginBottom: spacing.sm },
  successSubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: spacing.xl },
  orderCard: { width: '100%', borderRadius: radius.lg, padding: spacing.md, ...shadows.sm },
  orderCardRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs + 2 },
  orderCardLabel: { fontSize: 13 },
  orderCardValue: { fontSize: 13, fontWeight: '700' },
});
