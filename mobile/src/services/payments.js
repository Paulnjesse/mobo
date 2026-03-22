import api from './api';

export const paymentsService = {
  async addPaymentMethod(methodData) {
    const response = await api.post('/payments/methods', methodData);
    return response.data;
  },

  async listMethods() {
    const response = await api.get('/payments/methods');
    return response.data;
  },

  async setDefaultMethod(methodId) {
    const response = await api.put(`/payments/methods/${methodId}/default`);
    return response.data;
  },

  async deleteMethod(methodId) {
    const response = await api.delete(`/payments/methods/${methodId}`);
    return response.data;
  },

  /**
   * Initiate a ride payment.
   * For mobile-money methods the server returns { pending: true, reference_id }.
   * Callers must poll checkStatus() until resolved.
   *
   * @param {string} rideId
   * @param {{ method, phone, payment_method_id, tip, roundUp }} paymentData
   */
  async chargeRide(rideId, paymentData) {
    const response = await api.post('/payments/charge', {
      ride_id: rideId,
      ...paymentData,
    });
    return response.data;
  },

  /**
   * Poll the status of a pending mobile-money payment.
   * Returns { status: 'pending' | 'completed' | 'failed', payment_id, ... }
   */
  async checkStatus(referenceId) {
    const response = await api.get(`/payments/status/${referenceId}`);
    return response.data;
  },

  async getHistory(params = {}) {
    const response = await api.get('/payments/history', { params });
    return response.data;
  },

  async subscribe(planId, paymentMethodId) {
    const response = await api.post('/payments/subscribe', { planId, paymentMethodId });
    return response.data;
  },

  async cancelSubscription() {
    const response = await api.post('/payments/subscription/cancel');
    return response.data;
  },

  async getSubscription() {
    const response = await api.get('/payments/subscription');
    return response.data;
  },

  async getWallet() {
    const response = await api.get('/payments/wallet');
    return response.data;
  },

  async getLoyaltyPoints() {
    const response = await api.get('/payments/loyalty/points');
    return response.data;
  },

  async getLoyaltyHistory() {
    const response = await api.get('/payments/loyalty/history');
    return response.data;
  },

  async redeemPoints(points) {
    const response = await api.post('/payments/loyalty/redeem', { points });
    return response.data;
  },

  /**
   * Create a Stripe PaymentIntent for the card payment sheet.
   * Returns { client_secret, payment_intent_id, publishable_key, amount, currency }
   */
  async createPaymentIntent(rideId, amount) {
    const response = await api.post('/payments/stripe/payment-intent', { ride_id: rideId, amount });
    return response.data;
  },
};
