import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('mobo_admin_token');
    const storedUser = localStorage.getItem('mobo_admin_user');
    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser.role === 'admin') {
          setToken(storedToken);
          setUser(parsedUser);
        } else {
          localStorage.removeItem('mobo_admin_token');
          localStorage.removeItem('mobo_admin_user');
        }
      } catch {
        localStorage.removeItem('mobo_admin_token');
        localStorage.removeItem('mobo_admin_user');
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email, password) => {
    const response = await authAPI.login(email, password);
    const { token: newToken, user: newUser } = response.data;

    if (!newUser || newUser.role !== 'admin') {
      throw new Error('Access denied. Admin privileges required.');
    }

    localStorage.setItem('mobo_admin_token', newToken);
    localStorage.setItem('mobo_admin_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    return newUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authAPI.logout();
    } catch {
      // Ignore logout API errors
    } finally {
      localStorage.removeItem('mobo_admin_token');
      localStorage.removeItem('mobo_admin_user');
      setToken(null);
      setUser(null);
    }
  }, []);

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!token && !!user,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
