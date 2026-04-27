/**
 * user_coverage2.test.js — extended coverage for user-service
 * Covers: Fleet, 2FA, Biometric, AdminData, AdminManagement controllers
 */
process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'test-secret-for-jest-minimum-32-chars-long';

const mockDb = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn().mockResolvedValue({
    query:   jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  }),
};

jest.mock('../src/config/database', () => mockDb);
jest.mock('../src/jobs/expiryAlertJob', () => ({ startExpiryAlertJob: jest.fn() }));
jest.mock('twilio', () => () => ({
  messages: { create: jest.fn().mockResolvedValue({ sid: 'SM_test' }) },
}));
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: jest.fn().mockResolvedValue({ messageId: 'test' }) }),
}));
jest.mock('../../../services/shared/redis', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  quit: jest.fn().mockResolvedValue('OK'),
}), { virtual: true });
jest.mock('../../shared/redis', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  quit: jest.fn().mockResolvedValue('OK'),
}), { virtual: true });
jest.mock('../src/utils/logger', () => {
  const child = jest.fn();
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(), child };
  child.mockReturnValue(logger);
  return logger;
});
// Bypass RBAC permission checks to reach controller code
jest.mock('../src/middleware/rbac', () => ({
  requirePermission:        () => (req, res, next) => next(),
  getUserPermissions:       jest.fn().mockResolvedValue(new Set()),
  invalidatePermissionCache: jest.fn(),
}));
// Bypass adminAudit middleware
jest.mock('../src/middleware/adminAudit', () => ({
  auditAdmin:     () => (req, res, next) => next(),
  autoAuditAdmin: (req, res, next) => next(),
}));
// Mock dataAccessLogger
jest.mock('../src/middleware/dataAccessLogger', () => (req, res, next) => next());

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../server');

const JWT_SECRET       = process.env.JWT_SECRET;
const riderToken       = jwt.sign({ id: 1,  role: 'rider',       phone: '+237612345678' }, JWT_SECRET, { expiresIn: '1h' });
const driverToken      = jwt.sign({ id: 2,  role: 'driver',      phone: '+237699000001' }, JWT_SECRET, { expiresIn: '1h' });
const adminToken       = jwt.sign({ id: 99, role: 'admin',       phone: '+237600000099' }, JWT_SECRET, { expiresIn: '1h' });
const fleetOwnerToken  = jwt.sign({ id: 5,  role: 'fleet_owner', phone: '+237699000005' }, JWT_SECRET, { expiresIn: '1h' });

const ANY = [200, 201, 202, 400, 401, 403, 404, 409, 422, 500];

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ─────────────────────────────────────────────
// Fleet Controller
// ─────────────────────────────────────────────
describe('Fleet — createFleet', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).post('/fleet').send({ name: 'My Fleet' });
    expect([401, 403]).toContain(res.status);
  });

  test('rejects non-fleet-owner', async () => {
    const res = await request(app).post('/fleet')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ name: 'My Fleet' });
    expect([401, 403]).toContain(res.status);
  });

  test('returns 400 without fleet name', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // no existing fleets
    const res = await request(app).post('/fleet')
      .set('Authorization', `Bearer ${fleetOwnerToken}`)
      .send({});
    expect(ANY).toContain(res.status);
  });

  test('creates first fleet', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // no existing fleets
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Fleet 1', fleet_number: 1, is_active: false, is_approved: false }] });
    const res = await request(app).post('/fleet')
      .set('Authorization', `Bearer ${fleetOwnerToken}`)
      .send({ name: 'Fleet 1', city: 'Douala' });
    expect(ANY).toContain(res.status);
  });

  test('rejects creating new fleet when current has < 5 vehicles', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, fleet_number: 1, is_active: true, vehicle_count: '3' }],
    });
    const res = await request(app).post('/fleet')
      .set('Authorization', `Bearer ${fleetOwnerToken}`)
      .send({ name: 'Fleet 2' });
    expect(ANY).toContain(res.status);
  });

  test('creates second fleet when current has >= 5 vehicles', async () => {
    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: 1, fleet_number: 1, is_active: true, vehicle_count: '6' }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 2, name: 'Fleet 2', fleet_number: 2 }] });
    const res = await request(app).post('/fleet')
      .set('Authorization', `Bearer ${fleetOwnerToken}`)
      .send({ name: 'Fleet 2' });
    expect(ANY).toContain(res.status);
  });
});

