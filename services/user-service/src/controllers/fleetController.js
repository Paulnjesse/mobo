const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

/**
 * POST /fleet
 * Fleet owner creates a new fleet.
 * Previous fleet must have >= 5 vehicles before creating a new one.
 * Increments fleet_number.
 */
const createFleet = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { name, description, city, country = 'Cameroon' } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Fleet name is required' });
    }

    // Get all existing fleets and their vehicle counts
    const existingFleets = await db.query(
      `SELECT f.id, f.fleet_number, f.is_active,
              (SELECT COUNT(*) FROM fleet_vehicles fv WHERE fv.fleet_id = f.id) as vehicle_count
       FROM fleets f WHERE f.owner_id = $1
       ORDER BY f.fleet_number DESC`,
      [ownerId]
    );

    let nextFleetNumber = 1;

    if (existingFleets.rows.length > 0) {
      const latestFleet = existingFleets.rows[0];
      const latestVehicleCount = parseInt(latestFleet.vehicle_count, 10);

      // Validate: previous fleet must have >= 5 vehicles
      if (latestVehicleCount < 5) {
        return res.status(400).json({
          success: false,
          message: `Your current fleet (Fleet #${latestFleet.fleet_number}) must have at least 5 vehicles before you can create a new fleet. Currently has ${latestVehicleCount} vehicle(s).`
        });
      }

      nextFleetNumber = latestFleet.fleet_number + 1;
    }

    const fleetResult = await db.query(
      `INSERT INTO fleets (owner_id, name, description, city, country, fleet_number, is_active, is_approved)
       VALUES ($1, $2, $3, $4, $5, $6, false, false)
       RETURNING id, name, description, city, country, fleet_number, is_active, is_approved, created_at`,
      [ownerId, name, description || null, city || null, country, nextFleetNumber]
    );

    const fleet = fleetResult.rows[0];

    res.status(201).json({
      success: true,
      message: `Fleet #${nextFleetNumber} created successfully. Add 5-15 vehicles to activate it.`,
      data: { fleet, vehicle_count: 0 }
    });
  } catch (err) {
    logger.error('[CreateFleet Error]', err);
    res.status(500).json({ success: false, message: 'Failed to create fleet' });
  }
};

/**
 * GET /fleet
 * Get all fleets owned by this user with vehicle counts and earnings.
 */
const getMyFleets = async (req, res) => {
  try {
    const ownerId = req.user.id;

    const result = await db.query(
      `SELECT f.*,
              (SELECT COUNT(*) FROM fleet_vehicles fv WHERE fv.fleet_id = f.id) as vehicle_count,
              (SELECT COUNT(*) FROM fleet_vehicles fv WHERE fv.fleet_id = f.id AND fv.is_active = true) as active_vehicle_count,
              (SELECT COUNT(*) FROM fleet_vehicles fv WHERE fv.fleet_id = f.id AND fv.assigned_driver_id IS NOT NULL) as assigned_driver_count
       FROM fleets f
       WHERE f.owner_id = $1
       ORDER BY f.fleet_number ASC`,
      [ownerId]
    );

    res.json({
      success: true,
      data: { fleets: result.rows }
    });
  } catch (err) {
    logger.error('[GetMyFleets Error]', err);
    res.status(500).json({ success: false, message: 'Failed to fetch fleets' });
  }
};

/**
 * GET /fleet/:id
 * Get fleet details + all vehicles + assigned drivers + stats.
 */
