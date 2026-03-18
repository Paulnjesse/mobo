import api from './api';

export const fleetService = {
  // ── Fleet CRUD ─────────────────────────────────────────────

  /** Create a new fleet (when current fleet has reached 15 vehicles) */
  async createFleet(data) {
    // data: { name, description?, city?, country? }
    const response = await api.post('/fleet', data);
    return response.data;
  },

  /** Get all fleets owned by the authenticated user */
  async getMyFleets() {
    const response = await api.get('/fleet');
    return response.data;
  },

  /** Get a specific fleet with all its vehicles and stats */
  async getFleet(fleetId) {
    const response = await api.get(`/fleet/${fleetId}`);
    return response.data;
  },

  // ── Vehicle management ─────────────────────────────────────

  /**
   * Add a vehicle to a fleet.
   * data: { make, model, year, plate, color, vehicle_type, seats,
   *         is_wheelchair_accessible, insurance_doc_url, insurance_expiry }
   */
  async addVehicle(fleetId, vehicleData) {
    const response = await api.post(`/fleet/${fleetId}/vehicles`, vehicleData);
    return response.data;
  },

  /**
   * Update a vehicle's details.
   * data: any subset of vehicle fields
   */
  async updateVehicle(fleetId, vehicleId, data) {
    const response = await api.put(`/fleet/${fleetId}/vehicles/${vehicleId}`, data);
    return response.data;
  },

  /**
   * Remove a vehicle from a fleet.
   * Will fail if fleet is active and would drop below 5 vehicles.
   */
  async removeVehicle(fleetId, vehicleId) {
    const response = await api.delete(`/fleet/${fleetId}/vehicles/${vehicleId}`);
    return response.data;
  },

  /** Get all vehicles in a fleet */
  async getFleetVehicles(fleetId) {
    const response = await api.get(`/fleet/${fleetId}/vehicles`);
    return response.data;
  },

  // ── Driver assignment ──────────────────────────────────────

  /**
   * Assign a driver to a fleet vehicle.
   * driverPhone: phone or email of the registered MOBO driver
   */
  async assignDriver(fleetId, vehicleId, driverPhone) {
    const response = await api.put(
      `/fleet/${fleetId}/vehicles/${vehicleId}/driver`,
      { driver_phone_or_email: driverPhone }
    );
    return response.data;
  },

  /** Remove the assigned driver from a fleet vehicle */
  async unassignDriver(fleetId, vehicleId) {
    const response = await api.delete(
      `/fleet/${fleetId}/vehicles/${vehicleId}/driver`
    );
    return response.data;
  },

  // ── Earnings ───────────────────────────────────────────────

  /**
   * Get earnings for a fleet.
   * period: 'week' | 'month' | 'year' | 'all'
   */
  async getEarnings(fleetId, period = 'month') {
    const response = await api.get(`/fleet/${fleetId}/earnings`, {
      params: { period },
    });
    return response.data;
  },
};