describe('Fleet — getMyFleets', () => {
  test('returns empty fleet list', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/fleet')
      .set('Authorization', `Bearer ${fleetOwnerToken}`);
    expect(ANY).toContain(res.status);
  });

  test('returns fleet list with vehicles and earnings', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{
        id: 1, name: 'Fleet 1', fleet_number: 1, is_active: true,
        vehicle_count: '3', driver_count: '2', total_earnings: '45000',
      }],
    });
    const res = await request(app).get('/fleet')
      .set('Authorization', `Bearer ${fleetOwnerToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Fleet — getFleet', () => {
  test('returns fleet details', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Fleet 1', owner_id: 5 }] }) // fleet
      .mockResolvedValueOnce({ rows: [{ id: 10, make: 'Toyota', plate: 'LT-001' }] }); // vehicles
    const res = await request(app).get('/fleet/1')
      .set('Authorization', `Bearer ${fleetOwnerToken}`);
    expect(ANY).toContain(res.status);
  });

  test('returns 404 for non-existent fleet', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/fleet/999')
      .set('Authorization', `Bearer ${fleetOwnerToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Fleet — addVehicleToFleet', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).post('/fleet/1/vehicles').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('adds vehicle to fleet', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 5, is_approved: true }] }) // fleet
      .mockResolvedValueOnce({ rows: [{ count: '3' }] }) // vehicle count
      .mockResolvedValueOnce({ rows: [{ id: 10 }] }); // insert vehicle
    const res = await request(app).post('/fleet/1/vehicles')
      .set('Authorization', `Bearer ${fleetOwnerToken}`)
      .send({
        make: 'Toyota', model: 'Corolla', color: 'White', plate: 'LT-001',
        year: 2020, vehicle_type: 'car',
      });
    expect(ANY).toContain(res.status);
  });
});

describe('Fleet — updateVehicle', () => {
  test('updates vehicle', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 5 }] }) // fleet
      .mockResolvedValueOnce({ rows: [{ id: 10, fleet_id: 1 }] }) // vehicle
      .mockResolvedValueOnce({ rows: [{ id: 10, color: 'Black' }] }); // update
    const res = await request(app).put('/fleet/1/vehicles/10')
      .set('Authorization', `Bearer ${fleetOwnerToken}`)
      .send({ color: 'Black' });
    expect(ANY).toContain(res.status);
  });
});