const getFleet = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;

    const fleetResult = await db.query(
      `SELECT f.*,
              (SELECT COUNT(*) FROM fleet_vehicles fv WHERE fv.fleet_id = f.id) as vehicle_count
       FROM fleets f
       WHERE f.id = $1 AND (f.owner_id = $2 OR $3 = 'admin')`,
      [id, ownerId, req.user.role]
    );

    if (fleetResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Fleet not found' });
    }

    const fleet = fleetResult.rows[0];

    // Get all vehicles in this fleet
    const vehiclesResult = await db.query(
      `SELECT fv.*,
              u.full_name as assigned_driver_name,
              u.phone as assigned_driver_phone,
              u.profile_picture as assigned_driver_photo
       FROM fleet_vehicles fv
       LEFT JOIN users u ON u.id = fv.assigned_driver_id
       WHERE fv.fleet_id = $1
       ORDER BY fv.created_at ASC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        fleet,
        vehicles: vehiclesResult.rows
      }
    });
  } catch (err) {
    logger.error('[GetFleet Error]', err);
    res.status(500).json({ success: false, message: 'Failed to fetch fleet' });
  }
};

/**
 * POST /fleet/:id/vehicles
 * Add a vehicle to a fleet.
 * Validates fleet max of 15 vehicles.
 * If adding 5th vehicle: sets fleet.is_active = true.
 */
const addVehicleToFleet = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id: fleetId } = req.params;
    const {
      make, model, year, plate, color, vehicle_type,
      seats, is_wheelchair_accessible, insurance_doc_url,
      insurance_expiry, vehicle_doc_url, photos
    } = req.body;

    if (!make || !model || !year || !plate || !vehicle_type) {
      return res.status(400).json({
        success: false,
        message: 'make, model, year, plate, and vehicle_type are required'
      });
    }

    // Verify fleet belongs to owner
    const fleetResult = await db.query(
      'SELECT id, owner_id, max_vehicles, min_vehicles, fleet_number FROM fleets WHERE id = $1 AND owner_id = $2',
      [fleetId, ownerId]
    );

    if (fleetResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Fleet not found' });
    }

    const fleet = fleetResult.rows[0];

    // Count current vehicles
    const countResult = await db.query(
      'SELECT COUNT(*) FROM fleet_vehicles WHERE fleet_id = $1',
      [fleetId]
    );
    const currentCount = parseInt(countResult.rows[0].count, 10);

    if (currentCount >= fleet.max_vehicles) {
      return res.status(400).json({
        success: false,
        message: `This fleet is full (${fleet.max_vehicles} vehicles maximum). Create a new fleet to add more vehicles.`
      });
    }

    // Add vehicle
    const vehicleResult = await db.query(
      `INSERT INTO fleet_vehicles (
         fleet_id, owner_id, make, model, year, plate, color, vehicle_type,
         seats, is_wheelchair_accessible, insurance_doc_url, insurance_expiry,
         vehicle_doc_url, photos, is_active, is_approved
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,false)
       RETURNING *`,
      [fleetId, ownerId, make, model, parseInt(year, 10),
       plate.toUpperCase(), color || null, vehicle_type,
       seats || 4, is_wheelchair_accessible || false,
       insurance_doc_url || null, insurance_expiry || null,
       vehicle_doc_url || null, JSON.stringify(photos || [])]
    );

    const vehicle = vehicleResult.rows[0];
    const newCount = currentCount + 1;

    // If adding the 5th vehicle: activate fleet
    if (newCount >= fleet.min_vehicles) {
      await db.query(
        'UPDATE fleets SET is_active = true WHERE id = $1',
        [fleetId]
      );
    }

    // Update fleet total (for response)
    const updatedFleet = await db.query(
      `SELECT f.*, (SELECT COUNT(*) FROM fleet_vehicles fv WHERE fv.fleet_id = f.id) as vehicle_count
       FROM fleets f WHERE f.id = $1`,
      [fleetId]
    );

    res.status(201).json({
      success: true,
      message: `Vehicle added to Fleet #${fleet.fleet_number}. ${newCount}/${fleet.max_vehicles} vehicles.`,
      data: {
        vehicle,
        fleet: updatedFleet.rows[0],
        remaining_slots: fleet.max_vehicles - newCount,
        fleet_activated: newCount === fleet.min_vehicles
      }
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'A vehicle with this plate number already exists' });
    }
    logger.error('[AddVehicleToFleet Error]', err);
    res.status(500).json({ success: false, message: 'Failed to add vehicle to fleet' });
  }
};

/**
 * PUT /fleet/:id/vehicles/:vehicleId
 * Update vehicle details.
 */
