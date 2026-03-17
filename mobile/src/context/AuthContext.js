import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { authService } from '../services/auth';

const TOKEN_KEY = '@mobo_token';
const USER_KEY = '@mobo_user';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Register the device for Expo push notifications.
 * Returns the Expo push token string, or null if unavailable/denied.
 */
async function registerForPushNotifications() {
  if (!Device.isDevice) {
    console.log('[PushNotifications] Physical device required for push tokens.');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[PushNotifications] Permission not granted.');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'MOBO',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF00BF',
    });
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch (err) {
    console.warn('[PushNotifications] Failed to get push token:', err.message);
    return null;
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [lastNotification, setLastNotification] = useState(null);

  useEffect(() => {
    loadStoredAuth();

    // Listen for notifications received while app is in foreground
    const foregroundSub = Notifications.addNotificationReceivedListener((notification) => {
      setLastNotification(notification);
    });

    // Listen for notification taps (background / killed state)
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      setLastNotification(response.notification);
    });

    return () => {
      foregroundSub.remove();
      responseSub.remove();
    };
  }, []);

  const loadStoredAuth = async () => {
    try {
      const [storedToken, storedUser] = await Promise.all([
        AsyncStorage.getItem(TOKEN_KEY),
        AsyncStorage.getItem(USER_KEY),
      ]);
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        setIsAuthenticated(true);
      }
    } catch (err) {
      console.warn('Failed to load stored auth:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const persistAuth = async (authToken, authUser) => {
    await Promise.all([
      AsyncStorage.setItem(TOKEN_KEY, authToken),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(authUser)),
    ]);
    setToken(authToken);
    setUser(authUser);
    setIsAuthenticated(true);
  };

  const clearAuth = async () => {
    await Promise.all([
      AsyncStorage.removeItem(TOKEN_KEY),
      AsyncStorage.removeItem(USER_KEY),
    ]);
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
  };

  const login = useCallback(async (identifier, password) => {
    const response = await authService.login(identifier, password);
    await persistAuth(response.token, response.user);

    // Register for push notifications after successful login
    try {
      const pushToken = await registerForPushNotifications();
      if (pushToken) {
        // Send token to backend so server can push notifications to this device
        await authService.updateProfile({ expo_push_token: pushToken }).catch(() => {});
      }
    } catch (pushErr) {
      // Non-fatal — login still succeeds
      console.warn('[AuthContext] Push registration failed:', pushErr.message);
    }

    return response;
  }, []);

  const register = useCallback(async (userData) => {
    const response = await authService.signup(userData);
    return response;
  }, []);

  const verifyOtp = useCallback(async (phone, otp) => {
    const response = await authService.verifyOtp(phone, otp);
    if (response.token) {
      await persistAuth(response.token, response.user);
    }
    return response;
  }, []);

  const resendOtp = useCallback(async (phone) => {
    return authService.resendOtp(phone);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch (err) {
      // logout locally regardless
    }
    await clearAuth();
  }, []);

  const updateProfile = useCallback(async (profileData) => {
    const updated = await authService.updateProfile(profileData);
    const newUser = { ...user, ...updated };
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setUser(newUser);
    return newUser;
  }, [user]);

  const refreshToken = useCallback(async () => {
    try {
      const response = await authService.refreshToken(token);
      await persistAuth(response.token, response.user || user);
      return response.token;
    } catch (err) {
      await clearAuth();
      throw err;
    }
  }, [token, user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated,
        login,
        register,
        verifyOtp,
        resendOtp,
        logout,
        updateProfile,
        refreshToken,
        setUser,
        lastNotification,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
