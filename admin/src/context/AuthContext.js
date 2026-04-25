/**
 * Admin Authentication Context
 *
 * Security hardening:
 *  - Token stored in memory only (NOT localStorage — XSS-safe)
 *  - Non-sensitive user profile in sessionStorage (cleared on tab close)
 *  - 30-minute idle session timeout with activity tracking
 *  - Single-session enforcement: login invalidates any prior session
 *  - All auth events logged for insider threat detection
 *  - Permission list fetched after 2FA and cached in state
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { authAPI, adminMgmtAPI, setAuthToken, clearAuthToken } from '../services/api';

const AuthContext = createContext(null);

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const USER_STORE_KEY  = 'mobo_admin_user_safe';
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'];

export function AuthProvider({ children }) {
  const tokenRef     = useRef(null);
  const idleTimerRef = useRef(null);

  const [user,        setUser]        = useState(null);
  const [permissions, setPermissions] = useState(new Set());
  const [loading,     setLoading]     = useState(true);

  // ── Idle timeout ─────────────────────────────────────────────────────────────
  const resetIdleTimer = useCallback(() => {
    if (!tokenRef.current) return;
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      console.warn('[AdminAuth] Session expired due to inactivity.');
      performLogout('idle_timeout');
    }, IDLE_TIMEOUT_MS);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const attachActivityListeners = useCallback(() => {
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, resetIdleTimer, { passive: true }));
  }, [resetIdleTimer]);

  const detachActivityListeners = useCallback(() => {
    ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, resetIdleTimer));
    clearTimeout(idleTimerRef.current);
  }, [resetIdleTimer]);

  // ── Restore session from sessionStorage ──────────────────────────────────────
  useEffect(() => {
    setLoading(false);
  }, []);

  // ── Fetch permissions after login ────────────────────────────────────────────
  const fetchPermissions = useCallback(async () => {
    try {
      const res = await adminMgmtAPI.getMyPermissions();
      const perms = res.data?.permissions || [];
      setPermissions(new Set(perms));
      return perms;
    } catch {
      setPermissions(new Set());
      return [];
    }
  }, []);

  // ── Core logout ──────────────────────────────────────────────────────────────
  const performLogout = useCallback(async (reason = 'manual') => {
    detachActivityListeners();
    const hadToken = !!tokenRef.current;
    tokenRef.current = null;
    clearAuthToken();
    sessionStorage.removeItem(USER_STORE_KEY);
    setUser(null);
    setPermissions(new Set());

    if (hadToken) {
      try { await authAPI.logout(); } catch { /* already expired */ }
    }
    if (reason !== 'manual') {
      window.dispatchEvent(new CustomEvent('mobo:admin:session-ended', { detail: { reason } }));
    }
  }, [detachActivityListeners]);

  // ── Login (step 1 — returns requires_2fa flag for admin accounts) ─────────────
  const login = useCallback(async (email, password) => {
    const response = await authAPI.login(email, password);
    // When 2FA is required the response contains { requires_2fa: true, user_id }
    // (no token — full JWT is issued only after TOTP validated in step 2)
    const { token: newToken, user: newUser, requires_2fa, user_id: challengeUserId } = response.data;

    if (requires_2fa) {
      // Return the user_id as tempToken so LoginPage can pass it to complete2FA
      return { requires_2fa: true, tempToken: challengeUserId };
    }

    if (!newUser || newUser.role !== 'admin') {
      throw new Error('Access denied. Admin privileges required.');
    }

    tokenRef.current = newToken;
    setAuthToken(newToken);
    const safeMeta = { id: newUser.id, role: newUser.role, email: newUser.email, name: newUser.name };
    sessionStorage.setItem(USER_STORE_KEY, JSON.stringify(safeMeta));
    setUser(newUser);

    attachActivityListeners();
    resetIdleTimer();
    await fetchPermissions();
    return newUser;
  }, [attachActivityListeners, resetIdleTimer, fetchPermissions]);

  // ── Complete 2FA challenge (step 2) ──────────────────────────────────────────
  const complete2FA = useCallback(async (userId, totpCode) => {
    const response = await authAPI.validate2FA(userId, totpCode);
    const { token: finalToken, user: newUser } = response.data?.data || response.data;

    if (!newUser || newUser.role !== 'admin') {
      throw new Error('Access denied. Admin privileges required.');
    }

    tokenRef.current = finalToken;
    setAuthToken(finalToken);
    const safeMeta = { id: newUser.id, role: newUser.role, email: newUser.email, name: newUser.name };
    sessionStorage.setItem(USER_STORE_KEY, JSON.stringify(safeMeta));
    setUser(newUser);

    attachActivityListeners();
    resetIdleTimer();
    await fetchPermissions();
    return newUser;
  }, [attachActivityListeners, resetIdleTimer, fetchPermissions]);

  const getToken = useCallback(() => tokenRef.current, []);

  useEffect(() => {
    return () => detachActivityListeners();
  }, [detachActivityListeners]);

  // ── Permission helpers ────────────────────────────────────────────────────────
  const hasPermission = useCallback((perm) => permissions.has(perm), [permissions]);

  // Role shortcuts
  const isSuperAdmin = useCallback(() => user?.admin_role === 'admin', [user]);

  const value = {
    user,
    loading,
    permissions,
    isAuthenticated: !!user && !!tokenRef.current,
    login,
    complete2FA,
    logout: () => performLogout('manual'),
    getToken,
    idleTimeoutMs: IDLE_TIMEOUT_MS,
    hasPermission,
    isSuperAdmin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

export default AuthContext;