const updateVehicle = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id: fleetId, vehicleId } = req.params;
    const {
      make, model, year, plate, color, vehicle_type,
      seats, is_wheelchair_accessible, insurance_doc_url,
      insurance_expiry, vehicle_doc_url, photos
    } = req.body;

    // Verify fleet and vehicle belong to owner
    const vehicleResult = await db.query(
      'SELECT fv.id FROM fleet_vehicles fv JOIN fleets f ON f.id = fv.fleet_id WHERE fv.id = $1 AND fv.fleet_id = $2 AND f.owner_id = $3',
      [vehicleId, fleetId, ownerId]
    );

    if (vehicleResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    const updates = [];
    const values = [];
    let idx = 1;

    if (make) { updates.push(`make = $${idx++}`); values.push(make); }
    if (model) { updates.push(`model = $${idx++}`); values.push(model); }
    if (year) { updates.push(`year = $${idx++}`); values.push(parseInt(year, 10)); }
    if (plate) { updates.push(`plate = $${idx++}`); values.push(plate.toUpperCase()); }
    if (color !== undefined) { updates.push(`color = $${idx++}`); values.push(color); }
    if (vehicle_type) { updates.push(`vehicle_type = $${idx++}`); values.push(vehicle_type); }
    if (seats) { updates.push(`seats = $${idx++}`); values.push(seats); }
    if (is_wheelchair_accessible !== undefined) { updates.push(`is_wheelchair_accessible = $${idx++}`); values.push(is_wheelchair_accessible); }
    if (insurance_doc_url !== undefined) { updates.push(`insurance_doc_url = $${idx++}`); values.push(insurance_doc_url); }
    if (insurance_expiry !== undefined) { updates.push(`insurance_expiry = $${idx++}`); values.push(insurance_expiry); }
    if (vehicle_doc_url !== undefined) { updates.push(`vehicle_doc_url = $${idx++}`); values.push(vehicle_doc_url); }
    if (photos !== undefined) { updates.push(`photos = $${idx++}`); values.push(JSON.stringify(photos)); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(vehicleId);
    const updated = await db.query(
      `UPDATE fleet_vehicles SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    res.json({
      success: true,
      message: 'Vehicle updated successfully',
      data: { vehicle: updated.rows[0] }
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'A vehicle with this plate number already exists' });
    }
    logger.error('[UpdateVehicle Error]', err);
    res.status(500).json({ success: false, message: 'Failed to update vehicle' });
  }
};

/**
 * DELETE /fleet/:id/vehicles/:vehicleId
 * Remove vehicle from fleet.
 * Cannot remove if fleet would drop below 5 active vehicles (when fleet is active).
 */
const removeVehicle = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id: fleetId, vehicleId } = req.params;

    // Verify fleet and vehicle belong to owner
    const checkResult = await db.query(
      `SELECT fv.id, f.is_active, f.min_vehicles, f.fleet_number
       FROM fleet_vehicles fv
       JOIN fleets f ON f.id = fv.fleet_id
       WHERE fv.id = $1 AND fv.fleet_id = $2 AND f.owner_id = $3`,
      [vehicleId, fleetId, ownerId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    const { is_active, min_vehicles, fleet_number } = checkResult.rows[0];

    if (is_active) {
      const countResult = await db.query(
        'SELECT COUNT(*) FROM fleet_vehicles WHERE fleet_id = $1',
        [fleetId]
      );
      const currentCount = parseInt(countResult.rows[0].count, 10);

      if (currentCount <= min_vehicles) {
        return res.status(400).json({
          success: false,
          message: `Cannot remove vehicle. Fleet #${fleet_number} must maintain at least ${min_vehicles} vehicles to stay active.`
        });
      }
    }

    await db.query('DELETE FROM fleet_vehicles WHERE id = $1', [vehicleId]);

    // Recalculate fleet active status after removal
    const newCountResult = await db.query(
      'SELECT COUNT(*) FROM fleet_vehicles WHERE fleet_id = $1',
      [fleetId]
    );
    const newCount = parseInt(newCountResult.rows[0].count, 10);

    if (newCount < min_vehicles) {
      await db.query('UPDATE fleets SET is_active = false WHERE id = $1', [fleetId]);
    }

    res.json({
      success: true,
      message: 'Vehicle removed from fleet',
      data: { vehicle_count: newCount }
    });
  } catch (err) {
    logger.error('[RemoveVehicle Error]', err);
    res.status(500).json({ success: false, message: 'Failed to remove vehicle' });
  }
};

/**
 * PUT /fleet/:id/vehicles/:vehicleId/driver
 * Assign a driver to a fleet vehicle.
 * body: { driver_phone_or_email }
 */
