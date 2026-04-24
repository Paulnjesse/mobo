import axios from 'axios';
import Constants from 'expo-constants';
import {
  getAccessToken,
  getRefreshToken,
  saveAccessToken,
  clearAllSecureData,
} from '../utils/secureStorage';

// Base URL driven by EAS build profile env — never hardcoded
const BASE_URL =
  Constants.expoConfig?.extra?.apiUrl ??
  'https://mobo-api-gateway.onrender.com/api/v1';

// ── Retry configuration (Africa 3G: 2–5% packet loss, 200–400ms RTT) ─────────
const MAX_RETRIES      = 2;           // total extra attempts after initial failure
const BASE_DELAY_MS    = 800;         // first retry after 800 ms
const MAX_DELAY_MS     = 8000;        // cap at 8 s
const JITTER           = 0.3;         // ±30% to prevent thundering-herd

// Status codes worth retrying (transient server/gateway errors)
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

// Network error codes that indicate transient connectivity issues
const RETRYABLE_CODES  = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH']);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt) {
  const exp  = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
  const rand = 1 + (Math.random() * 2 - 1) * JITTER;
  return Math.round(exp * rand);
}

// ── Axios instance ─────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,   // 30 s — generous for 3G + Render cold-starts
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate, br',   // request compressed responses
  },
});

// ── Request interceptor — attach JWT from hardware-backed SecureStore ──────────
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await getAccessToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (_err) {
      // Non-fatal — request proceeds without auth; server will 401 if required
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor — retry on transient errors, refresh JWT on 401 ──────
let isRefreshing = false;
let failedQueue  = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else       prom.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // ── Transient network / server error → retry with exponential back-off ─────
    // Only retry safe (idempotent) methods or explicit opt-in (_retryCount set)
    const retryCount = originalRequest._retryCount ?? 0;
    const method     = (originalRequest.method || 'get').toLowerCase();
    const isSafe     = ['get', 'head', 'options'].includes(method);
    const isExplicitRetry = originalRequest._allowRetry === true;

    const isNetworkErr = !error.response && error.code && RETRYABLE_CODES.has(error.code);
    const isRetryableStatus =
      error.response && RETRYABLE_STATUS.has(error.response.status);

    if ((isSafe || isExplicitRetry) && retryCount < MAX_RETRIES && (isNetworkErr || isRetryableStatus)) {
      originalRequest._retryCount = retryCount + 1;
      const delay = backoffMs(originalRequest._retryCount);
      await sleep(delay);
      return api(originalRequest);
    }

    // ── Network error with no retries left → user-facing message ──────────────
    if (!error.response) {
      const networkError = new Error(
        retryCount >= MAX_RETRIES
          ? `Still no connection after ${MAX_RETRIES + 1} attempts. Please check your network.`
          : 'No internet connection. Please check your network.'
      );
      networkError.isNetworkError = true;
      return Promise.reject(networkError);
    }

    // ── 401 → attempt JWT refresh then replay ─────────────────────────────────
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
        const refreshToken = await getRefreshToken();
        if (refreshToken) {
          const response = await axios.post(
            `${BASE_URL}/auth/refresh`,
            { refreshToken },
            { timeout: 15000 }
          );
          const newToken = response.data.token || response.data.data?.token;
          await saveAccessToken(newToken);
          processQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        } else {
          processQueue(new Error('Session expired'), null);
          await clearAllSecureData();
          const sessionError = new Error('Your session has expired. Please log in again.');
          sessionError.isAuthError = true;
          return Promise.reject(sessionError);
        }
      } catch (refreshError) {
        processQueue(refreshError, null);
        await clearAllSecureData();
        const sessionError = new Error('Your session has expired. Please log in again.');
        sessionError.isAuthError = true;
        return Promise.reject(sessionError);
      } finally {
        isRefreshing = false;
      }
    }

    // ── Generic API error ──────────────────────────────────────────────────────
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      `Request failed with status ${error.response?.status}`;

    const apiError    = new Error(message);
    apiError.status   = error.response?.status;
    apiError.data     = error.response?.data;
    return Promise.reject(apiError);
  }
);

/**
 * Mark a POST/PATCH/DELETE request as safe to retry (caller guarantees idempotency,
 * e.g. because the server is idempotent via idempotency key header).
 *
 * Usage:
 *   await api.post('/payments/charge', body, retryable())
 */
export function retryable(config = {}) {
  return { ...config, _allowRetry: true };
}

export default api;