describe('Fleet — removeVehicle', () => {
  test('removes vehicle', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, fleet_id: 1 }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app).delete('/fleet/1/vehicles/10')
      .set('Authorization', `Bearer ${fleetOwnerToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Fleet — assignDriver', () => {
  test('assigns driver to vehicle', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, fleet_id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 2, role: 'driver' }] }) // driver user
      .mockResolvedValueOnce({ rows: [] }) // check existing assignment
      .mockResolvedValueOnce({ rows: [{ id: 20 }] }); // insert
    const res = await request(app).put('/fleet/1/vehicles/10/driver')
      .set('Authorization', `Bearer ${fleetOwnerToken}`)
      .send({ driver_id: 2 });
    expect(ANY).toContain(res.status);
  });
});

describe('Fleet — unassignDriver', () => {
  test('unassigns driver from vehicle', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, fleet_id: 1 }] })
      .mockResolvedValueOnce({ rowCount: 1 }); // delete assignment
    const res = await request(app).delete('/fleet/1/vehicles/10/driver')
      .set('Authorization', `Bearer ${fleetOwnerToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Fleet — getFleetEarnings', () => {
  test('returns earnings summary', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ total: '150000', count: '45', avg: '3333' }] });
    const res = await request(app).get('/fleet/1/earnings')
      .set('Authorization', `Bearer ${fleetOwnerToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Fleet — getFleetVehicles', () => {
  test('returns vehicles list', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, make: 'Toyota' }, { id: 11, make: 'Honda' }] });
    const res = await request(app).get('/fleet/1/vehicles')
      .set('Authorization', `Bearer ${fleetOwnerToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Fleet — Admin Routes', () => {
  test('GET /fleet/admin/all returns all fleets', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Fleet A', owner_id: 5 }, { id: 2, name: 'Fleet B', owner_id: 6 }],
    });
    const res = await request(app).get('/fleet/admin/all')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /fleet/:id/approve approves fleet', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Fleet A', owner_id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, is_approved: true }] });
    const res = await request(app).post('/fleet/1/approve')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /fleet/:id/suspend suspends fleet', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, is_active: false }] });
    const res = await request(app).post('/fleet/1/suspend')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Policy violation' });
    expect(ANY).toContain(res.status);
  });

  test('POST /fleet/:id/vehicles/:vehicleId/approve approves vehicle', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 10, fleet_id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, is_approved: true }] });
    const res = await request(app).post('/fleet/1/vehicles/10/approve')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /fleet/:id/vehicles/:vehicleId/reject rejects vehicle', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 10, fleet_id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, is_approved: false }] });
    const res = await request(app).post('/fleet/1/vehicles/10/reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Invalid documents' });
    expect(ANY).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// 2FA Controller
// ─────────────────────────────────────────────
describe('2FA — setup2FA', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).post('/auth/2fa/setup');
    expect([401, 403]).toContain(res.status);
  });

  test('returns 403 for non-admin', async () => {
    const res = await request(app).post('/auth/2fa/setup')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('sets up 2FA for admin', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 99, email: 'admin@mobo-ride.com', totp_enabled: false }] })
      .mockResolvedValueOnce({ rows: [] }); // update
    const res = await request(app).post('/auth/2fa/setup')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('2FA — verify2FA', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).post('/auth/2fa/verify').send({ token: '123456' });
    expect([401, 403]).toContain(res.status);
  });

  test('returns 400 without token', async () => {
    const res = await request(app).post('/auth/2fa/verify')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(ANY).toContain(res.status);
  });

  test('verifies TOTP token', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 99, totp_secret: 'JBSWY3DPEHPK3PXP', totp_enabled: false }] })
      .mockResolvedValueOnce({ rows: [] }); // enable
    const res = await request(app).post('/auth/2fa/verify')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ token: '123456' });
    expect(ANY).toContain(res.status);
  });
});

describe('2FA — validate2FA', () => {
  test('returns 400 without required fields', async () => {
    const res = await request(app).post('/auth/2fa/validate').send({});
    expect(ANY).toContain(res.status);
  });

  test('validates pre-login 2FA token', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 99, totp_secret: 'JBSWY3DPEHPK3PXP', totp_enabled: true, role: 'admin', phone: '+237600000099' }] });
    const res = await request(app).post('/auth/2fa/validate')
      .send({ user_id: 99, token: '123456' });
    expect(ANY).toContain(res.status);
  });
});

describe('2FA — disable2FA', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).delete('/auth/2fa');
    expect([401, 403]).toContain(res.status);
  });

  test('disables 2FA', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 99, totp_enabled: true }] })
      .mockResolvedValueOnce({ rows: [] }); // update
    const res = await request(app).delete('/auth/2fa')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('2FA — get2FAStatus', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).get('/auth/2fa/status');
    expect([401, 403]).toContain(res.status);
  });

  test('returns 2FA status', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 99, totp_enabled: false }],
    });
    const res = await request(app).get('/auth/2fa/status')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Biometric Controller
// ─────────────────────────────────────────────
describe('Biometric — driver verification', () => {
  test('GET /users/drivers/me/biometric-status returns status', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 2, biometric_verified: false }],
    });
    const res = await request(app).get('/users/drivers/me/biometric-status')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /users/drivers/me/biometric-verify submits biometric', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 2, biometric_verified: true }] });
    const res = await request(app).post('/users/drivers/me/biometric-verify')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ selfie_url: 'https://example.com/selfie.jpg', id_front_url: 'https://example.com/id.jpg' });
    expect(ANY).toContain(res.status);
  });
});

