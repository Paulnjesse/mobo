import api from './api';

export const ridesService = {
  async requestRide(rideData) {
    const response = await api.post('/rides', rideData);
    return response.data;
  },

  async getFareEstimate(pickup, dropoff, rideType, stops = []) {
    // Backend expects: pickup_location/dropoff_location as {lat,lng}, ride_type, stops
    const response = await api.post('/rides/fare', {
      pickup_location: { lat: pickup.lat ?? pickup.latitude, lng: pickup.lng ?? pickup.longitude },
      dropoff_location: { lat: dropoff.lat ?? dropoff.latitude, lng: dropoff.lng ?? dropoff.longitude },
      ride_type: rideType,
      stops,
    });
    const data = response.data;

    // Normalize backend response → shape FareEstimateScreen consumes
    const distanceKm = parseFloat(data.distance_km) || 0;
    const durationMin = data.duration_minutes || 0;
    const surge = data.surge_multiplier || 1;
    const BASE_FARE = 1000;
    const PER_KM = 700;
    const PER_MIN = 100;

    const fareForType = data.fare || {};
    return {
      baseFare:            fareForType.base       ?? Math.round(BASE_FARE * surge),
      distanceFare:        Math.round(PER_KM * distanceKm * surge),
      timeFare:            Math.round(PER_MIN * durationMin * surge),
      bookingFee:          fareForType.bookingFee ?? 500,
      serviceFee:          fareForType.serviceFee ?? 0,
      surgeMultiplier:     surge,
      subscriptionDiscount: 0,
      total:               fareForType.total      ?? 0,
      distanceKm,
      durationMin,
      etaMinutes:          Math.max(3, Math.round(durationMin * 0.3)),
      // Per-type fares for RideCompareScreen
      faresPerType:        data.fares || null,
    };
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

  async getConciergeBookings() {
    const response = await api.get('/rides/concierge');
    return response.data;
  },

  async createConciergeBooking(bookingData) {
    const response = await api.post('/rides/concierge', bookingData);
    return response.data;
  },

  // ── Fare Split ──────────────────────────────────────────────────────────────
  async createFareSplit(rideId, participants, note) {
    const response = await api.post(`/rides/${rideId}/split-fare`, { participants, note });
    return response.data;
  },

  async getFareSplit(rideId) {
    const response = await api.get(`/rides/${rideId}/split-fare`);
    return response.data;
  },

  async markParticipantPaid(participantId, paymentMethod) {
    const response = await api.patch(`/rides/split-fare/participants/${participantId}/pay`, { payment_method: paymentMethod });
    return response.data;
  },

  // ── Driver Earnings ─────────────────────────────────────────────────────────
  async getDriverEarnings(period = 'week') {
    const response = await api.get('/rides/driver/earnings', { params: { period } });
    return response.data;
  },

  // ── Rental Rides ────────────────────────────────────────────────────────────
  async getRentalPackages() {
    const response = await api.get('/rides/rental/packages');
    return response.data;
  },

  async requestRentalRide(pickupAddress, pickupLocation, rentalPackage, paymentMethod) {
    const response = await api.post('/rides', {
      pickup_address: pickupAddress,
      pickup_location: pickupLocation,
      dropoff_address: pickupAddress,
      dropoff_location: pickupLocation,
      ride_type: 'rental',
      rental_package: rentalPackage,
      payment_method: paymentMethod,
    });
    return response.data;
  },

  // ── Price Lock ──────────────────────────────────────────────────────────────
  async lockFarePrice(pickupLocation, dropoffLocation, pickupAddress, dropoffAddress, rideType = 'standard') {
    const response = await api.post('/rides/fare/lock', {
      pickup_location: pickupLocation,
      dropoff_location: dropoffLocation,
      pickup_address: pickupAddress,
      dropoff_address: dropoffAddress,
      ride_type: rideType,
    });
    return response.data;
  },

  // ── Outstation / Intercity ──────────────────────────────────────────────────
  async getOutstationCities() {
    const response = await api.get('/rides/outstation/cities');
    return response.data;
  },

  async getOutstationEstimate(originCity, destinationCity, days, vehicleCategory, numPassengers) {
    const response = await api.post('/rides/outstation/estimate', {
      origin_city: originCity, destination_city: destinationCity,
      days, vehicle_category: vehicleCategory, num_passengers: numPassengers,
    });
    return response.data;
  },

  async createOutstationBooking(data) {
    const response = await api.post('/rides/outstation', data);
    return response.data;
  },

  async getMyOutstationBookings() {
    const response = await api.get('/rides/outstation/mine');
    return response.data;
  },

  async cancelOutstationBooking(bookingId) {
    const response = await api.patch(`/rides/outstation/${bookingId}/cancel`);
    return response.data;
  },

  // ── Airport Mode ────────────────────────────────────────────────────────────
  async getAirportZones() {
    const response = await api.get('/rides/airport/zones');
    return response.data;
  },

  async airportCheckIn(airportZoneId) {
    const response = await api.post('/rides/airport/checkin', { airport_zone_id: airportZoneId });
    return response.data;
  },

  async airportCheckOut() {
    const response = await api.delete('/rides/airport/checkout');
    return response.data;
  },

  async getMyAirportQueuePosition() {
    const response = await api.get('/rides/airport/my-position');
    return response.data;
  },

  // ── Call Proxy ──────────────────────────────────────────────────────────────
  async initiateCall(rideId) {
    const response = await api.post(`/rides/${rideId}/initiate-call`);
    return response.data;
  },

  async endCall(rideId, sessionToken, durationSeconds) {
    const response = await api.post(`/rides/${rideId}/end-call`, {
      session_token: sessionToken, duration_seconds: durationSeconds,
    });
    return response.data;
  },

  // ── Cancellation fee preview ─────────────────────────────────────────────
  async getCancellationFeePreview(rideId) {
    const response = await api.get(`/rides/${rideId}/cancellation-fee`);
    return response.data;
  },

  // ── Commuter Passes ──────────────────────────────────────────────────────
  async getPassTiers() {
    const response = await api.get('/rides/commuter-passes/tiers');
    return response.data;
  },

  async getMyPasses() {
    const response = await api.get('/rides/commuter-passes');
    return response.data;
  },

  async createCommuterPass(data) {
    const response = await api.post('/rides/commuter-passes', data);
    return response.data;
  },

  async cancelCommuterPass(passId) {
    const response = await api.delete(`/rides/commuter-passes/${passId}`);
    return response.data;
  },

  // ── Support Chat ─────────────────────────────────────────────────────────
  async createSupportTicket(subject, category, rideId = null) {
    const response = await api.post('/rides/support/tickets', { subject, category, ride_id: rideId });
    return response.data;
  },

  async getMySupportTickets() {
    const response = await api.get('/rides/support/tickets');
    return response.data;
  },

  async getSupportMessages(ticketId) {
    const response = await api.get(`/rides/support/tickets/${ticketId}/messages`);
    return response.data;
  },

  async sendSupportMessage(ticketId, content) {
    const response = await api.post(`/rides/support/tickets/${ticketId}/messages`, { content });
    return response.data;
  },

  async closeSupportTicket(ticketId) {
    const response = await api.patch(`/rides/support/tickets/${ticketId}/close`);
    return response.data;
  },

  // Vehicle Inspection (FREE NOW / Uber style)
  async submitVehicleInspection(data) {
    const response = await api.post('/rides/inspections', data);
    return response.data;
  },
  async getMyInspections() {
    const response = await api.get('/rides/inspections/me');
    return response.data;
  },
  async getCurrentInspection() {
    const response = await api.get('/rides/inspections/me/current');
    return response.data;
  },
};
