import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { colors, spacing, radius } from '../theme';

// ── Auth Screens ───────────────────────────────────────────────────────────────
import WelcomeScreen        from '../screens/WelcomeScreen';
import LanguageScreen       from '../screens/LanguageScreen';
import LoginScreen          from '../screens/LoginScreen';
import RegisterScreen       from '../screens/RegisterScreen';
import VerificationScreen   from '../screens/VerificationScreen';

// New multi-role registration screens
import RoleSelectionScreen    from '../screens/auth/RoleSelectionScreen';
import RiderRegisterScreen    from '../screens/auth/RiderRegisterScreen';
import DriverRegisterScreen   from '../screens/auth/DriverRegisterScreen';
import FleetOwnerRegisterScreen from '../screens/auth/FleetOwnerRegisterScreen';

// ── Rider Screens ──────────────────────────────────────────────────────────────
import HomeScreen           from '../screens/HomeScreen';
import BookRideScreen       from '../screens/BookRideScreen';
import FareEstimateScreen   from '../screens/FareEstimateScreen';
import RideTrackingScreen   from '../screens/RideTrackingScreen';
import RideHistoryScreen    from '../screens/RideHistoryScreen';
import PaymentScreen        from '../screens/PaymentScreen';
import PaymentMethodsScreen from '../screens/PaymentMethodsScreen';
import ProfileScreen        from '../screens/ProfileScreen';
import LoyaltyScreen        from '../screens/LoyaltyScreen';
import SubscriptionScreen   from '../screens/SubscriptionScreen';
import MessagesScreen       from '../screens/MessagesScreen';
import NotificationsScreen  from '../screens/NotificationsScreen';
import SettingsScreen       from '../screens/SettingsScreen';
import SOSScreen            from '../screens/SOSScreen';
import TeenAccountScreen    from '../screens/TeenAccountScreen';
import ScheduledRideScreen  from '../screens/ScheduledRideScreen';
import SharedRideScreen     from '../screens/SharedRideScreen';
import RideReceiptScreen    from '../screens/RideReceiptScreen';
import SearchLocationScreen from '../screens/SearchLocationScreen';
import PromoCodeScreen      from '../screens/PromoCodeScreen';
import SafetyScreen         from '../screens/SafetyScreen';
import HelpScreen           from '../screens/HelpScreen';
import CorporateScreen      from '../screens/CorporateScreen';
import ReferralScreen       from '../screens/ReferralScreen';
import FamilyAccountScreen  from '../screens/FamilyAccountScreen';
import LostAndFoundScreen   from '../screens/LostAndFoundScreen';
import WomenConnectScreen   from '../screens/WomenConnectScreen';
import PreferredDriversScreen from '../screens/PreferredDriversScreen';

// ── Driver Screens ─────────────────────────────────────────────────────────────
import DriverHomeScreen     from '../screens/DriverHomeScreen';
import DriverRideScreen     from '../screens/DriverRideScreen';
import DriverBonusScreen    from '../screens/DriverBonusScreen';
import ExpressPayScreen     from '../screens/ExpressPayScreen';
import DestinationModeScreen from '../screens/DestinationModeScreen';
import HomeLocationScreen   from '../screens/HomeLocationScreen';

// ── Fleet Owner Screens ────────────────────────────────────────────────────────
import FleetDashboardScreen   from '../screens/fleet/FleetDashboardScreen';
import FleetManagementScreen  from '../screens/fleet/FleetManagementScreen';
import AddVehicleScreen       from '../screens/fleet/AddVehicleScreen';
import VehicleDetailScreen    from '../screens/fleet/VehicleDetailScreen';

const Stack = createStackNavigator();
const Tab   = createBottomTabNavigator();