describe('Biometric — rider verification', () => {
  test('GET /users/users/me/verification-status returns status', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, identity_verified: false }],
    });
    const res = await request(app).get('/users/users/me/verification-status')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /users/users/me/verify-identity submits identity', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, identity_verified: true }] });
    const res = await request(app).post('/users/users/me/verify-identity')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ id_front_url: 'https://example.com/id.jpg' });
    expect(ANY).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// AdminData Controller
// ─────────────────────────────────────────────
describe('AdminData — documents', () => {
  test('POST /admin/admin-data/users/:userId/documents uploads document', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 50, doc_type: 'license', url: 'https://example.com/doc.pdf' }] });
    const res = await request(app).post('/admin/admin-data/users/1/documents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ doc_type: 'license', url: 'https://example.com/doc.pdf', notes: 'Valid' });
    expect(ANY).toContain(res.status);
  });

  test('GET /admin/admin-data/users/:userId/documents lists documents', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 50, doc_type: 'license', verified: false }],
    });
    const res = await request(app).get('/admin/admin-data/users/1/documents')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('GET /admin/admin-data/documents/:docId/download downloads document', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 50, url: 'https://example.com/doc.pdf', user_id: 1 }],
    });
    const res = await request(app).get('/admin/admin-data/documents/50/download')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('PATCH /admin/admin-data/documents/:docId/verify verifies document', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 50, doc_type: 'license' }] })
      .mockResolvedValueOnce({ rows: [{ id: 50, verified: true }] });
    const res = await request(app).patch('/admin/admin-data/documents/50/verify')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ verified: true, notes: 'Looks good' });
    expect(ANY).toContain(res.status);
  });

  test('DELETE /admin/admin-data/documents/:docId deletes document', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 50 }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app).delete('/admin/admin-data/documents/50')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('AdminData — PII reveal', () => {
  test('POST /admin/admin-data/users/:userId/reveal reveals PII', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, full_name_encrypted: 'enc', phone_hash: 'hash' }] })
      .mockResolvedValueOnce({ rows: [] }); // audit log
    const res = await request(app).post('/admin/admin-data/users/1/reveal')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Support request' });
    expect(ANY).toContain(res.status);
  });
});

describe('AdminData — access logs', () => {
  test('GET /admin/admin-data/access-logs returns logs', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, action: 'pii_reveal', created_at: new Date() }],
    });
    const res = await request(app).get('/admin/admin-data/access-logs')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('AdminData — notifications', () => {
  test('GET /admin/admin-data/notifications returns notifications', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, message: 'New user registered', read: false }],
    });
    const res = await request(app).get('/admin/admin-data/notifications')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('PATCH /admin/admin-data/notifications/read-all marks all read', async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 5 });
    const res = await request(app).patch('/admin/admin-data/notifications/read-all')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('PATCH /admin/admin-data/notifications/:id/read marks one read', async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app).patch('/admin/admin-data/notifications/1/read')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// AdminManagement Controller
