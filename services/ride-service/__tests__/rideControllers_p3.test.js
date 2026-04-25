'use strict';
/**
 * rideControllers_p3.test.js — P3 controller tests
 *
 * Tests: adsController, driverTierController, earningsGuaranteeController,
 *        fuelCardController, maintenanceController, vehicleInspectionController,
 *        developerPortalController
 */

process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'test_secret_minimum_32_chars_long_abc';
process.env.DATABASE_URL = 'postgresql://localhost/mobo_test';

const mockDb = {
  query:     jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  queryRead: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  getClient: jest.fn(),
};

jest.mock('../src/config/database', () => mockDb);
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
}));
jest.mock('../src/jobs/escalationJob',        () => ({ startEscalationJob: jest.fn() }));
jest.mock('../src/jobs/scheduledRideJob',     () => ({ startScheduledRideJob: jest.fn() }));
jest.mock('../src/jobs/deliverySchedulerJob', () => ({ startDeliverySchedulerJob: jest.fn() }));
jest.mock('../src/jobs/messagePurgeJob',      () => ({ startMessagePurgeJob: jest.fn() }));
jest.mock('../src/queues/fraudWorker',        () => ({ startFraudWorker: jest.fn() }));
jest.mock('nodemailer', () => ({ createTransport: () => ({ sendMail: jest.fn() }) }));
jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('../src/utils/push', () => ({
  sendPush: jest.fn().mockResolvedValue({}),
}), { virtual: true });

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../server');

const SECRET      = process.env.JWT_SECRET;
const riderToken  = jwt.sign({ id: 'user-1', role: 'rider' }, SECRET, { expiresIn: '1h' });
const driverToken = jwt.sign({ id: 'driver-user-1', role: 'driver', driver_id: 'driver-1' }, SECRET, { expiresIn: '1h' });
const adminToken  = jwt.sign({ id: 'admin-1', role: 'admin' }, SECRET, { expiresIn: '1h' });

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mockDb.queryRead = (...args) => mockDb.query(...args);
});

// ═══════════════════════════════════════════════════════════════════════════════
// adsController
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /ads', () => {
  test('returns active ads for default context (home)', async () => {
    const ads = [
      { id: 'ad-1', type: 'internal', title: 'Promo 1', subtitle: 'Save 20%', context: 'home', priority: 1 },
      { id: 'ad-2', type: 'external', title: 'Partner Ad', subtitle: 'Shop now', context: 'all', priority: 0 },
    ];
    mockDb.query.mockResolvedValueOnce({ rows: ads });

    const res = await request(app)
      .get('/ads')
      .set('Authorization', `Bearer ${riderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ads).toHaveLength(2);
    expect(res.body.ads[0].title).toBe('Promo 1');
  });

  test('returns empty list when no ads active', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/ads?context=ride')
      .set('Authorization', `Bearer ${riderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ads).toHaveLength(0);
  });

  test('401 without token', async () => {
    const res = await request(app).get('/ads');
    expect(res.status).toBe(401);
  });
});

describe('POST /ads (admin)', () => {
  test('creates ad and returns 201', async () => {
    const newAd = { id: 'ad-new', title: 'New Promo', subtitle: 'Save big', type: 'internal' };
    mockDb.query.mockResolvedValueOnce({ rows: [newAd] });

    const res = await request(app)
      .post('/ads')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'New Promo', subtitle: 'Save big' });

    expect(res.status).toBe(201);
    expect(res.body.ad.title).toBe('New Promo');
  });

  test('400 when title or subtitle missing', async () => {
    const res = await request(app)
      .post('/ads')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'No subtitle' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('title and subtitle');
  });

  test('403 for non-admin user', async () => {
    const res = await request(app)
      .post('/ads')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ title: 'Hack', subtitle: 'Attempt' });

    expect(res.status).toBe(403);
  });
});

describe('PUT /ads/:id (admin)', () => {
  test('updates an existing ad', async () => {
    const updated = { id: 'ad-1', title: 'Updated Title', subtitle: 'New Sub' };
    mockDb.query.mockResolvedValueOnce({ rows: [updated] });

    const res = await request(app)
      .put('/ads/ad-1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Updated Title' });

    expect(res.status).toBe(200);
    expect(res.body.ad.title).toBe('Updated Title');
  });

  test('404 when ad not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put('/ads/nonexistent')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Something' });

    expect(res.status).toBe(404);
  });
});

