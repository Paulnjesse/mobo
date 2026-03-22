import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, useColorScheme } from 'react-native';
import { StripeProvider } from '@stripe/stripe-react-native';

import { AuthProvider } from './src/context/AuthContext';
import { LanguageProvider } from './src/context/LanguageContext';
import { RideProvider } from './src/context/RideContext';
import { ThemeProvider } from './src/context/ThemeContext';
import { CurrencyProvider } from './src/context/CurrencyContext';
import AppNavigator from './src/navigation/AppNavigator';
import OfflineBanner from './src/components/OfflineBanner';

// Navigation themes aligned with MOBO brand
const MoboLightTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: '#FF00BF', background: '#FFFFFF', card: '#FFFFFF', text: '#1A1A1A', border: '#EBEBEB' },
};
const MoboDarkTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, primary: '#FF00BF', background: '#0F0F0F', card: '#1C1C1E', text: '#FFFFFF', border: '#2C2C2E', notification: '#FF00BF' },
};

export default function App() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return (
    <GestureHandlerRootView style={styles.root}>
      <StripeProvider publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''}>
      <SafeAreaProvider>
        <ThemeProvider>
          <LanguageProvider>
            <CurrencyProvider>
            <AuthProvider>
              <RideProvider>
                <NavigationContainer theme={isDark ? MoboDarkTheme : MoboLightTheme}>
                  <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor="transparent" translucent />
                  <OfflineBanner />
                  <AppNavigator />
                </NavigationContainer>
              </RideProvider>
            </AuthProvider>
            </CurrencyProvider>
          </LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
      </StripeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