const assignDriver = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id: fleetId, vehicleId } = req.params;
    const { driver_phone_or_email } = req.body;

    if (!driver_phone_or_email) {
      return res.status(400).json({ success: false, message: 'driver_phone_or_email is required' });
    }

    // Verify vehicle belongs to this fleet and owner
    const vehicleCheck = await db.query(
      `SELECT fv.id FROM fleet_vehicles fv
       JOIN fleets f ON f.id = fv.fleet_id
       WHERE fv.id = $1 AND fv.fleet_id = $2 AND f.owner_id = $3`,
      [vehicleId, fleetId, ownerId]
    );

    if (vehicleCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    // Find the driver user
    const driverResult = await db.query(
      `SELECT u.id, u.full_name, u.phone, u.role, u.profile_picture
       FROM users u
       WHERE (u.phone = $1 OR u.email = $1) AND u.role = 'driver'`,
      [driver_phone_or_email]
    );

    if (driverResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Driver not found. Make sure the driver is registered as a MOBO driver.' });
    }

    const driver = driverResult.rows[0];

    // HIGH-002: Prevent a driver from being silently double-assigned.
    // If the driver is already assigned to any fleet vehicle (including one in
    // a different fleet), return 409 so the caller must unassign first.
    const alreadyAssigned = await db.query(
      `SELECT fv.id, f.name AS fleet_name
       FROM fleet_vehicles fv
       JOIN fleets f ON f.id = fv.fleet_id
       WHERE fv.assigned_driver_id = $1 AND fv.id != $2
       LIMIT 1`,
      [driver.id, vehicleId]
    );
    if (alreadyAssigned.rows[0]) {
      return res.status(409).json({
        success: false,
        message: `${driver.full_name} is already assigned to another vehicle in fleet "${alreadyAssigned.rows[0].fleet_name}". Unassign them first.`,
      });
    }

    // Assign driver to vehicle
    await db.query(
      'UPDATE fleet_vehicles SET assigned_driver_id = $1 WHERE id = $2',
      [driver.id, vehicleId]
    );

    // Update drivers table to link to fleet
    await db.query(
      `UPDATE drivers SET fleet_id = $1, fleet_vehicle_id = $2 WHERE user_id = $3`,
      [fleetId, vehicleId, driver.id]
    );

    res.json({
      success: true,
      message: `${driver.full_name} has been assigned to this vehicle`,
      data: { driver }
    });
  } catch (err) {
    logger.error('[AssignDriver Error]', err);
    res.status(500).json({ success: false, message: 'Failed to assign driver' });
  }
};

/**
 * DELETE /fleet/:id/vehicles/:vehicleId/driver
 * Unassign a driver from a fleet vehicle.
 */
const unassignDriver = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id: fleetId, vehicleId } = req.params;

    // Verify vehicle belongs to this fleet and owner
    const vehicleResult = await db.query(
      `SELECT fv.assigned_driver_id FROM fleet_vehicles fv
       JOIN fleets f ON f.id = fv.fleet_id
       WHERE fv.id = $1 AND fv.fleet_id = $2 AND f.owner_id = $3`,
      [vehicleId, fleetId, ownerId]
    );

    if (vehicleResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    const assignedDriverId = vehicleResult.rows[0].assigned_driver_id;

    // Unassign driver from vehicle
    await db.query(
      'UPDATE fleet_vehicles SET assigned_driver_id = NULL WHERE id = $1',
      [vehicleId]
    );

    // Clear fleet link from driver record
    if (assignedDriverId) {
      await db.query(
        'UPDATE drivers SET fleet_id = NULL, fleet_vehicle_id = NULL WHERE user_id = $1',
        [assignedDriverId]
      );
    }

    res.json({
      success: true,
      message: 'Driver unassigned from vehicle'
    });
  } catch (err) {
    logger.error('[UnassignDriver Error]', err);
    res.status(500).json({ success: false, message: 'Failed to unassign driver' });
  }
};

/**
 * GET /fleet/:id/earnings
 * Total earnings, per-vehicle breakdown, by period.
 */
