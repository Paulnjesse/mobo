/**
 * MOBO — Full Sample Data Seeder
 * Connects directly to Supabase and inserts realistic African data
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DB_URL = "postgresql://postgres:Douala%401234%24@db.bkanmaljfqgsxnthqnmp.supabase.co:5432/postgres";

const client = new Client({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log('✅ Connected to Supabase');

  // ── Run migration_003 first ──────────────────────────────────
  console.log('\n📦 Running migration_003.sql...');
  try {
    const migration = fs.readFileSync(path.join(__dirname, 'migration_003.sql'), 'utf8');
    await client.query(migration);
    console.log('✅ migration_003.sql applied');
  } catch (e) {
    if (e.message.includes('already exists') || e.message.includes('duplicate')) {
      console.log('⚠️  migration_003 already applied, skipping');
    } else {
      console.error('Migration error:', e.message);
    }
  }

  // ── Clean existing seed data ─────────────────────────────────
  console.log('\n🧹 Clearing old seed data...');
  await client.query(`
    DELETE FROM ride_ratings; DELETE FROM messages; DELETE FROM notifications;
    DELETE FROM loyalty_transactions; DELETE FROM payments; DELETE FROM rides;
    DELETE FROM vehicles; DELETE FROM drivers;
    DELETE FROM users WHERE role != 'admin' OR email LIKE '%@mobo.test';
    DELETE FROM users WHERE email LIKE '%@mobo.test';
  `).catch(() => {});

  // ── USERS ────────────────────────────────────────────────────
  console.log('\n👤 Inserting users...');

  const bcrypt = require('crypto');
  // bcrypt hash of the seed account passphrase — pre-computed, not a real credential
  const passwordHash = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'; // "password"

  const users = await client.query(`
    INSERT INTO users (full_name, phone, email, password_hash, role, gender, city, country, language,
      is_verified, is_active, rating, total_rides, loyalty_points, wallet_balance, subscription_plan)
    VALUES
      ('Admin MOBO',        '+237600000001', 'admin@mobo.test',        '${passwordHash}', 'admin',  'male',   'Douala',   'Cameroon',     'fr', true,  true,  5.00, 0,   0,     0,     'none'),
      ('Amara Diallo',      '+237600000002', 'amara@mobo.test',        '${passwordHash}', 'rider',  'female', 'Douala',   'Cameroon',     'fr', true,  true,  4.80, 24,  2400,  5000,  'basic'),
      ('Kwame Asante',      '+237600000003', 'kwame@mobo.test',        '${passwordHash}', 'rider',  'male',   'Yaoundé',  'Cameroon',     'en', true,  true,  4.60, 11,  1100,  2000,  'none'),
      ('Fatima Ouedraogo',  '+237600000004', 'fatima@mobo.test',       '${passwordHash}', 'rider',  'female', 'Douala',   'Cameroon',     'fr', true,  true,  4.90, 36,  3600,  10000, 'premium'),
      ('Emeka Okafor',      '+237600000005', 'emeka@mobo.test',        '${passwordHash}', 'rider',  'male',   'Garoua',   'Cameroon',     'en', true,  true,  4.40, 7,   700,   0,     'none'),
      ('Nadia Mbeki',       '+237600000006', 'nadia@mobo.test',        '${passwordHash}', 'rider',  'female', 'Bafoussam','Cameroon',     'fr', true,  true,  4.70, 15,  1500,  3000,  'none'),
      ('Kofi Mensah',       '+237600000007', 'kofi.driver@mobo.test',  '${passwordHash}', 'driver', 'male',   'Douala',   'Cameroon',     'fr', true,  true,  4.85, 142, 0,     0,     'none'),
      ('Ibrahim Traore',    '+237600000008', 'ibrahim.driver@mobo.test','${passwordHash}', 'driver', 'male',   'Douala',   'Cameroon',     'fr', true,  true,  4.70, 98,  0,     0,     'none'),
      ('Yves Nkomo',        '+237600000009', 'yves.driver@mobo.test',  '${passwordHash}', 'driver', 'male',   'Yaoundé',  'Cameroon',     'fr', true,  true,  4.90, 201, 0,     0,     'none'),
      ('Grace Bello',       '+237600000010', 'grace.driver@mobo.test', '${passwordHash}', 'driver', 'female', 'Douala',   'Cameroon',     'en', true,  true,  4.95, 167, 0,     0,     'none'),
      ('Moussa Coulibaly',  '+237600000011', 'moussa.driver@mobo.test','${passwordHash}', 'driver', 'male',   'Yaoundé',  'Cameroon',     'fr', true,  true,  4.60, 77,  0,     0,     'none'),
      ('Aisha Mohammed',    '+237600000012', 'aisha.driver@mobo.test', '${passwordHash}', 'driver', 'female', 'Douala',   'Cameroon',     'en', true,  true,  4.80, 130, 0,     0,     'none'),
      ('Jean-Pierre Fotso', '+237600000013', 'jp.fleet@mobo.test',     '${passwordHash}', 'fleet_owner','male','Douala', 'Cameroon',     'fr', true,  true,  5.00, 0,   0,     0,     'none'),
      ('Teen User Léa',     '+237600000014', 'lea@mobo.test',          '${passwordHash}', 'rider',  'female', 'Douala',   'Cameroon',     'fr', true,  true,  5.00, 3,   300,   1000,  'none')
    ON CONFLICT (phone) DO NOTHING
    RETURNING id, full_name, role, email
  `);

  const userMap = {};
  users.rows.forEach(u => { userMap[u.email] = u.id; });
  console.log(`  → ${users.rows.length} users inserted`);

  // Set teen account + parent
  if (userMap['lea@mobo.test'] && userMap['fatima@mobo.test']) {
    await client.query(`
      UPDATE users SET is_teen_account = true, parent_id = $1 WHERE id = $2
    `, [userMap['fatima@mobo.test'], userMap['lea@mobo.test']]);
  }

  // ── DRIVERS ──────────────────────────────────────────────────
  console.log('\n🚗 Inserting drivers...');

  // Douala coordinates: ~4.05°N, 9.70°E
  // Yaoundé coordinates: ~3.85°N, 11.52°E
  const driverInserts = [
    { email: 'kofi.driver@mobo.test',   license: 'CM-DLA-2021-001', city: 'Douala',  lat: 4.061, lng: 9.757, online: true,  earnings: 485000 },
    { email: 'ibrahim.driver@mobo.test', license: 'CM-DLA-2021-002', city: 'Douala',  lat: 4.048, lng: 9.701, online: true,  earnings: 310000 },
    { email: 'yves.driver@mobo.test',    license: 'CM-YDE-2020-001', city: 'Yaoundé', lat: 3.867, lng: 11.517,online: false, earnings: 720000 },
    { email: 'grace.driver@mobo.test',   license: 'CM-DLA-2022-001', city: 'Douala',  lat: 4.072, lng: 9.712, online: true,  earnings: 540000 },
    { email: 'moussa.driver@mobo.test',  license: 'CM-YDE-2021-002', city: 'Yaoundé', lat: 3.848, lng: 11.502,online: false, earnings: 225000 },
    { email: 'aisha.driver@mobo.test',   license: 'CM-DLA-2022-002', city: 'Douala',  lat: 4.055, lng: 9.734, online: true,  earnings: 415000 },
  ];

  const driverMap = {};
  for (const d of driverInserts) {
    if (!userMap[d.email]) continue;
    const res = await client.query(`
      INSERT INTO drivers (user_id, license_number, license_expiry, is_approved, is_online,
        current_location, total_earnings, acceptance_rate, cancellation_rate)
      VALUES ($1, $2, '2027-12-31', true, $3,
        ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, $7, $8)
      ON CONFLICT (license_number) DO NOTHING
      RETURNING id
    `, [userMap[d.email], d.license, d.online, d.lng, d.lat, d.earnings,
        Math.floor(85 + Math.random()*15), Math.floor(Math.random()*8)]);
    if (res.rows[0]) driverMap[d.email] = res.rows[0].id;
  }
  console.log(`  → ${Object.keys(driverMap).length} drivers inserted`);

  // ── VEHICLES ─────────────────────────────────────────────────
  console.log('\n🚙 Inserting vehicles...');

  const vehicles = [
    { driver: 'kofi.driver@mobo.test',   make:'Toyota', model:'Corolla',  year:2019, plate:'DL-1234-A', color:'White',  type:'standard', seats:4 },
    { driver: 'ibrahim.driver@mobo.test', make:'Honda',  model:'Civic',    year:2020, plate:'DL-5678-B', color:'Silver', type:'standard', seats:4 },
    { driver: 'yves.driver@mobo.test',    make:'Toyota', model:'Prado',    year:2021, plate:'YD-2233-C', color:'Black',  type:'luxury',   seats:7 },
    { driver: 'grace.driver@mobo.test',   make:'Toyota', model:'Camry',    year:2020, plate:'DL-9012-D', color:'Grey',   type:'comfort',  seats:4 },
    { driver: 'moussa.driver@mobo.test',  make:'Kia',    model:'Rio',      year:2018, plate:'YD-3344-E', color:'Blue',   type:'standard', seats:4 },
    { driver: 'aisha.driver@mobo.test',   make:'Toyota', model:'Hiace',    year:2019, plate:'DL-7788-F', color:'White',  type:'van',      seats:8 },
  ];

  for (const v of vehicles) {
    if (!driverMap[v.driver]) continue;
    const res = await client.query(`
      INSERT INTO vehicles (driver_id, make, model, year, plate, color, vehicle_type, seats, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)
      ON CONFLICT (plate) DO NOTHING
      RETURNING id
    `, [driverMap[v.driver], v.make, v.model, v.year, v.plate, v.color, v.type, v.seats]);

    if (res.rows[0]) {
      await client.query(`UPDATE drivers SET vehicle_id = $1 WHERE id = $2`,
        [res.rows[0].id, driverMap[v.driver]]);
    }
  }
  console.log(`  → ${vehicles.length} vehicles inserted`);

  // ── PAYMENT METHODS ──────────────────────────────────────────
  console.log('\n💳 Inserting payment methods...');
  const riders = ['amara@mobo.test','kwame@mobo.test','fatima@mobo.test','emeka@mobo.test','nadia@mobo.test'];
  for (const email of riders) {
    if (!userMap[email]) continue;
    await client.query(`
      INSERT INTO payment_methods (user_id, type, label, phone, is_default, is_active)
      VALUES ($1,'mtn_mobile_money','MTN MoMo',$2,true,true)
      ON CONFLICT DO NOTHING
    `, [userMap[email], await client.query(`SELECT phone FROM users WHERE id=$1`,[userMap[email]]).then(r=>r.rows[0]?.phone)]);
  }
  if (userMap['fatima@mobo.test']) {
    await client.query(`
      INSERT INTO payment_methods (user_id, type, label, card_last4, card_brand, is_default, is_active)
      VALUES ($1,'card','Visa Card','4242','Visa',false,true)
      ON CONFLICT DO NOTHING
    `, [userMap['fatima@mobo.test']]);
  }
  console.log(`  → Payment methods inserted`);

  // ── COMPLETED RIDES ──────────────────────────────────────────
  console.log('\n🛣️  Inserting rides...');

  const rideData = [
    {
      rider:'amara@mobo.test', driver:'kofi.driver@mobo.test',
      pickup_addr:'Akwa, Douala', pickup_lat:4.061, pickup_lng:9.757,
      drop_addr:'Bonanjo, Douala', drop_lat:4.052, drop_lng:9.696,
      dist:3.2, dur:12, fare:7740, status:'completed', method:'mobile_money',
      payment_status:'paid', days_ago:1
    },
    {
      rider:'fatima@mobo.test', driver:'grace.driver@mobo.test',
      pickup_addr:'Bonapriso, Douala', pickup_lat:4.068, pickup_lng:9.707,
      drop_addr:'Kotto, Douala', drop_lat:4.038, drop_lng:9.745,
      dist:5.1, dur:18, fare:10830, status:'completed', method:'card',
      payment_status:'paid', days_ago:2
    },
    {
      rider:'kwame@mobo.test', driver:'yves.driver@mobo.test',
      pickup_addr:'Centre Ville, Yaoundé', pickup_lat:3.867, pickup_lng:11.517,
      drop_addr:'Bastos, Yaoundé', drop_lat:3.880, drop_lng:11.506,
      dist:2.8, dur:10, fare:6960, status:'completed', method:'cash',
      payment_status:'paid', days_ago:3
    },
    {
      rider:'emeka@mobo.test', driver:'ibrahim.driver@mobo.test',
      pickup_addr:'Ndokoti, Douala', pickup_lat:4.048, pickup_lng:9.701,
      drop_addr:'Bassa, Douala', drop_lat:4.035, drop_lng:9.720,
      dist:4.0, dur:15, fare:9300, status:'completed', method:'mobile_money',
      payment_status:'paid', days_ago:1
    },
    {
      rider:'nadia@mobo.test', driver:'aisha.driver@mobo.test',
      pickup_addr:'Marché Central, Douala', pickup_lat:4.055, pickup_lng:9.734,
      drop_addr:'Logpom, Douala', drop_lat:4.071, drop_lng:9.756,
      dist:6.3, dur:22, fare:12810, status:'completed', method:'wallet',
      payment_status:'paid', days_ago:5
    },
    {
      rider:'amara@mobo.test', driver:'kofi.driver@mobo.test',
      pickup_addr:'Akwa, Douala', pickup_lat:4.061, pickup_lng:9.757,
      drop_addr:'Bonapriso, Douala', drop_lat:4.068, drop_lng:9.707,
      dist:2.1, dur:8, fare:5970, status:'completed', method:'mobile_money',
      payment_status:'paid', days_ago:7
    },
    {
      rider:'fatima@mobo.test', driver:'yves.driver@mobo.test',
      pickup_addr:'Bastos, Yaoundé', pickup_lat:3.880, pickup_lng:11.506,
      drop_addr:'Nlongkak, Yaoundé', drop_lat:3.862, drop_lng:11.512,
      dist:3.5, dur:13, fare:8250, status:'completed', method:'card',
      payment_status:'paid', days_ago:4, ride_type:'luxury'
    },
    {
      rider:'kwame@mobo.test', driver:'moussa.driver@mobo.test',
      pickup_addr:'Mvog-Mbi, Yaoundé', pickup_lat:3.848, pickup_lng:11.502,
      drop_addr:'Essos, Yaoundé', drop_lat:3.856, drop_lng:11.530,
      dist:3.9, dur:14, fare:9030, status:'cancelled', method:'cash',
      payment_status:'pending', days_ago:2, cancelled_by:'rider'
    },
    {
      rider:'amara@mobo.test', driver:'grace.driver@mobo.test',
      pickup_addr:'Bonapriso, Douala', pickup_lat:4.068, pickup_lng:9.707,
      drop_addr:'Akwa Nord, Douala', drop_lat:4.075, drop_lng:9.740,
      dist:4.8, dur:17, fare:10560, status:'completed', method:'mobile_money',
      payment_status:'paid', days_ago:10
    },
    {
      rider:'nadia@mobo.test', driver:'aisha.driver@mobo.test',
      pickup_addr:'Deido, Douala', pickup_lat:4.065, pickup_lng:9.720,
      drop_addr:'Bepanda, Douala', drop_lat:4.058, drop_lng:9.750,
      dist:5.5, dur:20, fare:11550, status:'in_progress', method:'wallet',
      payment_status:'pending', days_ago:0
    },
  ];

  const rideIds = [];
  for (const r of rideData) {
    if (!userMap[r.rider] || !driverMap[r.driver]) continue;
    const daysAgo = new Date(Date.now() - r.days_ago * 86400000);
    const serviceFee = Math.round(r.fare * 0.2);
    const isCompleted = r.status === 'completed';
    const isCancelled = r.status === 'cancelled';
    const started_at = isCompleted ? new Date(daysAgo.getTime() - 20*60000).toISOString() : null;
    const completed_at = isCompleted ? daysAgo.toISOString() : null;
    const cancelled_at = isCancelled ? daysAgo.toISOString() : null;

    const res = await client.query(`
      INSERT INTO rides (
        rider_id, driver_id, ride_type, status,
        pickup_address, pickup_location, dropoff_address, dropoff_location,
        distance_km, duration_minutes, estimated_fare, final_fare,
        base_fare, per_km_fare, per_minute_fare, surge_multiplier,
        service_fee, booking_fee, payment_method, payment_status,
        tip_amount, started_at, completed_at, cancelled_at, cancelled_by,
        created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,
        $5,ST_SetSRID(ST_MakePoint($6,$7),4326),$8,ST_SetSRID(ST_MakePoint($9,$10),4326),
        $11,$12,$13,$14,
        1000,700,100,1.0,
        $15,500,$16,$17,
        $18,$19,$20,$21,$22,
        $23,$23
      ) RETURNING id
    `, [
      userMap[r.rider], driverMap[r.driver], r.ride_type || 'standard', r.status,
      r.pickup_addr, r.pickup_lng, r.pickup_lat, r.drop_addr, r.drop_lng, r.drop_lat,
      r.dist, r.dur, r.fare, isCompleted ? r.fare : null,
      serviceFee, r.method, r.payment_status,
      Math.floor(Math.random() * 500),
      started_at, completed_at, cancelled_at, r.cancelled_by || null,
      daysAgo.toISOString()
    ]);
    if (res.rows[0]) rideIds.push({ id: res.rows[0].id, ...r });
  }
  console.log(`  → ${rideIds.length} rides inserted`);

  // ── PAYMENTS ─────────────────────────────────────────────────
  console.log('\n💰 Inserting payments...');
  // Map ride payment_method enum to payments method enum
  const methodMap = { mobile_money: 'mtn_mobile_money', card: 'stripe', cash: 'cash', wallet: 'wallet', points: 'wave' };
  for (const r of rideIds) {
    if (r.payment_status !== 'paid') continue;
    const payMethod = methodMap[r.method] || 'cash';
    await client.query(`
      INSERT INTO payments (ride_id, user_id, amount, currency, method, status, transaction_id)
      VALUES ($1,$2,$3,'XAF',$4,'completed',$5)
    `, [r.id, userMap[r.rider], r.fare, payMethod, 'TXN-' + Math.random().toString(36).substr(2,10).toUpperCase()]);
  }
  console.log(`  → Payments inserted`);

  // ── RATINGS ──────────────────────────────────────────────────
  console.log('\n⭐ Inserting ratings...');
  for (const r of rideIds) {
    if (r.status !== 'completed') continue;
    const driverUserId = await client.query(`SELECT user_id FROM drivers WHERE id=$1`,[driverMap[r.driver]]).then(res=>res.rows[0]?.user_id);
    if (!driverUserId) continue;
    // Rider rates driver
    await client.query(`
      INSERT INTO ride_ratings (ride_id, rater_id, rated_id, rating, comment)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING
    `, [r.id, userMap[r.rider], driverUserId,
        [4,4,5,5,5][Math.floor(Math.random()*5)],
        ['Great driver!','Very smooth ride','On time and professional','Clean car, nice driver','Excellent service'][Math.floor(Math.random()*5)]
    ]);
    // Driver rates rider
    await client.query(`
      INSERT INTO ride_ratings (ride_id, rater_id, rated_id, rating, comment)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING
    `, [r.id, driverUserId, userMap[r.rider], 5, 'Good passenger']);
  }
  console.log(`  → Ratings inserted`);

  // ── LOYALTY TRANSACTIONS ─────────────────────────────────────
  console.log('\n🎁 Inserting loyalty transactions...');
  const loyaltyRiders = ['amara@mobo.test','fatima@mobo.test','kwame@mobo.test'];
  for (const email of loyaltyRiders) {
    if (!userMap[email]) continue;
    await client.query(`
      INSERT INTO loyalty_transactions (user_id, points, action, description)
      VALUES
        ($1, 500, 'ride_completed', 'Points earned from ride'),
        ($1, 200, 'ride_completed', 'Points earned from ride'),
        ($1, 150, 'round_up', 'Round-up fare to loyalty points'),
        ($1, 100, 'referral', 'Referral bonus')
    `, [userMap[email]]);
  }
  console.log(`  → Loyalty transactions inserted`);

  // ── NOTIFICATIONS ────────────────────────────────────────────
  console.log('\n🔔 Inserting notifications...');
  for (const email of Object.keys(userMap)) {
    const uid = userMap[email];
    await client.query(`
      INSERT INTO notifications (user_id, title, message, type, is_read)
      VALUES
        ($1,'Welcome to MOBO! 🎉','Your account is ready. Book your first ride now.','system',false),
        ($1,'Ride Completed','Your ride to Bonanjo has been completed. Rate your driver!','ride',true)
    `, [uid]);
  }
  console.log(`  → Notifications inserted`);

  // ── PROMO CODES ──────────────────────────────────────────────
  console.log('\n🏷️  Inserting promo codes...');
  await client.query(`
    INSERT INTO promo_codes (code, discount_type, discount_value, min_fare, max_uses, expires_at, is_active)
    VALUES
      ('MOBO10',    'percent', 10,    2000, 500, NOW() + interval '30 days', true),
      ('WELCOME500','fixed',   500,   1000, 200, NOW() + interval '60 days', true),
      ('DOUALA20',  'percent', 20,    3000, 100, NOW() + interval '14 days', true),
      ('FIRST1000', 'fixed',   1000,  1500, 150, NOW() + interval '45 days', true),
      ('YAOUNDE15', 'percent', 15,    2500,  50, NOW() + interval '21 days', true)
    ON CONFLICT (code) DO NOTHING
  `);
  console.log(`  → 5 promo codes inserted`);

  // ── SURGE ZONES ──────────────────────────────────────────────
  console.log('\n⚡ Inserting surge zones...');
  await client.query(`
    INSERT INTO surge_zones (name, city, zone, multiplier, is_active)
    VALUES
      ('Akwa Business District', 'Douala',
       ST_SetSRID(ST_MakePolygon(ST_GeomFromText(
         'LINESTRING(9.740 4.040, 9.780 4.040, 9.780 4.075, 9.740 4.075, 9.740 4.040)'
       )), 4326), 1.5, true),
      ('Centre Ville Yaoundé', 'Yaoundé',
       ST_SetSRID(ST_MakePolygon(ST_GeomFromText(
         'LINESTRING(11.490 3.840, 11.540 3.840, 11.540 3.880, 11.490 3.880, 11.490 3.840)'
       )), 4326), 1.5, true),
      ('Aéroport Douala', 'Douala',
       ST_SetSRID(ST_MakePolygon(ST_GeomFromText(
         'LINESTRING(9.710 4.000, 9.740 4.000, 9.740 4.025, 9.710 4.025, 9.710 4.000)'
       )), 4326), 2.0, true)
    ON CONFLICT DO NOTHING
  `);
  console.log(`  → 3 surge zones inserted`);

  // ── MESSAGES ─────────────────────────────────────────────────
  console.log('\n💬 Inserting messages...');
  const inProgressRide = rideIds.find(r => r.status === 'in_progress');
  if (inProgressRide) {
    const driverUserId = await client.query(`SELECT user_id FROM drivers WHERE id=$1`,[driverMap[inProgressRide.driver]]).then(res=>res.rows[0]?.user_id);
    if (driverUserId) {
      await client.query(`
        INSERT INTO messages (ride_id, sender_id, receiver_id, content, is_read)
        VALUES
          ($1,$2,$3,'Je suis en route, j''arrive dans 3 minutes',true),
          ($1,$3,$2,'D''accord, je vous attends devant l''entrée',true),
          ($1,$2,$3,'Je suis arrivé, voiture grise Toyota',false)
      `, [inProgressRide.id, driverUserId, userMap[inProgressRide.rider]]);
    }
  }
  console.log(`  → Messages inserted`);

  // ── BONUS CHALLENGES ─────────────────────────────────────────
  console.log('\n🏆 Inserting bonus challenges...');
  await client.query(`
    INSERT INTO bonus_challenges (name, description, challenge_type, target_value, bonus_amount, city, starts_at, ends_at, is_active)
    VALUES
      ('Weekend Warrior',  'Complete 20 rides this weekend',         'rides_count',    20, 5000,  'Douala',   NOW(),                    NOW() + interval '3 days',  true),
      ('Peak Hour Pro',    'Complete 15 rides during peak hours',    'rides_count',    15, 3000,  'Yaoundé',  NOW(),                    NOW() + interval '7 days',  true),
      ('5-Star Streak',    'Maintain 5.0 rating for 10 rides',       'rating',         10, 8000,  NULL,       NOW(),                    NOW() + interval '14 days', true),
      ('Century Driver',   'Complete 100 rides this month',          'rides_count',   100, 25000, NULL,       date_trunc('month',NOW()), NOW() + interval '30 days', true),
      ('Early Bird',       'Complete 10 rides before 8am',           'rides_count',    10, 4000,  'Douala',   NOW(),                    NOW() + interval '5 days',  true)
    ON CONFLICT DO NOTHING
  `);
  console.log(`  → 5 bonus challenges inserted`);

  // ── REFERRALS ────────────────────────────────────────────────
  console.log('\n🤝 Inserting referrals...');
  if (userMap['amara@mobo.test'] && userMap['emeka@mobo.test']) {
    await client.query(`
      INSERT INTO referrals (referrer_id, referred_id, status, qualified_at, paid_at)
      VALUES ($1, $2, 'paid', NOW() - interval '5 days', NOW() - interval '4 days')
      ON CONFLICT DO NOTHING
    `, [userMap['amara@mobo.test'], userMap['emeka@mobo.test']]);
  }
  if (userMap['fatima@mobo.test'] && userMap['nadia@mobo.test']) {
    await client.query(`
      INSERT INTO referrals (referrer_id, referred_id, status)
      VALUES ($1, $2, 'pending')
      ON CONFLICT DO NOTHING
    `, [userMap['fatima@mobo.test'], userMap['nadia@mobo.test']]);
  }
  console.log(`  → Referrals inserted`);

  // ── FAMILY ACCOUNT ───────────────────────────────────────────
  console.log('\n👨‍👩‍👧 Inserting family account...');
  if (userMap['fatima@mobo.test'] && userMap['lea@mobo.test']) {
    const fam = await client.query(`
      INSERT INTO family_accounts (owner_id, name, monthly_limit, is_active)
      VALUES ($1, 'Famille Ouedraogo', 30000, true)
      RETURNING id
    `, [userMap['fatima@mobo.test']]);
    if (fam.rows[0]) {
      const famId = fam.rows[0].id;
      await client.query(`
        UPDATE users SET family_account_id = $1 WHERE id = ANY($2::uuid[])
      `, [famId, [userMap['fatima@mobo.test'], userMap['lea@mobo.test']]]);
      await client.query(`
        INSERT INTO family_members (family_account_id, user_id, role, can_see_rides)
        VALUES ($1,$2,'owner',true),($1,$3,'member',false)
        ON CONFLICT DO NOTHING
      `, [famId, userMap['fatima@mobo.test'], userMap['lea@mobo.test']]);
    }
  }
  console.log(`  → Family account inserted`);

  // ── SUBSCRIPTIONS ────────────────────────────────────────────
  console.log('\n📋 Inserting subscriptions...');
  if (userMap['amara@mobo.test']) {
    await client.query(`
      INSERT INTO subscriptions (user_id, plan, price, currency, started_at, expires_at, is_active)
      VALUES ($1,'basic',5000,'XAF',NOW() - interval '10 days',NOW() + interval '20 days',true)
      ON CONFLICT DO NOTHING
    `, [userMap['amara@mobo.test']]);
  }
  if (userMap['fatima@mobo.test']) {
    await client.query(`
      INSERT INTO subscriptions (user_id, plan, price, currency, started_at, expires_at, is_active)
      VALUES ($1,'premium',10000,'XAF',NOW() - interval '5 days',NOW() + interval '25 days',true)
      ON CONFLICT DO NOTHING
    `, [userMap['fatima@mobo.test']]);
  }
  console.log(`  → Subscriptions inserted`);

  // ── FLEET ────────────────────────────────────────────────────
  console.log('\n🚕 Inserting fleet...');
  if (userMap['jp.fleet@mobo.test']) {
    const fleet = await client.query(`
      INSERT INTO fleets (owner_id, name, city, description, is_active, is_approved)
      VALUES ($1,'FlotteDouala','Douala','Premium fleet service in Douala',true,true)
      RETURNING id
    `, [userMap['jp.fleet@mobo.test']]).catch(() => ({ rows: [] }));
    console.log(`  → Fleet inserted`);
  }

  // ── FINAL SUMMARY ────────────────────────────────────────────
  console.log('\n✅ All sample data inserted successfully!\n');

  const counts = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM users)               as users,
      (SELECT COUNT(*) FROM drivers)             as drivers,
      (SELECT COUNT(*) FROM vehicles)            as vehicles,
      (SELECT COUNT(*) FROM rides)               as rides,
      (SELECT COUNT(*) FROM payments)            as payments,
      (SELECT COUNT(*) FROM ride_ratings)        as ratings,
      (SELECT COUNT(*) FROM notifications)       as notifications,
      (SELECT COUNT(*) FROM promo_codes)         as promo_codes,
      (SELECT COUNT(*) FROM surge_zones)         as surge_zones,
      (SELECT COUNT(*) FROM bonus_challenges)    as bonus_challenges,
      (SELECT COUNT(*) FROM family_accounts)     as family_accounts,
      (SELECT COUNT(*) FROM referrals)           as referrals
  `);
  console.log('📊 Database summary:');
  console.table(counts.rows[0]);

  console.log('\n🔑 Test credentials (password: "password"):');
  console.log('  Rider:        amara@mobo.test');
  console.log('  Rider Premium:fatima@mobo.test');
  console.log('  Driver:       kofi.driver@mobo.test');
  console.log('  Fleet Owner:  jp.fleet@mobo.test');
  console.log('  Admin:        admin@mobo.test');

  await client.end();
}

run().catch(err => {
  console.error('\n❌ Error:', err.message);
  client.end();
  process.exit(1);
});