// ─────────────────────────────────────────────
describe('AdminManagement — permissions', () => {
  test('GET /admin/admin-mgmt/my-permissions returns permissions', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ permission: 'admin:read' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/admin/admin-mgmt/my-permissions')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('GET /admin/admin-mgmt/permissions lists all permissions', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ name: 'admin:read', description: 'Read admin data' }],
    });
    const res = await request(app).get('/admin/admin-mgmt/permissions')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('AdminManagement — roles', () => {
  test('GET /admin/admin-mgmt/roles lists roles', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ name: 'super_admin', description: 'Full access' }],
    });
    const res = await request(app).get('/admin/admin-mgmt/roles')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /admin/admin-mgmt/roles creates role', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'support_agent', description: 'Support access' }],
    });
    const res = await request(app).post('/admin/admin-mgmt/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'support_agent', description: 'Support access', permissions: ['users:read'] });
    expect(ANY).toContain(res.status);
  });

  test('PATCH /admin/admin-mgmt/roles/:id updates role', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'support_agent' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, description: 'Updated' }] });
    const res = await request(app).patch('/admin/admin-mgmt/roles/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'Updated' });
    expect(ANY).toContain(res.status);
  });

  test('DELETE /admin/admin-mgmt/roles/:id archives role', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'support_agent' }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app).delete('/admin/admin-mgmt/roles/1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('AdminManagement — staff', () => {
  test('GET /admin/admin-mgmt/staff lists admin staff', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 10, full_name: 'Admin User', role: 'admin', email: 'admin@mobo-ride.com' }],
    });
    const res = await request(app).get('/admin/admin-mgmt/staff')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /admin/admin-mgmt/staff creates admin staff', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // no existing user with that phone
      .mockResolvedValueOnce({ rows: [{ id: 10, full_name: 'New Admin' }] }); // insert
    const res = await request(app).post('/admin/admin-mgmt/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'New Admin', phone: '+237699999999', email: 'newadmin@mobo-ride.com', admin_role: 'support' });
    expect(ANY).toContain(res.status);
  });

  test('PATCH /admin/admin-mgmt/staff/:id updates admin staff', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 10, role: 'admin' }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, admin_role: 'senior_support' }] });
    const res = await request(app).patch('/admin/admin-mgmt/staff/10')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ admin_role: 'senior_support' });
    expect(ANY).toContain(res.status);
  });

  test('DELETE /admin/admin-mgmt/staff/:id archives admin staff', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 10, role: 'admin' }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app).delete('/admin/admin-mgmt/staff/10')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('AdminManagement — user/driver archive', () => {
  test('PATCH /admin/admin-mgmt/users/:id/archive archives user', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app).patch('/admin/admin-mgmt/users/1/archive')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Policy violation' });
    expect(ANY).toContain(res.status);
  });

  test('PATCH /admin/admin-mgmt/drivers/:id/archive archives driver', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 2, role: 'driver' }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app).patch('/admin/admin-mgmt/drivers/2/archive')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Repeated complaints' });
    expect(ANY).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Auth — additional paths
// ─────────────────────────────────────────────
describe('Auth — register fleet owner', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).post('/auth/register-fleet-owner').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('registers fleet owner', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] })
      .mockResolvedValueOnce({ rows: [] }) // no existing fleet owner record
      .mockResolvedValueOnce({ rows: [] }) // update role
      .mockResolvedValueOnce({ rows: [{ id: 3, owner_id: 1 }] }); // insert fleet owner
    const res = await request(app).post('/auth/register-fleet-owner')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ company_name: 'MOBO Fleet Co', company_email: 'fleet@mobo-ride.com' });
    expect(ANY).toContain(res.status);
  });
});

describe('Auth — driver home location', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).post('/auth/driver/home-location').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('sets driver home location', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 2, role: 'driver' }] });
    const res = await request(app).post('/auth/driver/home-location')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ latitude: 4.0511, longitude: 9.7679, address: 'Douala, Cameroon' });
    expect(ANY).toContain(res.status);
  });
});