const getFleetEarnings = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id: fleetId } = req.params;
    const { period = 'month' } = req.query;

    // Verify fleet belongs to owner
    const fleetResult = await db.query(
      'SELECT id, name, fleet_number, total_earnings FROM fleets WHERE id = $1 AND (owner_id = $2 OR $3 = \'admin\')',
      [fleetId, ownerId, req.user.role]
    );

    if (fleetResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Fleet not found' });
    }

    const fleet = fleetResult.rows[0];

    // Build time filter
    let timeFilter = '';
    if (period === 'week') timeFilter = "AND r.created_at >= NOW() - INTERVAL '7 days'";
    else if (period === 'month') timeFilter = "AND r.created_at >= NOW() - INTERVAL '30 days'";
    else if (period === 'year') timeFilter = "AND r.created_at >= NOW() - INTERVAL '1 year'";

    // Per-vehicle earnings (join through assigned driver)
    const vehicleEarningsResult = await db.query(
      `SELECT
         fv.id, fv.make, fv.model, fv.plate, fv.vehicle_type,
         u.full_name as driver_name,
         COALESCE(SUM(r.final_fare), 0) as earnings,
         COUNT(r.id) as ride_count
       FROM fleet_vehicles fv
       LEFT JOIN users u ON u.id = fv.assigned_driver_id
       LEFT JOIN drivers d ON d.user_id = fv.assigned_driver_id
       LEFT JOIN rides r ON r.driver_id = d.id
         AND r.status = 'completed'
         ${timeFilter}
       WHERE fv.fleet_id = $1
       GROUP BY fv.id, fv.make, fv.model, fv.plate, fv.vehicle_type, u.full_name
       ORDER BY earnings DESC`,
      [fleetId]
    );

    const totalEarnings = vehicleEarningsResult.rows.reduce(
      (sum, v) => sum + parseInt(v.earnings, 10), 0
    );

    res.json({
      success: true,
      data: {
        fleet_name: fleet.name,
        fleet_number: fleet.fleet_number,
        period,
        total_earnings: totalEarnings,
        total_earnings_all_time: fleet.total_earnings,
        vehicles: vehicleEarningsResult.rows
      }
    });
  } catch (err) {
    logger.error('[GetFleetEarnings Error]', err);
    res.status(500).json({ success: false, message: 'Failed to fetch fleet earnings' });
  }
};

/**
 * GET /fleet/:id/vehicles
 * List all vehicles with status, assigned driver, earnings.
 */
const getFleetVehicles = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id: fleetId } = req.params;

    // Verify fleet belongs to owner
    const fleetResult = await db.query(
      'SELECT id, fleet_number, max_vehicles FROM fleets WHERE id = $1 AND (owner_id = $2 OR $3 = \'admin\')',
      [fleetId, ownerId, req.user.role]
    );

    if (fleetResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Fleet not found' });
    }

    const fleet = fleetResult.rows[0];

    const vehiclesResult = await db.query(
      `SELECT
         fv.*,
         u.full_name as assigned_driver_name,
         u.phone as assigned_driver_phone,
         u.rating as assigned_driver_rating,
         u.profile_picture as assigned_driver_photo
       FROM fleet_vehicles fv
       LEFT JOIN users u ON u.id = fv.assigned_driver_id
       WHERE fv.fleet_id = $1
       ORDER BY fv.created_at ASC`,
      [fleetId]
    );

    res.json({
      success: true,
      data: {
        fleet_number: fleet.fleet_number,
        vehicle_count: vehiclesResult.rows.length,
        max_vehicles: fleet.max_vehicles,
        remaining_slots: fleet.max_vehicles - vehiclesResult.rows.length,
        vehicles: vehiclesResult.rows
      }
    });
  } catch (err) {
    logger.error('[GetFleetVehicles Error]', err);
    res.status(500).json({ success: false, message: 'Failed to fetch fleet vehicles' });
  }
};

/**
 * GET /fleet/admin/all   (admin only)
 * Return all fleets across all owners with vehicle counts and owner info.
 */
