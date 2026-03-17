import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { colors, spacing, radius } from '../theme';

// Auth Screens
import WelcomeScreen from '../screens/WelcomeScreen';
import LanguageScreen from '../screens/LanguageScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import VerificationScreen from '../screens/VerificationScreen';

// Rider Screens
import HomeScreen from '../screens/HomeScreen';
import BookRideScreen from '../screens/BookRideScreen';
import FareEstimateScreen from '../screens/FareEstimateScreen';
import RideTrackingScreen from '../screens/RideTrackingScreen';
import RideHistoryScreen from '../screens/RideHistoryScreen';
import PaymentScreen from '../screens/PaymentScreen';
import PaymentMethodsScreen from '../screens/PaymentMethodsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LoyaltyScreen from '../screens/LoyaltyScreen';
import SubscriptionScreen from '../screens/SubscriptionScreen';
import MessagesScreen from '../screens/MessagesScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SOSScreen from '../screens/SOSScreen';
import TeenAccountScreen from '../screens/TeenAccountScreen';

// New Rider Screens
import ScheduledRideScreen from '../screens/ScheduledRideScreen';
import SharedRideScreen from '../screens/SharedRideScreen';
import RideReceiptScreen from '../screens/RideReceiptScreen';
import SearchLocationScreen from '../screens/SearchLocationScreen';
import PromoCodeScreen from '../screens/PromoCodeScreen';
import SafetyScreen from '../screens/SafetyScreen';
import HelpScreen from '../screens/HelpScreen';
import CorporateScreen from '../screens/CorporateScreen';

// Driver Screens
import DriverHomeScreen from '../screens/DriverHomeScreen';
import DriverRideScreen from '../screens/DriverRideScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Language" component={LanguageScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="Verification" component={VerificationScreen} />
    </Stack.Navigator>
  );
}

function RiderTabs() {
  const { t } = useLanguage();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.gray400,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarIcon: ({ focused, color, size }) => {
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
      <Tab.Screen name="HomeTab" component={HomeScreen} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="ActivityTab" component={RideHistoryScreen} options={{ tabBarLabel: 'Activity' }} />
      <Tab.Screen name="AccountTab" component={ProfileScreen} options={{ tabBarLabel: 'Account' }} />
    </Tab.Navigator>
  );
}

function RiderStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RiderTabs" component={RiderTabs} />
      <Stack.Screen name="BookRide" component={BookRideScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="FareEstimate" component={FareEstimateScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="RideTracking" component={RideTrackingScreen} />
      <Stack.Screen name="Payment" component={PaymentScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} />
      <Stack.Screen name="Loyalty" component={LoyaltyScreen} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} />
      <Stack.Screen name="Messages" component={MessagesScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="SOS" component={SOSScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="TeenAccounts" component={TeenAccountScreen} />
      <Stack.Screen name="Language" component={LanguageScreen} />
      <Stack.Screen name="ScheduledRide" component={ScheduledRideScreen} />
      <Stack.Screen name="SharedRide" component={SharedRideScreen} />
      <Stack.Screen name="RideReceipt" component={RideReceiptScreen} />
      <Stack.Screen
        name="SearchLocation"
        component={SearchLocationScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen name="PromoCode" component={PromoCodeScreen} />
      <Stack.Screen name="Safety" component={SafetyScreen} />
      <Stack.Screen name="Help" component={HelpScreen} />
      <Stack.Screen name="Corporate" component={CorporateScreen} />
    </Stack.Navigator>
  );
}

function DriverStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DriverHome" component={DriverHomeScreen} />
      <Stack.Screen name="DriverRide" component={DriverRideScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Messages" component={MessagesScreen} />
      <Stack.Screen name="SOS" component={SOSScreen} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
}

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
