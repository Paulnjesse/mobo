import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService } from '../services/auth';

const TOKEN_KEY = '@mobo_token';
const USER_KEY = '@mobo_user';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    loadStoredAuth();
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
