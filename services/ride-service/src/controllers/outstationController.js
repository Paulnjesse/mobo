const pool = require('../config/database');
const crypto = require('crypto');

// ── Intercity pricing table (XAF per km, by vehicle category) ────────────────
const INTERCITY_RATES = {
  standard: { perKm: 250, base: 5000,  minFare: 15000 },
  comfort:  { perKm: 350, base: 8000,  minFare: 22000 },
  luxury:   { perKm: 600, base: 15000, minFare: 40000 },
};
const PER_DAY_WAITING = 25000; // XAF surcharge per additional day

// Known city-to-city distances (km) for quick pricing
const CITY_DISTANCES = {
  'Yaoundé-Douala':   250,  'Douala-Yaoundé':   250,
  'Yaoundé-Bafoussam': 180, 'Bafoussam-Yaoundé': 180,
  'Yaoundé-Bamenda':  330,  'Bamenda-Yaoundé':  330,
  'Douala-Bafoussam': 195,  'Bafoussam-Douala': 195,
  'Yaoundé-Kribi':    170,  'Kribi-Yaoundé':    170,
  'Yaoundé-Bertoua':  350,  'Bertoua-Yaoundé':  350,
  'Douala-Limbe':      70,  'Limbe-Douala':      70,
  'Yaoundé-Ngaoundéré': 620,'Ngaoundéré-Yaoundé': 620,
};

function estimatePrice(origin, destination, days, category) {
  const key = `${origin}-${destination}`;
  const distKm = CITY_DISTANCES[key] || 300; // default 300km if unknown
  const rate = INTERCITY_RATES[category] || INTERCITY_RATES.standard;
  const baseFare = Math.max(rate.base + rate.perKm * distKm, rate.minFare);
  const daysSurcharge = Math.max(0, (days - 1)) * PER_DAY_WAITING;
  return { total: Math.round(baseFare + daysSurcharge), distKm, baseFare, daysSurcharge };
}

// GET /rides/outstation/cities  — list available cities
const getIntercitiyCities = async (req, res) => {
  const cities = [
    'Yaoundé', 'Douala', 'Bafoussam', 'Bamenda', 'Kribi',
    'Limbe', 'Bertoua', 'Garoua', 'Maroua', 'Ngaoundéré',
    'Ebolowa', 'Buea', 'Kumba', 'Dschang', 'Nkongsamba',
  ];
  res.json({ cities });
};

// POST /rides/outstation/estimate  — get price quote
const getOutstationEstimate = async (req, res) => {
  try {
    const { origin_city, destination_city, days = 1, vehicle_category = 'standard', num_passengers = 1 } = req.body;
    if (!origin_city || !destination_city) {
      return res.status(400).json({ error: 'origin_city and destination_city required' });
    }
    if (origin_city === destination_city) {
      return res.status(400).json({ error: 'Origin and destination must be different cities' });
    }
    const category = INTERCITY_RATES[vehicle_category] ? vehicle_category : 'standard';
    const pricing  = estimatePrice(origin_city, destination_city, parseInt(days), category);

    res.json({
      origin_city, destination_city,
      days: parseInt(days),
      vehicle_category: category,
      num_passengers,
      distance_km: pricing.distKm,
      base_fare: pricing.baseFare,
      days_surcharge: pricing.daysSurcharge,
      total: pricing.total,
      per_km_rate: INTERCITY_RATES[category].perKm,
      includes: [
        `Driver for ${days} day${days > 1 ? 's' : ''}`,
        `${pricing.distKm} km estimated distance`,
        'Fuel included',
        days > 1 ? `${(days - 1)} day waiting allowance` : null,
      ].filter(Boolean),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /rides/outstation  — create booking
const createOutstationBooking = async (req, res) => {
  try {
    const riderId = req.headers['x-user-id'];
    const {
      origin_city, destination_city,
      origin_address, destination_address,
      travel_date, return_date,
      vehicle_category = 'standard',
      num_passengers = 1,
      notes,
    } = req.body;

    if (!origin_city || !destination_city || !travel_date) {
      return res.status(400).json({ error: 'origin_city, destination_city, and travel_date required' });
    }

    const days = return_date
      ? Math.max(1, Math.ceil((new Date(return_date) - new Date(travel_date)) / (1000 * 60 * 60 * 24)) + 1)
      : 1;
    const category = INTERCITY_RATES[vehicle_category] ? vehicle_category : 'standard';
    const pricing  = estimatePrice(origin_city, destination_city, days, category);

    const result = await pool.query(
      `INSERT INTO outstation_bookings
         (rider_id, origin_city, destination_city, origin_address, destination_address,
          travel_date, return_date, days, vehicle_category, num_passengers,
          distance_km, package_price, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        riderId, origin_city, destination_city,
        origin_address || origin_city, destination_address || destination_city,
        travel_date, return_date || null,
        days, category, num_passengers,
        pricing.distKm, pricing.total, notes,
      ]
    );

    res.status(201).json({ booking: result.rows[0], pricing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /rides/outstation/mine
const getMyOutstationBookings = async (req, res) => {
  try {
    const riderId = req.headers['x-user-id'];
    const result = await pool.query(
      `SELECT ob.*,
              u.full_name as driver_name, u.phone as driver_phone, u.profile_picture as driver_photo,
              u.rating as driver_rating, v.make, v.model, v.plate, v.color
       FROM outstation_bookings ob
       LEFT JOIN drivers d ON ob.driver_id = d.id
       LEFT JOIN users u ON d.user_id = u.id
       LEFT JOIN vehicles v ON d.vehicle_id = v.id
       WHERE ob.rider_id = $1
       ORDER BY ob.travel_date DESC`,
      [riderId]
    );
    res.json({ bookings: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /rides/outstation/:id/cancel
const cancelOutstationBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const riderId = req.headers['x-user-id'];
    const result = await pool.query(
      `UPDATE outstation_bookings SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND rider_id = $2
         AND status IN ('pending','confirmed') RETURNING *`,
      [id, riderId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Booking not found or cannot be cancelled' });
    res.json({ booking: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /rides/outstation  (admin — all bookings)
const getAllOutstationBookings = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ob.*, u.full_name as rider_name, u.phone as rider_phone
       FROM outstation_bookings ob JOIN users u ON ob.rider_id = u.id
       ORDER BY ob.travel_date DESC LIMIT 100`
    );
    res.json({ bookings: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getIntercitiyCities,
  getOutstationEstimate,
  createOutstationBooking,
  getMyOutstationBookings,
  cancelOutstationBooking,
  getAllOutstationBookings,
};
