const db = require('../db');

const SERVICE_INTERVALS = {
  oil_change: 5000,
  tire_rotation: 10000,
  brake_inspection: 20000,
  air_filter: 15000,
  transmission: 50000,
  full_service: 25000,
};

exports.getMaintenance = async (req, res) => {
  try {
    const driverId = req.user.driver_id || req.user.id;

    const [driverRes, maintenanceRes] = await Promise.all([
      db.query(
        `SELECT v.make AS vehicle_make, v.model AS vehicle_model, v.plate_number AS plate,
                v.mileage_km AS current_mileage_km,
                COALESCE(SUM(r.distance_km), 0) AS trip_mileage_km
         FROM drivers d
         LEFT JOIN vehicles v ON v.driver_id = d.id
         LEFT JOIN rides r ON r.driver_id = d.id AND r.status = 'completed'
         WHERE d.id = $1
         GROUP BY v.id`,
        [driverId]
      ),
      db.query('SELECT * FROM vehicle_maintenance WHERE driver_id = $1', [driverId]),
    ]);

    const vehicle = driverRes.rows[0] || {};
    const currentMileage = parseInt(vehicle.current_mileage_km) || 0;

    // Build items list — fill missing service records with defaults
    const existingMap = {};
    maintenanceRes.rows.forEach((r) => { existingMap[r.service_key] = r; });

    const items = Object.keys(SERVICE_INTERVALS).map((key) => {
      if (existingMap[key]) return existingMap[key];
      // Default: assume last service was at mileage - interval
      const lastKm = Math.max(0, currentMileage - SERVICE_INTERVALS[key]);
      return {
        key,
        last_service_km: lastKm,
        next_service_km: lastKm + SERVICE_INTERVALS[key],
      };
    });

    res.json({
      ...vehicle,
      current_mileage_km: currentMileage,
      trip_mileage_km: parseFloat(vehicle.trip_mileage_km) || 0,
      items,
      partner_garages: [
        { name: 'Auto Service Yaoundé', address: 'Bastos, Yaoundé', phone: '677001234', discount_pct: 15 },
        { name: 'Mécanique Express', address: 'Hippodrome, Yaoundé', phone: '699887766', discount_pct: 10 },
      ],
    });
  } catch (err) {
    console.error('maintenanceController.getMaintenance:', err);
    res.status(500).json({ error: 'Failed to load maintenance data' });
  }
};

exports.logService = async (req, res) => {
  try {
    const driverId = req.user.driver_id || req.user.id;
    const { service_key, mileage_km } = req.body;
    const interval = SERVICE_INTERVALS[service_key];
    if (!interval) return res.status(400).json({ error: 'Invalid service key' });

    const nextKm = parseInt(mileage_km) + interval;
    await db.query(
      `INSERT INTO vehicle_maintenance (driver_id, service_key, last_service_km, next_service_km)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (driver_id, service_key) DO UPDATE
         SET last_service_km = $3, next_service_km = $4, serviced_at = NOW()`,
      [driverId, service_key, mileage_km, nextKm]
    );
    res.json({ ok: true, next_service_km: nextKm });
  } catch (err) {
    console.error('maintenanceController.logService:', err);
    res.status(500).json({ error: 'Failed to log service' });
  }
};
