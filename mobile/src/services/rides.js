import api from './api';

export const ridesService = {
  async requestRide(rideData) {
    const response = await api.post('/rides', rideData);
    return response.data;
  },

  async getFareEstimate(pickup, dropoff, rideType) {
    const response = await api.post('/rides/fare-estimate', {
      pickup,
      dropoff,
      rideType,
    });
    return response.data;
  },

  async getRide(rideId) {
    const response = await api.get(`/rides/${rideId}`);
    return response.data;
  },

  async cancelRide(rideId, reason) {
    const response = await api.post(`/rides/${rideId}/cancel`, { reason });
    return response.data;
  },

  async listRides(params = {}) {
    const response = await api.get('/rides', { params });
    return response.data;
  },

  async rateRide(rideId, rating, comment) {
    const response = await api.post(`/rides/${rideId}/rate`, { rating, comment });
    return response.data;
  },

  async addTip(rideId, amount) {
    const response = await api.post(`/rides/${rideId}/tip`, { amount });
    return response.data;
  },

  async roundUpFare(rideId) {
    const response = await api.post(`/rides/${rideId}/round-up`);
    return response.data;
  },

  async getSurgeInfo(latitude, longitude) {
    const response = await api.get('/rides/surge', {
      params: { latitude, longitude },
    });
    return response.data;
  },

  async getNearbyDrivers(latitude, longitude, rideType) {
    const response = await api.get('/rides/nearby-drivers', {
      params: { latitude, longitude, rideType },
    });
    return response.data;
  },

  async scheduleRide(rideData) {
    const response = await api.post('/rides/schedule', rideData);
    return response.data;
  },

  async acceptRide(rideId) {
    const response = await api.post(`/rides/${rideId}/accept`);
    return response.data;
  },

  async declineRide(rideId, reason) {
    const response = await api.post(`/rides/${rideId}/decline`, { reason });
    return response.data;
  },

  async arrivedAtPickup(rideId) {
    const response = await api.post(`/rides/${rideId}/arrived`);
    return response.data;
  },

  async startRide(rideId, otp) {
    const response = await api.post(`/rides/${rideId}/start`, { otp });
    return response.data;
  },

  async completeRide(rideId) {
    const response = await api.post(`/rides/${rideId}/complete`);
    return response.data;
  },

  async getDriverStats() {
    const response = await api.get('/rides/driver/stats');
    return response.data;
  },

  async getPendingRideRequests() {
    const response = await api.get('/rides/driver/pending');
    return response.data;
  },
};
