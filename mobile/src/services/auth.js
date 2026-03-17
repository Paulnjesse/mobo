import api from './api';

export const authService = {
  async signup(userData) {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },

  async login(identifier, password) {
    const response = await api.post('/auth/login', { identifier, password });
    return response.data;
  },

  async verifyOtp(phone, otp) {
    const response = await api.post('/auth/verify-otp', { phone, otp });
    return response.data;
  },

  async resendOtp(phone) {
    const response = await api.post('/auth/resend-otp', { phone });
    return response.data;
  },

  async refreshToken(token) {
    const response = await api.post('/auth/refresh', { token });
    return response.data;
  },

  async logout() {
    const response = await api.post('/auth/logout');
    return response.data;
  },

  async forgotPassword(identifier) {
    const response = await api.post('/auth/forgot-password', { identifier });
    return response.data;
  },

  async resetPassword(token, newPassword) {
    const response = await api.post('/auth/reset-password', { token, newPassword });
    return response.data;
  },

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
};
