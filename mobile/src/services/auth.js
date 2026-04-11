import api from './api';

export const authService = {
  // ── Social login (Google / Apple) ──────────────────────────
  async socialLogin(provider, token, extraData = {}) {
    const response = await api.post('/auth/social', {
      provider,
      token,
      ...extraData, // email, name, role
    });
    return response.data;
  },

  // ── Core auth ──────────────────────────────────────────────
  async signup(userData) {
    const response = await api.post('/auth/signup', userData);
    return response.data;
  },

  async login(identifier, password) {
    const isPhone = !identifier.includes('@');
    const body = isPhone
      ? { phone: identifier, password }
      : { email: identifier, password };
    const response = await api.post('/auth/login', body);
    return response.data;
  },

  async verifyOtp(phone, otp_code) {
    const response = await api.post('/auth/verify', { phone, otp_code });
    return response.data;
  },

  async resendOtp(phone) {
    const response = await api.post('/auth/resend-otp', { phone });
    return response.data;
  },

  async refreshToken(token) {
    const response = await api.post('/auth/refresh-token', {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  },

  async logout() {
    const response = await api.post('/auth/logout');
    return response.data;
  },

  // ── Role-specific registration ─────────────────────────────
  /**
   * Register a rider — single step.
   * Sends: full_name, phone, email?, password, role:'rider', language, country
   */
  async registerRider(data) {
    const response = await api.post('/auth/signup', { ...data, role: 'rider' });
    return response.data;
  },

  /**
   * Register a driver — two steps.
   * Step 1: /auth/signup with role:'driver' (creates user + initial driver record)
   * Step 2: /auth/register-driver (completes driver + vehicle details)
   */
  async registerDriverSignup(data) {
    const response = await api.post('/auth/signup', { ...data, role: 'driver' });
    return response.data;
  },

  async registerDriverComplete(driverData) {
    const response = await api.post('/auth/register-driver', driverData);
    return response.data;
  },

  /**
   * Register a fleet owner — two steps.
   * Step 1: /auth/signup with role:'fleet_owner'
   * Step 2: /auth/register-fleet-owner (creates fleet)
   */
  async registerFleetOwnerSignup(data) {
    const response = await api.post('/auth/signup', { ...data, role: 'fleet_owner' });
    return response.data;
  },

  async registerFleetOwnerComplete(fleetData) {
    const response = await api.post('/auth/register-fleet-owner', fleetData);
    return response.data;
  },

  // ── Profile ────────────────────────────────────────────────
  async updateProfile(profileData) {
    const response = await api.put('/users/profile', profileData);
    return response.data;
  },

  async getProfile() {
    const response = await api.get('/users/profile');
    return response.data;
  },

  async changePassword(currentPassword, newPassword) {
    const response = await api.put('/users/password', { currentPassword, newPassword });
    return response.data;
  },

  async deleteAccount() {
    const response = await api.delete('/users/account');
    return response.data;
  },

  async forgotPassword(identifier) {
    const response = await api.post('/auth/forgot-password', { identifier });
    return response.data;
  },

  /**
   * @param {string} identifier  email or phone used in forgotPassword()
   * @param {string} otpCode     6-digit code received via email/SMS
   * @param {string} newPassword new password (min 6 chars)
   */
  async resetPassword(identifier, otpCode, newPassword) {
    const response = await api.post('/auth/reset-password', {
      identifier,
      otp_code:     otpCode,
      new_password: newPassword,
    });
    return response.data;
  },
};

// Driver shift-start selfie check (Uber Real-Time ID style)
export const userService = {
  async getSelfieCheckStatus() {
    const response = await api.get('/users/drivers/me/selfie-check');
    return response.data;
  },
  async submitSelfieCheck(data) {
    const response = await api.post('/users/drivers/me/selfie-check', data);
    return response.data;
  },
};
