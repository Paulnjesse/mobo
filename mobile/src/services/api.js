import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = '@mobo_token';

const api = axios.create({
  baseURL: 'https://mobo-api-gateway.onrender.com/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Request interceptor — attach JWT
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      console.warn('Failed to attach token:', err);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle 401 and network errors
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (!error.response) {
      // Network error
      const networkError = new Error('No internet connection. Please check your network.');
      networkError.isNetworkError = true;
      return Promise.reject(networkError);
    }

    if (error.response.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await AsyncStorage.getItem('@mobo_refresh_token');
        if (refreshToken) {
          const response = await axios.post(
            'https://mobo-api-gateway.onrender.com/api/v1/auth/refresh',
            { refreshToken },
            { timeout: 15000 }
          );
          const newToken = response.data.token || response.data.data?.token;
          await AsyncStorage.setItem(TOKEN_KEY, newToken);
          processQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        } else {
          processQueue(new Error('Session expired'), null);
          await AsyncStorage.multiRemove([TOKEN_KEY, '@mobo_user']);
          const sessionError = new Error('Your session has expired. Please log in again.');
          sessionError.isAuthError = true;
          return Promise.reject(sessionError);
        }
      } catch (refreshError) {
        processQueue(refreshError, null);
        await AsyncStorage.multiRemove([TOKEN_KEY, '@mobo_user']);
        const sessionError = new Error('Your session has expired. Please log in again.');
        sessionError.isAuthError = true;
        return Promise.reject(sessionError);
      } finally {
        isRefreshing = false;
      }
    }

    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      `Request failed with status ${error.response?.status}`;

    const apiError = new Error(message);
    apiError.status = error.response?.status;
    apiError.data = error.response?.data;
    return Promise.reject(apiError);
  }
);

export default api;