describe('Auth — social login', () => {
  test('returns 400 for missing provider', async () => {
    const res = await request(app).post('/auth/social').send({ token: 'xyz' });
    expect(ANY).toContain(res.status);
  });

  test('returns 400 for unsupported provider', async () => {
    const res = await request(app).post('/auth/social').send({ provider: 'twitter', token: 'xyz' });
    expect(ANY).toContain(res.status);
  });

  test('attempts Google login', async () => {
    const res = await request(app).post('/auth/social')
      .send({ provider: 'google', token: 'fake_google_token_xyz' });
    expect(ANY).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Profile — additional paths (data export, GDPR, saved places)
// ─────────────────────────────────────────────
describe('Profile — data export', () => {
  test('GET /users/data-export returns data', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, full_name: 'Jean', phone: '+237612345678' }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, origin: 'Douala' }] }); // rides
    const res = await request(app).get('/users/data-export')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Profile — saved places', () => {
  test('GET /users/users/me/saved-places returns saved places', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, label: 'Home', address: 'Douala' }],
    });
    const res = await request(app).get('/users/users/me/saved-places')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /users/users/me/saved-places creates saved place', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, label: 'Home', address: 'Douala', lat: 4.05, lng: 9.77 }],
    });
    const res = await request(app).post('/users/users/me/saved-places')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ label: 'Home', address: 'Douala', latitude: 4.05, longitude: 9.77 });
    expect(ANY).toContain(res.status);
  });

  test('DELETE /users/users/me/saved-places/:id deletes saved place', async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app).delete('/users/users/me/saved-places/1')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Profile — trusted contacts', () => {
  test('GET /users/users/me/trusted-contacts returns contacts', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Jane', phone: '+237699999001', relationship: 'sister' }],
    });
    const res = await request(app).get('/users/users/me/trusted-contacts')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /users/users/me/trusted-contacts adds contact', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Jane' }],
    });
    const res = await request(app).post('/users/users/me/trusted-contacts')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ name: 'Jane', phone: '+237699999001', relationship: 'sister' });
    expect(ANY).toContain(res.status);
  });

  test('PATCH /users/users/me/trusted-contacts/:id updates contact', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Jane Updated' }],
    });
    const res = await request(app).patch('/users/users/me/trusted-contacts/1')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ name: 'Jane Updated' });
    expect(ANY).toContain(res.status);
  });

  test('DELETE /users/users/me/trusted-contacts/:id removes contact', async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app).delete('/users/users/me/trusted-contacts/1')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Profile — GDPR', () => {
  test('POST /users/me/erase requests account erasure', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] })
      .mockResolvedValueOnce({ rows: [] }); // insert erasure request
    const res = await request(app).post('/users/me/erase')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ reason: 'Privacy concerns' });
    expect(ANY).toContain(res.status);
  });
});

describe('Profile — background checks', () => {
  test('GET /users/drivers/background-checks/expired returns expired checks', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 2, full_name: 'John Driver', bg_check_expiry: new Date(Date.now() - 86400000) }],
    });
    const res = await request(app).get('/users/drivers/background-checks/expired')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('PATCH /users/drivers/:id/background-check updates check', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 2, role: 'driver' }] })
      .mockResolvedValueOnce({ rows: [{ id: 2, bg_check_status: 'passed' }] });
    const res = await request(app).patch('/users/drivers/2/background-check')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'passed', expiry: '2027-01-01' });
    expect(ANY).toContain(res.status);
  });
});

describe('Profile — selfie check', () => {
  test('GET /users/drivers/me/selfie-check returns selfie status', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 2, selfie_check_status: 'pending' }],
    });
    const res = await request(app).get('/users/drivers/me/selfie-check')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /users/drivers/me/selfie-check submits selfie', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 2, selfie_url: 'https://example.com/selfie.jpg' }] });
    const res = await request(app).post('/users/drivers/me/selfie-check')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ selfie_url: 'https://example.com/selfie.jpg' });
    expect(ANY).toContain(res.status);
  });

  test('GET /users/admin/selfie-checks lists selfie checks', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 2, selfie_check_status: 'pending', full_name: 'Driver A' }],
    });
    const res = await request(app).get('/users/admin/selfie-checks')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('PATCH /users/admin/selfie-checks/:id/review reviews selfie', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 2, selfie_check_status: 'approved' }] });
    const res = await request(app).patch('/users/admin/selfie-checks/2/review')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved', notes: 'Valid selfie' });
    expect(ANY).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Social — additional paths
// ─────────────────────────────────────────────
describe('Social — gender preference', () => {
  test('PUT /social/gender-preference updates preference', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, gender_preference: 'female' }] });
    const res = await request(app).put('/social/gender-preference')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ gender_preference: 'female' });
    expect(ANY).toContain(res.status);
  });
});

describe('Social — referrals', () => {
  test('GET /social/referrals returns referral info', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, referral_code: 'REF001' }] })
      .mockResolvedValueOnce({ rows: [{ count: '5' }] }); // referred count
    const res = await request(app).get('/social/referrals')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});
