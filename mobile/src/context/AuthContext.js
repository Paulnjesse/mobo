import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { authService } from '../services/auth';
import { fleetService } from '../services/fleet';

const TOKEN_KEY = '@mobo_token';
const USER_KEY  = '@mobo_user';

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
  const [user, setUser]                     = useState(null);
  const [token, setToken]                   = useState(null);
  const [isLoading, setIsLoading]           = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [lastNotification, setLastNotification] = useState(null);

  // Fleet owner state
  const [myFleets, setMyFleets]             = useState([]);
  const [fleetsLoading, setFleetsLoading]   = useState(false);

  useEffect(() => {
    loadStoredAuth();

    const foregroundSub = Notifications.addNotificationReceivedListener((notification) => {
      setLastNotification(notification);
    });
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
        const parsedUser = JSON.parse(storedUser);
        setToken(storedToken);
        setUser(parsedUser);
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
    setMyFleets([]);
    setIsAuthenticated(false);
  };

  // ── Social login (Google / Apple) ──────────────────────────
  const socialLogin = useCallback(async (provider, providerToken, extraData = {}) => {
    const response = await authService.socialLogin(provider, providerToken, extraData);
    const authToken = response.token || response.data?.token;
    const authUser  = response.data?.user || response.user;

    await persistAuth(authToken, authUser);

    try {
      const pushToken = await registerForPushNotifications();
      if (pushToken) {
        await authService.updateProfile({ expo_push_token: pushToken }).catch(() => {});
      }
    } catch (_) {}

    return response;
  }, []);

  // ── Login ──────────────────────────────────────────────────
  const login = useCallback(async (identifier, password) => {
    const response = await authService.login(identifier, password);
    const { token: authToken, user: authUser, fleets } = response.data;

    await persistAuth(authToken, authUser);

    // Pre-load fleet data if fleet owner
    if (authUser.role === 'fleet_owner' && fleets) {
      setMyFleets(fleets);
    }

    // Register for push notifications
    try {
      const pushToken = await registerForPushNotifications();
      if (pushToken) {
        await authService.updateProfile({ expo_push_token: pushToken }).catch(() => {});
      }
    } catch (pushErr) {
      console.warn('[AuthContext] Push registration failed:', pushErr.message);
    }

    return response;
  }, []);

  // ── Rider registration ─────────────────────────────────────
  const registerRider = useCallback(async (userData) => {
    const response = await authService.registerRider(userData);
    // Don't persist token yet — user needs OTP verification first
    return response;
  }, []);

  // ── Driver registration ────────────────────────────────────
  const registerDriver = useCallback(async (userData) => {
    // Single unified call: backend creates user + driver record in one step
    const response = await authService.signup({ ...userData, role: 'driver' });
    return response;
  }, []);

  const completeDriverRegistration = useCallback(async (driverData) => {
    const response = await authService.registerDriverComplete(driverData);
    // Update stored user with completed registration step
    if (user) {
      const updatedUser = { ...user, registration_step: 'complete', registration_completed: true };
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
      setUser(updatedUser);
    }
    return response;
  }, [user]);

  // ── Fleet owner registration ───────────────────────────────
  const registerFleetOwner = useCallback(async (userData) => {
    // Single call — backend creates user + fleet record
    const response = await authService.signup({ ...userData, role: 'fleet_owner' });
    return response;
  }, []);

  const completeFleetOwnerRegistration = useCallback(async (fleetData) => {
    const response = await authService.registerFleetOwnerComplete(fleetData);
    if (response.data?.fleet) {
      setMyFleets([response.data.fleet]);
    }
    if (user) {
      const updatedUser = { ...user, registration_step: 'add_vehicles' };
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
      setUser(updatedUser);
    }
    return response;
  }, [user]);

  // ── OTP ────────────────────────────────────────────────────
  const verifyOtp = useCallback(async (phone, otp) => {
    const response = await authService.verifyOtp(phone, otp);
    // Note: verification doesn't return a token in this flow.
    // The user still needs to log in after verifying.
    return response;
  }, []);

  const resendOtp = useCallback(async (phone) => {
    return authService.resendOtp(phone);
  }, []);

  // ── Logout ─────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch (_) {
      // Logout locally regardless of server error
    }
    await clearAuth();
  }, []);

  // ── Profile ────────────────────────────────────────────────
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
      const newToken = response.data?.token || response.token;
      await AsyncStorage.setItem(TOKEN_KEY, newToken);
      setToken(newToken);
      return newToken;
    } catch (err) {
      await clearAuth();
      throw err;
    }
  }, [token]);

  // ── Fleet management ───────────────────────────────────────
  const loadFleets = useCallback(async () => {
    if (!isAuthenticated || user?.role !== 'fleet_owner') return;
    setFleetsLoading(true);
    try {
      const response = await fleetService.getMyFleets();
      setMyFleets(response.data?.fleets || []);
    } catch (err) {
      console.warn('[AuthContext] Failed to load fleets:', err.message);
    } finally {
      setFleetsLoading(false);
    }
  }, [isAuthenticated, user]);

  const addFleet = useCallback(async (fleetData) => {
    const response = await fleetService.createFleet(fleetData);
    if (response.data?.fleet) {
      setMyFleets((prev) => [...prev, response.data.fleet]);
    }
    return response;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        // Auth state
        user,
        token,
        isLoading,
        isAuthenticated,

        // Auth actions
        login,
        socialLogin,
        logout,
        verifyOtp,
        resendOtp,
        refreshToken,
        updateProfile,
        setUser,

        // Role-specific registration
        registerRider,
        registerDriver,
        completeDriverRegistration,
        registerFleetOwner,
        completeFleetOwnerRegistration,

        // Legacy compat
        register: registerRider,

        // Fleet state
        myFleets,
        fleetsLoading,
        loadFleets,
        addFleet,
        setMyFleets,

        // Notifications
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
