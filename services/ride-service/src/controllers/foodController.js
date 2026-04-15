/**
 * foodController.js — Food / restaurant delivery (Feature 1)
 * Routes prefix: /food
 */
const pool = require('../db');
const logger = require('../utils/logger');

// ── Helpers ────────────────────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── GET /food/restaurants — list active restaurants, optional city filter
const getRestaurants = async (req, res) => {
  try {
    const { city, category, lat, lng, radius_km = 15 } = req.query;

    let query = `
      SELECT r.*,
        ${lat && lng
          ? `ST_Distance(r.location::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) / 1000 AS distance_km,`
          : ''
        }
        (SELECT COUNT(*) FROM menu_items WHERE restaurant_id = r.id AND is_available = true) AS item_count
      FROM restaurants r
      WHERE r.is_active = true
    `;
    const params = [];
    let paramIdx = 1;

    if (lat && lng) {
      params.push(parseFloat(lng), parseFloat(lat));
      paramIdx = 3;
      query += ` AND ST_DWithin(r.location::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $${paramIdx} * 1000)`;
      params.push(parseFloat(radius_km));
      paramIdx++;
    }

    if (city) {
      query += ` AND LOWER(r.city) = LOWER($${paramIdx})`;
      params.push(city);
      paramIdx++;
    }

    if (category) {
      query += ` AND LOWER(r.category) = LOWER($${paramIdx})`;
      params.push(category);
      paramIdx++;
    }

    if (lat && lng) {
      query += ' ORDER BY distance_km ASC';
    } else {
      query += ' ORDER BY r.avg_rating DESC, r.name ASC';
    }

    const result = await pool.query(query, params);
    res.json({ restaurants: result.rows });
  } catch (err) {
    logger.error("[FoodController] Error", { err: err.message, path: req.path });
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── GET /food/restaurants/:id — restaurant detail + menu
const getRestaurant = async (req, res) => {
  try {
    const { id } = req.params;
    const rest = await pool.query('SELECT * FROM restaurants WHERE id = $1', [id]);
    if (!rest.rows[0]) return res.status(404).json({ error: 'Restaurant not found' });

    const menu = await pool.query(
      'SELECT * FROM menu_items WHERE restaurant_id = $1 ORDER BY category, name',
      [id]
    );

    // Group menu items by category
    const grouped = {};
    for (const item of menu.rows) {
      const cat = item.category || 'Other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    }

    res.json({ restaurant: rest.rows[0], menu: menu.rows, menu_grouped: grouped });
  } catch (err) {
    logger.error("[FoodController] Error", { err: err.message, path: req.path });
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── POST /food/orders — place a food order
const placeOrder = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const {
      restaurant_id,
      items,            // [{ menu_item_id, name, price, qty }]
      delivery_address,
      delivery_location,  // { lat, lng }
      payment_method = 'cash',
      special_note,
    } = req.body;

    if (!items || items.length === 0) return res.status(400).json({ error: 'No items in order' });
    if (!delivery_address) return res.status(400).json({ error: 'Delivery address required' });

    // Validate restaurant
    const rest = await pool.query('SELECT * FROM restaurants WHERE id = $1 AND is_active = true', [restaurant_id]);
    if (!rest.rows[0]) return res.status(404).json({ error: 'Restaurant not found' });

    // Calculate totals
    const subtotal = items.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const delivery_fee = rest.rows[0].delivery_fee || 500;
    const total = subtotal + delivery_fee;

    if (total - delivery_fee < (rest.rows[0].min_order || 0)) {
      return res.status(400).json({ error: `Minimum order is ${rest.rows[0].min_order} XAF` });
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const estimatedMinutes = 30 + Math.floor(Math.random() * 15); // 30-45 min

    const result = await pool.query(
      `INSERT INTO food_orders (
        user_id, restaurant_id, items, subtotal, delivery_fee, total,
        special_note, delivery_address, delivery_location, payment_method,
        pickup_otp, estimated_minutes, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        ${delivery_location ? `ST_SetSRID(ST_MakePoint($9,$10),4326)` : 'NULL'},
        $${delivery_location ? 11 : 9},
        $${delivery_location ? 12 : 10},
        $${delivery_location ? 13 : 11},
        'pending'
      ) RETURNING *`,
      delivery_location
        ? [userId, restaurant_id, JSON.stringify(items), subtotal, delivery_fee, total,
           special_note, delivery_address, delivery_location.lng, delivery_location.lat,
           payment_method, otp, estimatedMinutes]
        : [userId, restaurant_id, JSON.stringify(items), subtotal, delivery_fee, total,
           special_note, delivery_address, payment_method, otp, estimatedMinutes]
    );

    res.status(201).json({
      order: result.rows[0],
      estimated_minutes: estimatedMinutes,
      message: `Order placed! Estimated delivery: ${estimatedMinutes} minutes`,
    });
  } catch (err) {
    logger.error("[FoodController] Error", { err: err.message, path: req.path });
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── GET /food/orders — rider's order history
const getMyOrders = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const result = await pool.query(
      `SELECT fo.*, r.name as restaurant_name, r.logo_url
       FROM food_orders fo
       JOIN restaurants r ON fo.restaurant_id = r.id
       WHERE fo.user_id = $1
       ORDER BY fo.created_at DESC`,
      [userId]
    );
    res.json({ orders: result.rows });
  } catch (err) {
    logger.error("[FoodController] Error", { err: err.message, path: req.path });
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── GET /food/orders/:id — single order detail
const getOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'];
    const result = await pool.query(
      `SELECT fo.*, r.name as restaurant_name, r.logo_url, r.phone as restaurant_phone,
              u.full_name as driver_name, u.phone as driver_phone
       FROM food_orders fo
       JOIN restaurants r ON fo.restaurant_id = r.id
       LEFT JOIN drivers d ON fo.driver_id = d.id
       LEFT JOIN users u ON d.user_id = u.id
       WHERE fo.id = $1 AND fo.user_id = $2`,
      [id, userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Order not found' });
    res.json({ order: result.rows[0] });
  } catch (err) {
    logger.error("[FoodController] Error", { err: err.message, path: req.path });
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── PATCH /food/orders/:id/cancel — rider cancels order (only if still pending)
const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'];
    const result = await pool.query(
      `UPDATE food_orders SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING *`,
      [id, userId]
    );
    if (!result.rows[0]) return res.status(400).json({ error: 'Order cannot be cancelled (already confirmed or not found)' });
    res.json({ success: true, order: result.rows[0] });
  } catch (err) {
    logger.error("[FoodController] Error", { err: err.message, path: req.path });
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── PATCH /food/orders/:id/status — driver/restaurant updates order status
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const VALID = ['confirmed', 'preparing', 'picked_up', 'delivered', 'cancelled'];
    if (!VALID.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    let extra = '';
    if (status === 'confirmed')  extra = ', confirmed_at = NOW()';
    if (status === 'preparing')  extra = ', ready_at = NOW()';
    if (status === 'picked_up')  extra = ', picked_up_at = NOW()';
    if (status === 'delivered')  extra = ', delivered_at = NOW()';

    const result = await pool.query(
      `UPDATE food_orders SET status = $1 ${extra}, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [status, id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Order not found' });
    res.json({ order: result.rows[0] });
  } catch (err) {
    logger.error("[FoodController] Error", { err: err.message, path: req.path });
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── Admin: GET /food/admin/restaurants — all restaurants
const adminListRestaurants = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*,
        (SELECT COUNT(*) FROM menu_items WHERE restaurant_id = r.id) AS item_count,
        (SELECT COUNT(*) FROM food_orders WHERE restaurant_id = r.id) AS order_count
       FROM restaurants r ORDER BY r.created_at DESC`
    );
    res.json({ restaurants: result.rows });
  } catch (err) {
    logger.error("[FoodController] Error", { err: err.message, path: req.path });
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── Admin: POST /food/admin/restaurants — create restaurant
const adminCreateRestaurant = async (req, res) => {
  try {
    const { name, description, category, address, city, phone, delivery_fee, min_order, logo_url } = req.body;
    const result = await pool.query(
      `INSERT INTO restaurants (name, description, category, address, city, phone, delivery_fee, min_order, logo_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, description, category, address, city, phone, delivery_fee || 500, min_order || 2000, logo_url]
    );
    res.status(201).json({ restaurant: result.rows[0] });
  } catch (err) {
    logger.error("[FoodController] Error", { err: err.message, path: req.path });
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── Admin: PATCH /food/admin/restaurants/:id — update restaurant
const adminUpdateRestaurant = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, category, address, city, phone, delivery_fee, min_order, logo_url, is_active } = req.body;
    const result = await pool.query(
      `UPDATE restaurants SET
        name = COALESCE($1, name), description = COALESCE($2, description),
        category = COALESCE($3, category), address = COALESCE($4, address),
        city = COALESCE($5, city), phone = COALESCE($6, phone),
        delivery_fee = COALESCE($7, delivery_fee), min_order = COALESCE($8, min_order),
        logo_url = COALESCE($9, logo_url), is_active = COALESCE($10, is_active),
        updated_at = NOW()
       WHERE id = $11 RETURNING *`,
      [name, description, category, address, city, phone, delivery_fee, min_order, logo_url, is_active, id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Restaurant not found' });
    res.json({ restaurant: result.rows[0] });
  } catch (err) {
    logger.error("[FoodController] Error", { err: err.message, path: req.path });
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── Admin: POST /food/admin/restaurants/:id/menu — add menu item
const adminAddMenuItem = async (req, res) => {
  try {
    const { id: restaurant_id } = req.params;
    const { name, description, category, price, image_url, is_popular } = req.body;
    const result = await pool.query(
      `INSERT INTO menu_items (restaurant_id, name, description, category, price, image_url, is_popular)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [restaurant_id, name, description, category, price, image_url, is_popular || false]
    );
    res.status(201).json({ item: result.rows[0] });
  } catch (err) {
    logger.error("[FoodController] Error", { err: err.message, path: req.path });
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── Admin: PATCH /food/admin/menu/:item_id — update menu item
const adminUpdateMenuItem = async (req, res) => {
  try {
    const { item_id } = req.params;
    const { name, description, category, price, image_url, is_available, is_popular } = req.body;
    const result = await pool.query(
      `UPDATE menu_items SET
        name = COALESCE($1, name), description = COALESCE($2, description),
        category = COALESCE($3, category), price = COALESCE($4, price),
        image_url = COALESCE($5, image_url), is_available = COALESCE($6, is_available),
        is_popular = COALESCE($7, is_popular)
       WHERE id = $8 RETURNING *`,
      [name, description, category, price, image_url, is_available, is_popular, item_id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Menu item not found' });
    res.json({ item: result.rows[0] });
  } catch (err) {
    logger.error("[FoodController] Error", { err: err.message, path: req.path });
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── Admin: GET /food/admin/orders — all food orders
const adminListOrders = async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    let query = `
      SELECT fo.*, r.name as restaurant_name, u.full_name as customer_name
      FROM food_orders fo
      JOIN restaurants r ON fo.restaurant_id = r.id
      JOIN users u ON fo.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    if (status) { query += ` AND fo.status = $${params.length + 1}`; params.push(status); }
    query += ` ORDER BY fo.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);
    // Count query uses the same parameterized approach to prevent SQL injection
    const countParams = [];
    const countQuery = status
      ? 'SELECT COUNT(*) FROM food_orders WHERE status = $1'
      : 'SELECT COUNT(*) FROM food_orders';
    if (status) countParams.push(status);
    const countResult = await pool.query(countQuery, countParams);
    res.json({ orders: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err) {
    logger.error("[FoodController] Error", { err: err.message, path: req.path });
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  getRestaurants, getRestaurant,
  placeOrder, getMyOrders, getOrder, cancelOrder, updateOrderStatus,
  adminListRestaurants, adminCreateRestaurant, adminUpdateRestaurant,
  adminAddMenuItem, adminUpdateMenuItem, adminListOrders,
};
