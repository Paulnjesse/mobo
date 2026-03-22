import React, { createContext, useContext, useState } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mobo_web_user')); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem('mobo_web_token'));

  const login = async (email, password) => {
    const { data } = await axios.post(`${API}/auth/login`, { email, password });
    setUser(data.user);
    setToken(data.token);
    localStorage.setItem('mobo_web_user', JSON.stringify(data.user));
    localStorage.setItem('mobo_web_token', data.token);
    return data;
  };

  const register = async (name, email, password) => {
    const { data } = await axios.post(`${API}/auth/register`, { name, email, password });
    setUser(data.user);
    setToken(data.token);
    localStorage.setItem('mobo_web_user', JSON.stringify(data.user));
    localStorage.setItem('mobo_web_token', data.token);
    return data;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('mobo_web_user');
    localStorage.removeItem('mobo_web_token');
  };

  const api = axios.create({ baseURL: API });
  api.interceptors.request.use(cfg => {
    if (token) cfg.headers.Authorization = `Bearer ${token}`;
    return cfg;
  });

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, api }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
