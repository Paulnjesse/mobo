import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'https://mobo-api-gateway.onrender.com/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Module-level token store — set by AuthContext after login / 2FA completion.
// Kept in memory (not localStorage) to prevent XSS token theft.
let _authToken = null;
export function setAuthToken(token) { _authToken = token; }
export function clearAuthToken()    { _authToken = null;  }

// Request interceptor — attach JWT token from memory store
api.interceptors.request.use(
  (config) => {
    if (_authToken) {
      config.headers.Authorization = `Bearer ${_authToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle 401 unauthorized
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      clearAuthToken();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth
export const authAPI = {
  login:       (email, password)   => api.post('/auth/login', { email, password }),
  logout:      ()                  => api.post('/auth/logout'),
  // 2FA — step 2 of admin login: validate TOTP or backup code
  validate2FA: (userId, token)     => api.post('/auth/2fa/validate', { user_id: userId, token }),
  // 2FA management (authenticated admin)
  get2FAStatus:  ()      => api.get('/auth/2fa/status'),
  setup2FA:      ()      => api.post('/auth/2fa/setup'),
  verify2FA:     (token) => api.post('/auth/2fa/verify', { token }),
  disable2FA:    (token) => api.delete('/auth/2fa', { data: { token } }),
};

// Dashboard
export const dashboardAPI = {
  getStats: () => api.get('/admin/dashboard/stats'),
  getRevenueChart: (days = 7) => api.get(`/admin/dashboard/revenue?days=${days}`),
  getRidesChart: (days = 7) => api.get(`/admin/dashboard/rides-chart?days=${days}`),
  getPaymentMethods: () => api.get('/admin/dashboard/payment-methods'),
  getRecentRides: () => api.get('/admin/dashboard/recent-rides'),
  getRecentUsers: () => api.get('/admin/dashboard/recent-users'),
};

// Users
export const usersAPI = {
  getAll: (params) => api.get('/admin/users', { params }),
  getById: (id) => api.get(`/admin/users/${id}`),
  update: (id, data) => api.put(`/admin/users/${id}`, data),
  suspend: (id) => api.patch(`/admin/users/${id}/suspend`),
  unsuspend: (id) => api.patch(`/admin/users/${id}/unsuspend`),
  delete: (id) => api.delete(`/admin/users/${id}`),
  getStats: () => api.get('/admin/users/stats'),
};

// Drivers
export const driversAPI = {
  getAll: (params) => api.get('/admin/drivers', { params }),
  getById: (id) => api.get(`/admin/drivers/${id}`),
  update: (id, data) => api.put(`/admin/drivers/${id}`, data),
  approve: (id) => api.patch(`/admin/drivers/${id}/approve`),
  suspend: (id) => api.patch(`/admin/drivers/${id}/suspend`),
  unsuspend: (id) => api.patch(`/admin/drivers/${id}/unsuspend`),
  delete: (id) => api.delete(`/admin/drivers/${id}`),
  getStats: () => api.get('/admin/drivers/stats'),
};

// Rides
export const ridesAPI = {
  getAll: (params) => api.get('/admin/rides', { params }),
  getById: (id) => api.get(`/admin/rides/${id}`),
  getStats: () => api.get('/admin/rides/stats'),
};

// Payments
export const paymentsAPI = {
  getAll: (params) => api.get('/admin/payments', { params }),
  getStats: () => api.get('/admin/payments/stats'),
  getRevenueChart: (days = 30) => api.get(`/admin/payments/revenue?days=${days}`),
  getMethodBreakdown: () => api.get('/admin/payments/methods'),
};

// Map
export const mapAPI = {
  getOnlineDrivers: () => api.get('/admin/map/drivers'),
  getActiveRides: () => api.get('/admin/map/active-rides'),
};

// Surge Pricing
export const surgeAPI = {
  getAll: () => api.get('/admin/surge'),
  create: (data) => api.post('/admin/surge', data),
  update: (id, data) => api.patch(`/admin/surge/${id}`, data),
  toggle: (id) => api.patch(`/admin/surge/${id}/toggle`),
  delete: (id) => api.delete(`/admin/surge/${id}`),
};

// Promotions
export const promotionsAPI = {
  getAll: () => api.get('/admin/promotions'),
  create: (data) => api.post('/admin/promotions', data),
  update: (id, data) => api.patch(`/admin/promotions/${id}`, data),
  toggle: (id) => api.patch(`/admin/promotions/${id}/toggle`),
  delete: (id) => api.delete(`/admin/promotions/${id}`),
};

// Notifications
export const notificationsAPI = {
  send: (data) => api.post('/admin/notifications/send', data),
  getHistory: (params) => api.get('/admin/notifications/history', { params }),
  getStats: () => api.get('/admin/notifications/stats'),
};

// Settings
export const settingsAPI = {
  get: () => api.get('/admin/settings'),
  update: (data) => api.put('/admin/settings', data),
};

// Admin Management (staff + roles + permissions)
export const adminMgmtAPI = {
  // Permissions for current user
  getMyPermissions: () => api.get('/admin/admin-mgmt/my-permissions'),

  // Admin staff
  listStaff:    ()         => api.get('/admin/admin-mgmt/staff'),
  createStaff:  (data)     => api.post('/admin/admin-mgmt/staff', data),
  updateStaff:  (id, data) => api.patch(`/admin/admin-mgmt/staff/${id}`, data),
  archiveStaff: (id)       => api.delete(`/admin/admin-mgmt/staff/${id}`),

  // Roles
  listRoles:    ()         => api.get('/admin/admin-mgmt/roles'),
  createRole:   (data)     => api.post('/admin/admin-mgmt/roles', data),
  updateRole:   (id, data) => api.patch(`/admin/admin-mgmt/roles/${id}`, data),
  archiveRole:  (id)       => api.delete(`/admin/admin-mgmt/roles/${id}`),

  // Permissions catalogue
  listPermissions: () => api.get('/admin/admin-mgmt/permissions'),

  // Soft archive (replaces hard delete for users/drivers)
  archiveUser:   (id) => api.patch(`/admin/admin-mgmt/users/${id}/archive`),
  archiveDriver: (id) => api.patch(`/admin/admin-mgmt/drivers/${id}/archive`),
};

// Admin Data (encrypted docs, access logs, notifications)
export const adminDataAPI = {
  // Documents
  listDocuments:   (userId)        => api.get(`/admin/admin-data/users/${userId}/documents`),
  uploadDocument:  (userId, data)  => api.post(`/admin/admin-data/users/${userId}/documents`, data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  uploadDocumentBase64: (userId, data) => api.post(`/admin/admin-data/users/${userId}/documents`, data),
  downloadDocument:(docId)         => api.get(`/admin/admin-data/documents/${docId}/download`, { responseType: 'blob' }),
  verifyDocument:  (docId)         => api.patch(`/admin/admin-data/documents/${docId}/verify`),
  archiveDocument: (docId)         => api.delete(`/admin/admin-data/documents/${docId}`),

  // PII reveal (logged + notified)
  revealFields: (userId, fields) => api.post(`/admin/admin-data/users/${userId}/reveal`, { fields }),

  // Access audit log
  getAccessLogs: (params) => api.get('/admin/admin-data/access-logs', { params }),

  // Notifications
  getNotifications: ()   => api.get('/admin/admin-data/notifications'),
  markRead:        (id)  => api.patch(`/admin/admin-data/notifications/${id}/read`),
  markAllRead:     ()    => api.patch('/admin/admin-data/notifications/read-all'),

  // Vehicle Inspections
  getVehicleInspections:  (params) => api.get('/rides/admin/inspections', { params }),
  getVehicleInspection:   (id)     => api.get(`/rides/admin/inspections/${id}`),
  reviewVehicleInspection:(id, data) => api.patch(`/rides/admin/inspections/${id}/review`, data),

  // Driver Selfie Checks
  getSelfieChecks:        (params) => api.get('/users/admin/selfie-checks', { params }),
  reviewSelfieCheck:      (id, data) => api.patch(`/users/admin/selfie-checks/${id}/review`, data),
};

// Ad Platform (AdMob + AdSense + Animated Splash)
export const adPlatformAPI = {
  listAll:      ()               => api.get('/rides/ads/platform/all'),
  upsert:       (platform, data) => api.put(`/rides/ads/platform/${platform}`, data),
  updateSplash: (data)           => api.put('/rides/ads/platform/splash/config', data),
  getConfig:    (platform)       => api.get(`/rides/ads/platform/config/${platform}`),
  getSplash:    ()               => api.get('/rides/ads/platform/splash'),
};

// Wallet Credit Packs
export const walletPacksAPI = {
  listAll:       ()        => api.get('/payments/admin/wallet-packs'),
  create:        (data)    => api.post('/payments/admin/wallet-packs', data),
  update:        (id, data)=> api.put(`/payments/admin/wallet-packs/${id}`, data),
  toggle:        (id)      => api.patch(`/payments/admin/wallet-packs/${id}/toggle`),
  remove:        (id)      => api.delete(`/payments/admin/wallet-packs/${id}`),
  listPurchases: (params)  => api.get('/payments/admin/wallet-packs/purchases', { params }),
};

// Insurance Claims
export const insuranceAPI = {
  // Admin
  listAll:  (params) => api.get('/insurance/admin/all', { params }),
  getStats: ()       => api.get('/insurance/admin/stats'),
  update:   (id, data) => api.patch(`/insurance/admin/${id}`, data),
  // Rider / Driver
  file:     (data)   => api.post('/insurance', data),
  getMine:  ()       => api.get('/insurance'),
  getById:  (id)     => api.get(`/insurance/${id}`),
};

// Background Check (Checkr)
export const bgcAPI = {
  trigger:   (driverId)         => api.post(`/admin/drivers/${driverId}/bgc`),
  getStatus: (driverId)         => api.get(`/admin/drivers/${driverId}/bgc`),
};

// Commuter Passes
export const commuterPassAPI = {
  listAll:  ()        => api.get('/rides/admin/commuter-passes'),
  create:   (data)    => api.post('/rides/admin/commuter-passes', data),
  update:   (id, data)=> api.put(`/rides/admin/commuter-passes/${id}`, data),
  toggle:   (id)      => api.patch(`/rides/admin/commuter-passes/${id}/toggle`),
  remove:   (id)      => api.delete(`/rides/admin/commuter-passes/${id}`),
};