const getAllFleets = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let whereClause = '';
    if (status === 'pending')   whereClause = "WHERE f.is_approved = false AND f.is_active = false";
    else if (status === 'active')    whereClause = "WHERE f.is_approved = true AND f.is_active = true";
    else if (status === 'suspended') whereClause = "WHERE f.is_approved = false AND f.is_active = false AND f.created_at < NOW()";

    const result = await db.query(
      `SELECT
         f.*,
         u.full_name  as owner_name,
         u.phone      as owner_phone,
         u.email      as owner_email,
         u.profile_picture as owner_photo,
         (SELECT COUNT(*) FROM fleet_vehicles fv WHERE fv.fleet_id = f.id) as vehicle_count,
         (SELECT COUNT(*) FROM fleet_vehicles fv WHERE fv.fleet_id = f.id AND fv.is_approved = true) as approved_vehicle_count,
         (SELECT COUNT(*) FROM fleet_vehicles fv WHERE fv.fleet_id = f.id AND fv.assigned_driver_id IS NOT NULL) as assigned_driver_count
       FROM fleets f
       JOIN users u ON u.id = f.owner_id
       ${whereClause}
       ORDER BY f.created_at DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limit, 10), offset]
    );

    const countResult = await db.query(
      `SELECT COUNT(*) FROM fleets f ${whereClause}`
    );

    res.json({
      success: true,
      data: {
        fleets: result.rows,
        total: parseInt(countResult.rows[0].count, 10),
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      }
    });
  } catch (err) {
    logger.error('[GetAllFleets Error]', err);
    res.status(500).json({ success: false, message: 'Failed to fetch fleets' });
  }
};

/**
 * POST /fleet/:id/approve   (admin only)
 * Approve a fleet so it can accept rides.
 */
const approveFleet = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `UPDATE fleets SET is_approved = true, updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, fleet_number, is_approved, is_active, owner_id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Fleet not found' });
    }

    res.json({
      success: true,
      message: `Fleet "${result.rows[0].name}" has been approved`,
      data: { fleet: result.rows[0] }
    });
  } catch (err) {
    logger.error('[ApproveFleet Error]', err);
    res.status(500).json({ success: false, message: 'Failed to approve fleet' });
  }
};

/**
 * POST /fleet/:id/suspend   (admin only)
 * Suspend a fleet — sets is_approved = false and is_active = false.
 */
const suspendFleet = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await db.query(
      `UPDATE fleets SET is_approved = false, is_active = false, updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, fleet_number, is_approved, is_active, owner_id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Fleet not found' });
    }

    res.json({
      success: true,
      message: `Fleet "${result.rows[0].name}" has been suspended`,
      data: { fleet: result.rows[0], reason: reason || null }
    });
  } catch (err) {
    logger.error('[SuspendFleet Error]', err);
    res.status(500).json({ success: false, message: 'Failed to suspend fleet' });
  }
};

/**
 * POST /fleet/:id/vehicles/:vehicleId/approve   (admin only)
 * Approve a specific vehicle in a fleet.
 */
const approveVehicle = async (req, res) => {
  try {
    const { id: fleetId, vehicleId } = req.params;

    const result = await db.query(
      `UPDATE fleet_vehicles SET is_approved = true, updated_at = NOW()
       WHERE id = $1 AND fleet_id = $2
       RETURNING id, make, model, plate, vehicle_type, is_approved, is_active`,
      [vehicleId, fleetId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    const vehicle = result.rows[0];

    res.json({
      success: true,
      message: `Vehicle ${vehicle.make} ${vehicle.model} (${vehicle.plate}) has been approved`,
      data: { vehicle }
    });
  } catch (err) {
    logger.error('[ApproveVehicle Error]', err);
    res.status(500).json({ success: false, message: 'Failed to approve vehicle' });
  }
};

/**
 * POST /fleet/:id/vehicles/:vehicleId/reject   (admin only)
 * Reject a specific vehicle — sets is_approved = false, is_active = false.
 */
const rejectVehicle = async (req, res) => {
  try {
    const { id: fleetId, vehicleId } = req.params;
    const { reason } = req.body;

    const result = await db.query(
      `UPDATE fleet_vehicles SET is_approved = false, is_active = false, updated_at = NOW()
       WHERE id = $1 AND fleet_id = $2
       RETURNING id, make, model, plate, vehicle_type, is_approved, is_active`,
      [vehicleId, fleetId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    const vehicle = result.rows[0];

    res.json({
      success: true,
      message: `Vehicle ${vehicle.make} ${vehicle.model} (${vehicle.plate}) has been rejected`,
      data: { vehicle, reason: reason || null }
    });
  } catch (err) {
    logger.error('[RejectVehicle Error]', err);
    res.status(500).json({ success: false, message: 'Failed to reject vehicle' });
  }
};

module.exports = {
  createFleet,
  getMyFleets,
  getFleet,
  addVehicleToFleet,
  updateVehicle,
  removeVehicle,
  assignDriver,
  unassignDriver,
  getFleetEarnings,
  getFleetVehicles,
  // Admin-only
  getAllFleets,
  approveFleet,
  suspendFleet,
  approveVehicle,
  rejectVehicle,
};
