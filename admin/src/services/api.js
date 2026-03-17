import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'https://mobo-api-gateway.onrender.com/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('mobo_admin_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
      localStorage.removeItem('mobo_admin_token');
      localStorage.removeItem('mobo_admin_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
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
  suspend: (id) => api.patch(`/admin/users/${id}/suspend`),
  unsuspend: (id) => api.patch(`/admin/users/${id}/unsuspend`),
  delete: (id) => api.delete(`/admin/users/${id}`),
  getStats: () => api.get('/admin/users/stats'),
};

// Drivers
export const driversAPI = {
  getAll: (params) => api.get('/admin/drivers', { params }),
  getById: (id) => api.get(`/admin/drivers/${id}`),
  approve: (id) => api.patch(`/admin/drivers/${id}/approve`),
  suspend: (id) => api.patch(`/admin/drivers/${id}/suspend`),
  unsuspend: (id) => api.patch(`/admin/drivers/${id}/unsuspend`),
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