describe('PATCH /ads/:id/toggle (admin)', () => {
  test('toggles ad active status', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'ad-1', active: false }] });

    const res = await request(app)
      .patch('/ads/ad-1/toggle')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
  });

  test('404 when ad not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch('/ads/nonexistent/toggle')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

describe('DELETE /ads/:id (admin)', () => {
  test('deletes ad and returns ok:true', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .delete('/ads/ad-1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('404 when ad not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .delete('/ads/nonexistent')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /ads/:id/impression and /click', () => {
  test('records impression — always returns ok:true', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/ads/ad-1/impression')
      .set('Authorization', `Bearer ${riderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('records click — always returns ok:true', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/ads/ad-1/click')
      .set('Authorization', `Bearer ${riderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('impression still returns ok when DB fails (non-critical)', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB down'));

    const res = await request(app)
      .post('/ads/ad-1/impression')
      .set('Authorization', `Bearer ${riderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// driverTierController
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /rides/drivers/me/tier', () => {
  test('returns driver tier and stats', async () => {
    const driverRow = {
      tier: 'Gold',
      lifetime_trips: 150,
      acceptance_rate: 85,
      rating: '4.65',
      trips_this_month: 20,
      earnings_this_month: 45000,
    };
    mockDb.query.mockResolvedValueOnce({ rows: [driverRow] });

    const res = await request(app)
      .get('/rides/drivers/me/tier')
      .set('Authorization', `Bearer ${driverToken}`);

    expect(res.status).toBe(200);
    expect(res.body.tier).toBe('Gold');
    expect(res.body.total_trips).toBe(150);
    expect(res.body.rating).toBe(4.65);
    expect(res.body.acceptance_rate).toBe(85);
  });

  test('upgrades tier when criteria met (Diamond)', async () => {
    const driverRow = {
      tier: 'Gold',
      lifetime_trips: 1600,
      acceptance_rate: 92,
      rating: '4.9',
      trips_this_month: 80,
      earnings_this_month: 200000,
    };
    mockDb.query
      .mockResolvedValueOnce({ rows: [driverRow] })  // SELECT driver stats
      .mockResolvedValueOnce({ rows: [] });           // UPDATE tier

    const res = await request(app)
      .get('/rides/drivers/me/tier')
      .set('Authorization', `Bearer ${driverToken}`);

    expect(res.status).toBe(200);
    expect(res.body.tier).toBe('Diamond');
    // UPDATE should be called with the new tier
    expect(mockDb.query.mock.calls[1][1][0]).toBe('Diamond');
  });

  test('404 when driver not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/rides/drivers/me/tier')
      .set('Authorization', `Bearer ${driverToken}`);

    expect(res.status).toBe(404);
  });
});

describe('GET /rides/driver/radar', () => {
  test('returns pending rides near driver (with lat/lng)', async () => {
    const rides = [
      { id: 'ride-1', pickup_address: 'Douala Market', distance_km: '2.5', wait_min: '5' },
    ];
    mockDb.query.mockResolvedValueOnce({ rows: rides });

    const res = await request(app)
      .get('/rides/driver/radar?lat=4.05&lng=9.77')
      .set('Authorization', `Bearer ${driverToken}`);

    expect(res.status).toBe(200);
    expect(res.body.rides).toHaveLength(1);
  });

  test('returns pending rides without geo-filter when lat/lng omitted', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/rides/driver/radar')
      .set('Authorization', `Bearer ${driverToken}`);

    expect(res.status).toBe(200);
    expect(res.body.rides).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// earningsGuaranteeController
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /rides/drivers/me/guarantee', () => {
  test('returns guarantee window for existing record', async () => {
    const window = {
      guarantee_xaf_per_hr: 2500,
      hours_online: 6,
      topup_paid: false,
    };
    mockDb.query
      .mockResolvedValueOnce({ rows: [window] })                             // SELECT window
      .mockResolvedValueOnce({ rows: [{ actual: '12000' }] })               // SELECT actual earnings
      .mockResolvedValueOnce({ rows: [] })                                   // UPDATE window
      .mockResolvedValueOnce({ rows: [] });                                  // SELECT history

    const res = await request(app)
      .get('/rides/drivers/me/guarantee')
      .set('Authorization', `Bearer ${driverToken}`);

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(true);
    expect(res.body.guarantee_xaf_per_hr).toBe(2500);
    expect(res.body.hours_online).toBe(6);
    expect(typeof res.body.topup_owed).toBe('number');
  });

  test('creates new window when none exists', async () => {
    const newWindow = {
      guarantee_xaf_per_hr: 2000,
      hours_online: 0,
      topup_paid: false,
    };
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })                              // SELECT → no record
      .mockResolvedValueOnce({ rows: [{ tier: 'Bronze' }] })            // SELECT tier
      .mockResolvedValueOnce({ rows: [newWindow] })                     // INSERT window
      .mockResolvedValueOnce({ rows: [{ actual: '0' }] })               // SELECT actual
      .mockResolvedValueOnce({ rows: [] })                              // UPDATE window
      .mockResolvedValueOnce({ rows: [] });                             // SELECT history

    const res = await request(app)
      .get('/rides/drivers/me/guarantee')
      .set('Authorization', `Bearer ${driverToken}`);

    expect(res.status).toBe(200);
    expect(res.body.guarantee_xaf_per_hr).toBe(2000);
  });

  test('topup_owed is positive when actual < guaranteed', async () => {
    const window = { guarantee_xaf_per_hr: 3000, hours_online: 4, topup_paid: false };
    mockDb.query
      .mockResolvedValueOnce({ rows: [window] })
      .mockResolvedValueOnce({ rows: [{ actual: '5000' }] })   // 4h * 3000 = 12000 guaranteed; actual 5000 → topup 7000
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/rides/drivers/me/guarantee')
      .set('Authorization', `Bearer ${driverToken}`);

    expect(res.status).toBe(200);
    expect(res.body.topup_owed).toBe(7000);
  });
});

describe('GET /rides/drivers/me/guarantee/history', () => {
  test('returns up to 30 days history', async () => {
    const history = [
      { date: '2026-04-23', hours: 8, actual: 20000, guarantee: 24000, topup: 4000, paid: false },
    ];
    mockDb.query.mockResolvedValueOnce({ rows: history });

    const res = await request(app)
      .get('/rides/drivers/me/guarantee/history')
      .set('Authorization', `Bearer ${driverToken}`);

    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0].topup).toBe(4000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// fuelCardController
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /rides/drivers/me/fuel-card', () => {
  test('returns existing fuel card', async () => {
    const card = { id: 'fc-1', card_number: 'MOBO-FC-5432', balance_xaf: 5000, total_saved_xaf: 1200 };
    mockDb.query.mockResolvedValueOnce({ rows: [card] });

    const res = await request(app)
      .get('/rides/drivers/me/fuel-card')
      .set('Authorization', `Bearer ${driverToken}`);

    expect(res.status).toBe(200);
    expect(res.body.card_number).toBe('MOBO-FC-5432');
    expect(res.body.total_saved_xaf).toBe(1200);
  });

  test('auto-creates card when driver has none', async () => {
    const newCard = { id: 'fc-new', card_number: 'MOBO-FC-1234', balance_xaf: 0, total_saved_xaf: 0 };
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })          // SELECT → none
      .mockResolvedValueOnce({ rows: [newCard] });   // INSERT

    const res = await request(app)
      .get('/rides/drivers/me/fuel-card')
      .set('Authorization', `Bearer ${driverToken}`);

    expect(res.status).toBe(200);
    expect(res.body.card_number).toMatch(/^MOBO-FC-/);
  });
});

describe('GET /rides/drivers/me/fuel-card/transactions', () => {
  test('returns fuel card transactions', async () => {
    const txns = [
      { id: 'tx-1', amount_litres: 20, discount_xaf: 500, transacted_at: new Date().toISOString() },
    ];
    mockDb.query.mockResolvedValueOnce({ rows: txns });

    const res = await request(app)
      .get('/rides/drivers/me/fuel-card/transactions')
      .set('Authorization', `Bearer ${driverToken}`);

    expect(res.status).toBe(200);
    expect(res.body.transactions).toHaveLength(1);
  });

  test('returns empty list when no transactions', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/rides/drivers/me/fuel-card/transactions')
      .set('Authorization', `Bearer ${driverToken}`);

    expect(res.status).toBe(200);
    expect(res.body.transactions).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// maintenanceController
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /rides/drivers/me/maintenance', () => {
  test('returns maintenance data with partner garages', async () => {
    const vehicleRow = {
      vehicle_make: 'Toyota', vehicle_model: 'Camry',
      plate: 'LT-001-SW', current_mileage_km: '80000', trip_mileage_km: '12000',
    };
    mockDb.query
      .mockResolvedValueOnce({ rows: [vehicleRow] })  // driver + vehicle query
      .mockResolvedValueOnce({ rows: [] });            // maintenance records

    const res = await request(app)
      .get('/rides/drivers/me/maintenance')
      .set('Authorization', `Bearer ${driverToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.partner_garages).toHaveLength(2);
  });

  test('fills in default service items when no DB records', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ current_mileage_km: '50000', trip_mileage_km: '5000' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/rides/drivers/me/maintenance')
      .set('Authorization', `Bearer ${driverToken}`);

    expect(res.status).toBe(200);
    // All 6 service types should be present
    const keys = res.body.items.map((i) => i.key || Object.keys(i)[0]);
    expect(res.body.items.length).toBe(6);
  });
});

describe('POST /rides/drivers/me/maintenance/log', () => {
  test('logs a valid service and returns next_service_km', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/rides/drivers/me/maintenance/log')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ service_key: 'oil_change', mileage_km: 80000 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.next_service_km).toBe(85000); // 80000 + 5000 interval
  });

  test('400 for invalid service_key', async () => {
    const res = await request(app)
      .post('/rides/drivers/me/maintenance/log')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ service_key: 'invalid_service', mileage_km: 80000 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid service key');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// developerPortalController
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /rides/developer/portal', () => {
  test('returns existing portal (masked key)', async () => {
    const portalRow = {
      id: 'portal-1', user_id: 'user-1',
      api_key: 'mobo_live_sk_abcdefghij12345678901234567890ab',
      plan: 'Starter', active: true,
    };
    mockDb.query.mockResolvedValueOnce({ rows: [portalRow] });

    const res = await request(app)
      .get('/rides/developer/portal')
      .set('Authorization', `Bearer ${riderToken}`);

    expect(res.status).toBe(200);
    // Raw api_key must NOT be returned — only the masked version
    expect(res.body.api_key).toBeUndefined();
    expect(res.body.api_key_masked).toBeDefined();
    // Masked key starts with 'mobo_live_sk_' prefix
    expect(res.body.api_key_masked).toMatch(/^mobo_live_sk_/);
    // Ends with last 4 chars
    expect(res.body.api_key_masked).toContain('0ab');
  });

  test('auto-creates portal when none exists', async () => {
    const newRow = {
      id: 'portal-new', user_id: 'user-1',
      api_key: 'mobo_live_sk_newkey1234567890abcdefgh12',
      plan: 'Starter', active: true,
    };
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })          // SELECT → none
      .mockResolvedValueOnce({ rows: [newRow] });    // INSERT

    const res = await request(app)
      .get('/rides/developer/portal')
      .set('Authorization', `Bearer ${riderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('Starter');
    expect(res.body.api_key).toBeUndefined();
  });
});

describe('POST /rides/developer/portal/regenerate-key', () => {
  test('revokes old key and returns new key in plaintext (one-time)', async () => {
    const newRow = {
      api_key: 'mobo_live_sk_newgeneratedkeyabcdefgh123456',
      plan: 'Pro',
    };
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })       // UPDATE SET active=FALSE
      .mockResolvedValueOnce({ rows: [newRow] }); // INSERT new key

    const res = await request(app)
      .post('/rides/developer/portal/regenerate-key')
      .set('Authorization', `Bearer ${riderToken}`);

    expect(res.status).toBe(200);
    // The full key is returned ONCE on regeneration
    expect(res.body.api_key).toBeDefined();
    expect(res.body.api_key).toMatch(/^mobo_live_sk_/);
    expect(res.body.message).toContain('Save this key');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// vehicleInspectionController
// ═══════════════════════════════════════════════════════════════════════════════

const validInspectionBody = {
  inspection_type:  'routine',
  exterior_ok:      true,
  interior_ok:      true,
  tires_ok:         true,
  brakes_ok:        true,
  lights_ok:        true,
  windshield_ok:    true,
  seatbelts_ok:     true,
  airbags_ok:       true,
  first_aid_ok:     true,
  fire_ext_ok:      true,
  photo_front:      'https://cdn.mobo.com/photo_front.jpg',
  photo_interior:   'https://cdn.mobo.com/photo_interior.jpg',
  odometer_km:      80000,
  driver_notes:     'All good',
};

describe('POST /rides/inspections', () => {
  test('submits inspection successfully and returns 201', async () => {
    const driverRow = { id: 'driver-1', vehicle_id: 'vehicle-1' };
    const inspection = { id: 'insp-1', status: 'submitted', inspection_type: 'routine' };

    mockDb.query
      .mockResolvedValueOnce({ rows: [driverRow] })   // SELECT driver
      .mockResolvedValueOnce({ rows: [inspection] }); // INSERT inspection

    const res = await request(app)
      .post('/rides/inspections')
      .set('Authorization', `Bearer ${driverToken}`)
      .set('x-user-id', 'driver-user-1')
      .send(validInspectionBody);

    expect(res.status).toBe(201);
    expect(res.body.inspection.status).toBe('submitted');
    expect(res.body.message).toContain('submitted for review');
  });

  test('403 when driver not found or not approved', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // driver not found

    const res = await request(app)
      .post('/rides/inspections')
      .set('Authorization', `Bearer ${driverToken}`)
      .set('x-user-id', 'driver-user-1')
      .send(validInspectionBody);

    expect(res.status).toBe(403);
  });

  test('400 when no vehicle linked', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'driver-1', vehicle_id: null }] });

    const res = await request(app)
      .post('/rides/inspections')
      .set('Authorization', `Bearer ${driverToken}`)
      .set('x-user-id', 'driver-user-1')
      .send(validInspectionBody);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No vehicle');
  });

  test('400 when photo_front is missing', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'driver-1', vehicle_id: 'v-1' }] });

    const res = await request(app)
      .post('/rides/inspections')
      .set('Authorization', `Bearer ${driverToken}`)
      .set('x-user-id', 'driver-user-1')
      .send({ ...validInspectionBody, photo_front: undefined });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('photo_front');
  });

  test('400 when required checklist field missing (non-boolean)', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'driver-1', vehicle_id: 'v-1' }] });

    const res = await request(app)
      .post('/rides/inspections')
      .set('Authorization', `Bearer ${driverToken}`)
      .set('x-user-id', 'driver-user-1')
      .send({ ...validInspectionBody, exterior_ok: 'yes' }); // string, not boolean

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('exterior_ok');
  });
});

describe('GET /rides/inspections/me', () => {
  test('returns driver inspection history', async () => {
    const inspections = [
      { id: 'insp-1', status: 'approved', make: 'Toyota', model: 'Camry', plate_number: 'LT-001' },
    ];
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'driver-1' }] })   // SELECT driver
      .mockResolvedValueOnce({ rows: inspections });             // SELECT inspections

    const res = await request(app)
      .get('/rides/inspections/me')
      .set('Authorization', `Bearer ${driverToken}`)
      .set('x-user-id', 'driver-user-1');

    expect(res.status).toBe(200);
    expect(res.body.inspections).toHaveLength(1);
    expect(res.body.inspections[0].status).toBe('approved');
  });

  test('403 when not a driver', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/rides/inspections/me')
      .set('Authorization', `Bearer ${riderToken}`)
      .set('x-user-id', 'user-1');

    expect(res.status).toBe(403);
  });
});

describe('GET /rides/inspections/me/current', () => {
  test('returns current inspection with is_valid=true when approved and not expired', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 20);
    const inspection = {
      id: 'insp-1', status: 'approved',
      due_date: futureDate.toISOString(),
      make: 'Toyota', model: 'Camry',
    };
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'driver-1', vehicle_id: 'v-1' }] })
      .mockResolvedValueOnce({ rows: [inspection] });

    const res = await request(app)
      .get('/rides/inspections/me/current')
      .set('Authorization', `Bearer ${driverToken}`)
      .set('x-user-id', 'driver-user-1');

    expect(res.status).toBe(200);
    expect(res.body.is_valid).toBe(true);
    expect(res.body.inspection.status).toBe('approved');
  });

  test('is_valid=false when inspection is expired', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    const inspection = {
      id: 'insp-2', status: 'approved',
      due_date: pastDate.toISOString(),
    };
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'driver-1', vehicle_id: 'v-1' }] })
      .mockResolvedValueOnce({ rows: [inspection] });

    const res = await request(app)
      .get('/rides/inspections/me/current')
      .set('Authorization', `Bearer ${driverToken}`)
      .set('x-user-id', 'driver-user-1');

    expect(res.status).toBe(200);
    expect(res.body.is_valid).toBe(false);
  });

  test('inspection=null when no inspections on record', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'driver-1', vehicle_id: 'v-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/rides/inspections/me/current')
      .set('Authorization', `Bearer ${driverToken}`)
      .set('x-user-id', 'driver-user-1');

    expect(res.status).toBe(200);
    expect(res.body.inspection).toBeNull();
    expect(res.body.is_valid).toBe(false);
  });
});

describe('GET /rides/admin/inspections', () => {
  test('admin lists inspections with total count', async () => {
    const inspections = [
      { id: 'insp-1', status: 'submitted', driver_name: 'Jean Dupont' },
    ];
    mockDb.query
      .mockResolvedValueOnce({ rows: inspections })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });

    const res = await request(app)
      .get('/rides/admin/inspections')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.inspections).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });
});

describe('PATCH /rides/admin/inspections/:id/review', () => {
  test('admin approves inspection', async () => {
    const insp = { id: 'insp-1', status: 'submitted', driver_id: 'driver-1', vehicle_id: 'v-1' };
    const updated = { ...insp, status: 'approved', reviewed_at: new Date().toISOString() };

    mockDb.query
      .mockResolvedValueOnce({ rows: [insp] })       // SELECT inspection
      .mockResolvedValueOnce({ rows: [updated] })    // UPDATE inspection
      .mockResolvedValueOnce({ rows: [] })           // UPDATE vehicles
      .mockResolvedValueOnce({ rows: [] });          // SELECT expo_push_token

    const res = await request(app)
      .patch('/rides/admin/inspections/insp-1/review')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-user-id', 'admin-1')
      .send({ decision: 'approved', admin_notes: 'Looks good' });

    expect(res.status).toBe(200);
    expect(res.body.inspection.status).toBe('approved');
  });

  test('admin rejects inspection with reason', async () => {
    const insp = { id: 'insp-2', status: 'submitted', driver_id: 'driver-1', vehicle_id: 'v-1' };
    const updated = { ...insp, status: 'rejected', rejection_reason: 'Tires worn' };

    mockDb.query
      .mockResolvedValueOnce({ rows: [insp] })
      .mockResolvedValueOnce({ rows: [updated] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch('/rides/admin/inspections/insp-2/review')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-user-id', 'admin-1')
      .send({ decision: 'rejected', rejection_reason: 'Tires worn' });

    expect(res.status).toBe(200);
    expect(res.body.inspection.status).toBe('rejected');
  });

  test('400 when decision is not approved or rejected', async () => {
    const res = await request(app)
      .patch('/rides/admin/inspections/insp-1/review')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-user-id', 'admin-1')
      .send({ decision: 'maybe' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('approved or rejected');
  });

  test('400 when rejecting without rejection_reason', async () => {
    const res = await request(app)
      .patch('/rides/admin/inspections/insp-1/review')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-user-id', 'admin-1')
      .send({ decision: 'rejected' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('rejection_reason');
  });

  test('404 when inspection not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch('/rides/admin/inspections/nonexistent/review')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-user-id', 'admin-1')
      .send({ decision: 'approved' });

    expect(res.status).toBe(404);
  });

  test('409 when inspection is not in submitted state', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'insp-3', status: 'approved' }] });

    const res = await request(app)
      .patch('/rides/admin/inspections/insp-3/review')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-user-id', 'admin-1')
      .send({ decision: 'approved' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('not in submitted state');
  });
});