// ── Auth Stack ─────────────────────────────────────────────────────────────────
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome"          component={WelcomeScreen} />
      <Stack.Screen name="Language"         component={LanguageScreen} />
      <Stack.Screen name="Login"            component={LoginScreen} />
      {/* Legacy register — kept for back-compat */}
      <Stack.Screen name="Register"         component={RegisterScreen} />
      {/* New role-based registration flow */}
      <Stack.Screen name="RoleSelection"    component={RoleSelectionScreen} />
      <Stack.Screen name="RiderRegister"    component={RiderRegisterScreen} />
      <Stack.Screen name="DriverRegister"   component={DriverRegisterScreen} />
      <Stack.Screen name="FleetOwnerRegister" component={FleetOwnerRegisterScreen} />
      <Stack.Screen name="Verification"     component={VerificationScreen} />
      {/* Driver onboarding: set home location right after registration */}
      <Stack.Screen name="HomeLocation"     component={HomeLocationScreen} />
    </Stack.Navigator>
  );
}

// ── Rider Tabs ─────────────────────────────────────────────────────────────────
function RiderTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.gray400,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarIcon: ({ focused, color }) => {
          let iconName;
          if (route.name === 'HomeTab') {
            iconName = focused ? 'map' : 'map-outline';
          } else if (route.name === 'ActivityTab') {
            iconName = focused ? 'time' : 'time-outline';
          } else if (route.name === 'AccountTab') {
            iconName = focused ? 'person' : 'person-outline';
          }
          return (
            <View style={styles.tabIconWrap}>
              <Ionicons name={iconName} size={22} color={color} />
              {focused && <View style={styles.tabActiveDot} />}
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="HomeTab"     component={HomeScreen}        options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="ActivityTab" component={RideHistoryScreen} options={{ tabBarLabel: 'Activity' }} />
      <Tab.Screen name="AccountTab"  component={ProfileScreen}     options={{ tabBarLabel: 'Account' }} />
    </Tab.Navigator>
  );
}

// ── Rider Stack ────────────────────────────────────────────────────────────────
function RiderStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RiderTabs"          component={RiderTabs} />
      <Stack.Screen name="BookRide"           component={BookRideScreen}          options={{ presentation: 'modal' }} />
      <Stack.Screen name="FareEstimate"       component={FareEstimateScreen}      options={{ presentation: 'modal' }} />
      <Stack.Screen name="RideTracking"       component={RideTrackingScreen} />
      <Stack.Screen name="Payment"            component={PaymentScreen}           options={{ presentation: 'modal' }} />
      <Stack.Screen name="PaymentMethods"     component={PaymentMethodsScreen} />
      <Stack.Screen name="Loyalty"            component={LoyaltyScreen} />
      <Stack.Screen name="Subscription"       component={SubscriptionScreen} />
      <Stack.Screen name="Messages"           component={MessagesScreen} />
      <Stack.Screen name="Notifications"      component={NotificationsScreen} />
      <Stack.Screen name="Settings"           component={SettingsScreen} />
      <Stack.Screen name="SOS"                component={SOSScreen}               options={{ presentation: 'modal' }} />
      <Stack.Screen name="TeenAccounts"       component={TeenAccountScreen} />
      <Stack.Screen name="Language"           component={LanguageScreen} />
      <Stack.Screen name="ScheduledRide"      component={ScheduledRideScreen} />
      <Stack.Screen name="SharedRide"         component={SharedRideScreen} />
      <Stack.Screen name="RideReceipt"        component={RideReceiptScreen} />
      <Stack.Screen name="SearchLocation"     component={SearchLocationScreen}    options={{ presentation: 'modal' }} />
      <Stack.Screen name="PromoCode"          component={PromoCodeScreen} />
      <Stack.Screen name="Safety"             component={SafetyScreen} />
      <Stack.Screen name="Help"               component={HelpScreen} />
      <Stack.Screen name="Corporate"          component={CorporateScreen} />
      <Stack.Screen name="Referral"           component={ReferralScreen} />
      <Stack.Screen name="FamilyAccount"      component={FamilyAccountScreen} />
      <Stack.Screen name="LostAndFound"       component={LostAndFoundScreen} />
      <Stack.Screen name="WomenConnect"       component={WomenConnectScreen} />
      <Stack.Screen name="PreferredDrivers"   component={PreferredDriversScreen} />
    </Stack.Navigator>
  );
}

// ── Driver Stack ───────────────────────────────────────────────────────────────
function DriverStack() {
  const { user } = useAuth();
  // Show HomeLocation onboarding if driver has never set their home
  const needsHomeSetup = !user?.driver?.home_latitude && !user?.home_latitude;
  const initialRoute = needsHomeSetup ? 'HomeLocation' : 'DriverHome';

  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={initialRoute}
    >
      <Stack.Screen name="DriverHome"       component={DriverHomeScreen} />
      <Stack.Screen name="DriverRide"       component={DriverRideScreen} />
      <Stack.Screen name="Settings"         component={SettingsScreen} />
      <Stack.Screen name="Notifications"    component={NotificationsScreen} />
      <Stack.Screen name="Messages"         component={MessagesScreen} />
      <Stack.Screen name="SOS"              component={SOSScreen}             options={{ presentation: 'modal' }} />
      <Stack.Screen name="DriverBonus"      component={DriverBonusScreen} />
      <Stack.Screen name="ExpressPay"       component={ExpressPayScreen} />
      <Stack.Screen name="DestinationMode"  component={DestinationModeScreen} />
      <Stack.Screen
        name="HomeLocation"
        component={HomeLocationScreen}
        initialParams={{ isOnboarding: true }}
      />
    </Stack.Navigator>
  );
}

// ── Fleet Owner Tabs ───────────────────────────────────────────────────────────
function FleetOwnerTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.gray400,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarIcon: ({ focused, color }) => {
          let iconName;
          if (route.name === 'FleetTab') {
            iconName = focused ? 'car' : 'car-outline';
          } else if (route.name === 'EarningsTab') {
            iconName = focused ? 'cash' : 'cash-outline';
          } else if (route.name === 'AccountTab') {
            iconName = focused ? 'person' : 'person-outline';
          }
          return (
            <View style={styles.tabIconWrap}>
              <Ionicons name={iconName} size={22} color={color} />
              {focused && <View style={styles.tabActiveDot} />}
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="FleetTab"    component={FleetDashboardScreen} options={{ tabBarLabel: 'My Fleets' }} />
      <Tab.Screen name="EarningsTab" component={FleetDashboardScreen} options={{ tabBarLabel: 'Earnings' }} />
      <Tab.Screen name="AccountTab"  component={ProfileScreen}        options={{ tabBarLabel: 'Account' }} />
    </Tab.Navigator>
  );
}

// ── Fleet Owner Stack ──────────────────────────────────────────────────────────
function FleetOwnerStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FleetOwnerTabs"   component={FleetOwnerTabs} />
      <Stack.Screen name="FleetDashboard"   component={FleetDashboardScreen} />
      <Stack.Screen name="FleetManagement"  component={FleetManagementScreen} />
      <Stack.Screen name="AddVehicle"       component={AddVehicleScreen} />
      <Stack.Screen name="VehicleDetail"    component={VehicleDetailScreen} />
      <Stack.Screen name="Notifications"    component={NotificationsScreen} />
      <Stack.Screen name="Settings"         component={SettingsScreen} />
      <Stack.Screen name="Language"         component={LanguageScreen} />
      <Stack.Screen name="Help"             component={HelpScreen} />
    </Stack.Navigator>
  );
}

// ── Root Navigator ─────────────────────────────────────────────────────────────
export default function AppNavigator() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <AuthStack />;
  }

  if (user?.role === 'driver') {
    return <DriverStack />;
  }

  if (user?.role === 'fleet_owner') {
    return <FleetOwnerStack />;
  }

  // Default: rider
  return <RiderStack />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  tabBar: {
    backgroundColor: colors.white,
    borderTopColor: colors.gray200,
    borderTopWidth: 1,
    paddingBottom: 8,
    paddingTop: 6,
    height: 64,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 10,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  tabIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActiveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginTop: 3,
  },
});
