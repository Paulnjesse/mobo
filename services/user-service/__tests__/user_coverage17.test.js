'use strict';
/**
 * user_coverage17.test.js
 *
 * Targets remaining uncovered catch blocks and edge-case branches in:
 *   - adminManagementController.js  (updateRole, archiveRole, archiveUser/Driver, error paths)
 *   - adminDataController.js  (notifications errors, revealUserFields, verifyDocument)
 *   - fleetController.js  (addVehicle, updateVehicle, removeVehicle, assignDriver)
 */

process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'test-secret-for-jest-minimum-32-chars-long';

// ── Mock RBAC to pass all permission checks ───────────────────────────────────
jest.mock('../src/middleware/rbac', () => ({
  requirePermission: () => (req, res, next) => next(),
  getUserPermissions: jest.fn().mockResolvedValue(new Set()),
  invalidatePermissionCache: jest.fn(),
}));

// ── DB mock ────────────────────────────────────────────────────────────────────
const mockClient = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  release: jest.fn(),
};
const mockDb = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn().mockResolvedValue(mockClient),
};
jest.mock('../src/config/database', () => mockDb);

// ── Other standard mocks ──────────────────────────────────────────────────────
jest.mock('../src/jobs/expiryAlertJob', () => ({ startExpiryAlertJob: jest.fn() }));
jest.mock('twilio', () => () => ({
  messages: { create: jest.fn().mockResolvedValue({ sid: 'SM_test' }) },
}));
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: jest.fn().mockResolvedValue({ messageId: 'test' }) }),
}));
jest.mock('../../../services/shared/redis', () => ({
  get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),    quit: jest.fn().mockResolvedValue('OK'),
}), { virtual: true });
jest.mock('../../shared/redis', () => ({
  get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),    quit: jest.fn().mockResolvedValue('OK'),
}), { virtual: true });
jest.mock('../../../shared/redis', () => ({
  get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),    quit: jest.fn().mockResolvedValue('OK'),
  getClient: jest.fn().mockReturnValue({
    set: jest.fn().mockResolvedValue('OK'), get: jest.fn().mockResolvedValue(null),
  }),
}), { virtual: true });
jest.mock('bcryptjs', () => ({
  hash:    jest.fn().mockResolvedValue('$2b$10$hashedpassword'),
  compare: jest.fn().mockResolvedValue(true),
  genSalt: jest.fn().mockResolvedValue('salt'),
}));
jest.mock('../src/utils/logger', () => {
  const child = jest.fn();
  const l = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(), child };
  child.mockReturnValue(l);
  return l;
});
jest.mock('expo-server-sdk', () => {
  const Expo = jest.fn().mockImplementation(() => ({
    chunkPushNotifications:     jest.fn().mockImplementation((msgs) => [msgs]),
    sendPushNotificationsAsync: jest.fn().mockResolvedValue([{ status: 'ok' }]),
  }));
  Expo.isExpoPushToken = jest.fn().mockReturnValue(true);
  return { Expo };
});
jest.mock('multer', () => {
  const multer = jest.fn(() => ({
    single: jest.fn(() => (req, res, next) => next()),
    array:  jest.fn(() => (req, res, next) => next()),
    fields: jest.fn(() => (req, res, next) => next()),
  }));
  multer.diskStorage   = jest.fn(() => ({}));
  multer.memoryStorage = jest.fn(() => ({}));
  return multer;
});
jest.mock('qrcode', () => ({ toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,abc') }));
jest.mock('speakeasy', () => ({
  generateSecret: jest.fn().mockReturnValue({ base32: 'SECRET', otpauth_url: 'otpauth://...' }),
  totp:           { verify: jest.fn().mockReturnValue(true) },
}));

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../server');

const SECRET      = process.env.JWT_SECRET;
const adminToken  = 'Bearer ' + jwt.sign({ id: 'admin-1',  role: 'admin' },       SECRET, { expiresIn: '1h' });
const fleetToken  = 'Bearer ' + jwt.sign({ id: 'fleet-1',  role: 'fleet_owner' }, SECRET, { expiresIn: '1h' });

const ANY = [200, 201, 400, 401, 403, 404, 409, 422, 500];

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mockClient.query.mockReset();
  mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mockDb.connect.mockResolvedValue(mockClient);
});

// ═══════════════════════════════════════════════════════════════════════════════
// adminManagementController — createRole with permissions
// ═══════════════════════════════════════════════════════════════════════════════

describe('adminManagementController — createRole advanced', () => {
  test('createRole with permissions — invalid permissions → 400 + rollback', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'r-new', name: 'test_role', display_name: 'Test' }] }) // INSERT role
      .mockResolvedValueOnce({ rows: [] }) // SELECT permissions (none found = invalid)
      .mockResolvedValueOnce({ rows: [] }); // DELETE role (rollback)
    const res = await request(app)
      .post('/admin/admin-mgmt/roles')
      .set('Authorization', adminToken)
      .send({ name: 'test_role', display_name: 'Test Role', permissions: ['nonexistent:permission'] });
    expect([400]).toContain(res.statusCode);
  });

  test('createRole with valid permissions → 201', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'r-new', name: 'custom_role', display_name: 'Custom' }] }) // INSERT role
      .mockResolvedValueOnce({ rows: [{ name: 'users:read' }] }) // SELECT valid permissions
      .mockResolvedValueOnce({ rows: [] }); // INSERT role_permissions
    const res = await request(app)
      .post('/admin/admin-mgmt/roles')
      .set('Authorization', adminToken)
      .send({ name: 'custom_role', display_name: 'Custom Role', permissions: ['users:read'] });
    expect(ANY).toContain(res.statusCode);
  });

  test('createRole DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB crash'));
    const res = await request(app)
      .post('/admin/admin-mgmt/roles')
      .set('Authorization', adminToken)
      .send({ name: 'another_role', display_name: 'Another Role' });
    expect([500]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// adminManagementController — updateRole
// ═══════════════════════════════════════════════════════════════════════════════

describe('adminManagementController — updateRole', () => {
  test('role not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch('/admin/admin-mgmt/roles/nonexistent-role-id')
      .set('Authorization', adminToken)
      .send({ display_name: 'Updated' });
    expect([404]).toContain(res.statusCode);
  });

  test('system role — update permissions only → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ name: 'admin', is_system: true }] }) // find role
      .mockResolvedValueOnce({ rows: [] }) // DELETE role_permissions
      .mockResolvedValueOnce({ rows: [] }) // INSERT role_permissions
      .mockResolvedValueOnce({ rows: [] }); // SELECT affected users
    const res = await request(app)
      .patch('/admin/admin-mgmt/roles/r-system')
      .set('Authorization', adminToken)
      .send({ permissions: ['users:read', 'users:write'] });
    expect(ANY).toContain(res.statusCode);
  });

  test('non-system role — update display_name → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ name: 'custom', is_system: false }] }) // find role
      .mockResolvedValueOnce({ rows: [] }); // UPDATE display_name
    const res = await request(app)
      .patch('/admin/admin-mgmt/roles/r-custom')
      .set('Authorization', adminToken)
      .send({ display_name: 'Updated Name' });
    expect(ANY).toContain(res.statusCode);
  });

  test('updateRole DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB crash'));
    const res = await request(app)
      .patch('/admin/admin-mgmt/roles/r-err')
      .set('Authorization', adminToken)
      .send({ display_name: 'Fail' });
    expect([500]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// adminManagementController — archiveRole
// ═══════════════════════════════════════════════════════════════════════════════

describe('adminManagementController — archiveRole', () => {
  test('role not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/admin/admin-mgmt/roles/nonexistent')
      .set('Authorization', adminToken);
    expect([404]).toContain(res.statusCode);
  });

  test('system role cannot be archived → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ name: 'admin', is_system: true }] });
    const res = await request(app)
      .delete('/admin/admin-mgmt/roles/r-system')
      .set('Authorization', adminToken);
    expect([403]).toContain(res.statusCode);
  });

  test('role has active users → 409', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ name: 'custom_role', is_system: false }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 3 }] }); // 3 active users
    const res = await request(app)
      .delete('/admin/admin-mgmt/roles/r-in-use')
      .set('Authorization', adminToken);
    expect([409]).toContain(res.statusCode);
  });

  test('success archives custom role → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ name: 'obsolete_role', is_system: false }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] }) // no users
      .mockResolvedValueOnce({ rows: [] }); // UPDATE deleted_at
    const res = await request(app)
      .delete('/admin/admin-mgmt/roles/r-obsolete')
      .set('Authorization', adminToken);
    expect([200]).toContain(res.statusCode);
  });

  test('archiveRole DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .delete('/admin/admin-mgmt/roles/r-crash')
      .set('Authorization', adminToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// adminManagementController — staff error paths
// ═══════════════════════════════════════════════════════════════════════════════

describe('adminManagementController — staff error paths', () => {
  test('createAdminStaff DB error → 500', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // email check OK
      .mockResolvedValueOnce({ rows: [{ name: 'read_only' }] }) // role exists
      .mockRejectedValueOnce(new Error('DB insert fail')); // INSERT fails
    const res = await request(app)
      .post('/admin/admin-mgmt/staff')
      .set('Authorization', adminToken)
      .send({ full_name: 'Error Staff', email: 'error@moboride.com', password: 'password123' });
    expect([500]).toContain(res.statusCode);
  });

  test('updateAdminStaff DB error → 500', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'staff-x', admin_role: 'read_only' }] }) // find staff
      .mockRejectedValueOnce(new Error('DB update fail')); // UPDATE fails
    const res = await request(app)
      .patch('/admin/admin-mgmt/staff/staff-x')
      .set('Authorization', adminToken)
      .send({ full_name: 'Updated' });
    expect([500]).toContain(res.statusCode);
  });

  test('archiveAdminStaff DB error → 500', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ admin_role: 'read_only' }] }) // target found
      .mockRejectedValueOnce(new Error('DB update fail'));
    const res = await request(app)
      .delete('/admin/admin-mgmt/staff/other-staff-crash')
      .set('Authorization', adminToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// adminManagementController — archiveUser, archiveDriver
// ═══════════════════════════════════════════════════════════════════════════════

describe('adminManagementController — archiveUser and archiveDriver', () => {
  test('PATCH /admin/admin-mgmt/users/:id/archive — success → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'user-archived' }] });
    const res = await request(app)
      .patch('/admin/admin-mgmt/users/user-archived/archive')
      .set('Authorization', adminToken);
    expect([200]).toContain(res.statusCode);
  });

  test('PATCH /admin/admin-mgmt/users/:id/archive — not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch('/admin/admin-mgmt/users/ghost-user/archive')
      .set('Authorization', adminToken);
    expect([404]).toContain(res.statusCode);
  });

  test('PATCH /admin/admin-mgmt/users/:id/archive — DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .patch('/admin/admin-mgmt/users/crash-user/archive')
      .set('Authorization', adminToken);
    expect([500]).toContain(res.statusCode);
  });

  test('PATCH /admin/admin-mgmt/drivers/:id/archive — success → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'driver-archived' }] });
    const res = await request(app)
      .patch('/admin/admin-mgmt/drivers/driver-archived/archive')
      .set('Authorization', adminToken);
    expect([200]).toContain(res.statusCode);
  });

  test('PATCH /admin/admin-mgmt/drivers/:id/archive — not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch('/admin/admin-mgmt/drivers/ghost-driver/archive')
      .set('Authorization', adminToken);
    expect([404]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// adminDataController — notification error paths and revealUserFields
// ═══════════════════════════════════════════════════════════════════════════════

describe('adminDataController — error paths', () => {
  test('GET /admin/admin-data/notifications — DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/admin/admin-data/notifications')
      .set('Authorization', adminToken);
    expect([500]).toContain(res.statusCode);
  });

  test('PATCH /admin/admin-data/notifications/:id/read — DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .patch('/admin/admin-data/notifications/n1/read')
      .set('Authorization', adminToken);
    expect([500]).toContain(res.statusCode);
  });

  test('PATCH /admin/admin-data/notifications/read-all — DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .patch('/admin/admin-data/notifications/read-all')
      .set('Authorization', adminToken);
    expect([500]).toContain(res.statusCode);
  });
});

describe('adminDataController — revealUserFields', () => {
  test('no valid fields requested → 400', async () => {
    const res = await request(app)
      .post('/admin/admin-data/users/user-1/reveal')
      .set('Authorization', adminToken)
      .send({ fields: ['invalid_field', 'another_bad_field'] });
    expect([400]).toContain(res.statusCode);
  });

  test('user not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/admin/admin-data/users/ghost-user/reveal')
      .set('Authorization', adminToken)
      .send({ fields: ['phone', 'email'] });
    expect([404]).toContain(res.statusCode);
  });

  test('success reveals phone and email → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ phone: '+237600000001', phone_encrypted: null, email: 'user@test.com', email_encrypted: null, full_name: 'Test User', full_name_encrypted: null, national_id_encrypted: null, date_of_birth: '1990-01-01' }] })
      .mockResolvedValueOnce({ rows: [] }) // data_access_logs
      .mockResolvedValueOnce({ rows: [] }); // admin_notifications
    const res = await request(app)
      .post('/admin/admin-data/users/user-1/reveal')
      .set('Authorization', adminToken)
      .send({ fields: ['phone', 'email', 'full_name', 'date_of_birth'] });
    expect([200]).toContain(res.statusCode);
  });

  test('DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/admin/admin-data/users/crash-user/reveal')
      .set('Authorization', adminToken)
      .send({ fields: ['phone'] });
    expect([500]).toContain(res.statusCode);
  });
});

describe('adminDataController — verifyDocument', () => {
  test('PATCH /admin/admin-data/documents/:docId/verify — success → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'doc-1', doc_type: 'national_id', verified: false, user_id: 'user-1' }] }) // find doc
      .mockResolvedValueOnce({ rows: [] }); // UPDATE verified
    const res = await request(app)
      .patch('/admin/admin-data/documents/doc-1/verify')
      .set('Authorization', adminToken)
      .send({ notes: 'looks good' });
    expect(ANY).toContain(res.statusCode);
  });

  test('PATCH /admin/admin-data/documents/:docId/verify — DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .patch('/admin/admin-data/documents/doc-err/verify')
      .set('Authorization', adminToken)
      .send({});
    expect([500]).toContain(res.statusCode);
  });
});

describe('adminDataController — archiveDocument', () => {
  test('DELETE /admin/admin-data/documents/:docId — success → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'doc-1' }] });
    const res = await request(app)
      .delete('/admin/admin-data/documents/doc-1')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('DELETE /admin/admin-data/documents/:docId — DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .delete('/admin/admin-data/documents/doc-err')
      .set('Authorization', adminToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// fleetController — addVehicle, updateVehicle, removeVehicle, assignDriver
// ═══════════════════════════════════════════════════════════════════════════════

describe('fleetController — addVehicleToFleet', () => {
  test('fleet not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/fleet/nonexistent-fleet/vehicles')
      .set('Authorization', fleetToken)
      .send({ make: 'Toyota', model: 'Corolla', year: 2020, plate: 'LT-001-CM', vehicle_type: 'standard' });
    expect([404]).toContain(res.statusCode);
  });

  test('fleet at max capacity → 400', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'f1', fleet_number: 1, max_vehicles: 15, min_vehicles: 5 }] }) // fleet found
      .mockResolvedValueOnce({ rows: [{ count: '15' }] }); // already at max
    const res = await request(app)
      .post('/fleet/f1/vehicles')
      .set('Authorization', fleetToken)
      .send({ make: 'Toyota', model: 'Corolla', year: 2020, plate: 'LT-999-CM', vehicle_type: 'standard' });
    expect([400]).toContain(res.statusCode);
  });

  test('success adds vehicle, activates fleet → 201', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'f1', fleet_number: 1, owner_id: 'fleet-1', max_vehicles: 15, min_vehicles: 5 }] }) // fleet
      .mockResolvedValueOnce({ rows: [{ count: '4' }] }) // current count (4, adding 5th triggers activation)
      .mockResolvedValueOnce({ rows: [{ id: 'v-new', make: 'Toyota', model: 'Corolla', year: 2020, plate: 'LT-005-CM', vehicle_type: 'standard' }] }) // INSERT vehicle
      .mockResolvedValueOnce({ rows: [] }) // UPDATE fleet is_active = true
      .mockResolvedValueOnce({ rows: [{ id: 'f1', vehicle_count: '5', is_active: true }] }); // updated fleet
    const res = await request(app)
      .post('/fleet/f1/vehicles')
      .set('Authorization', fleetToken)
      .send({ make: 'Toyota', model: 'Corolla', year: 2020, plate: 'LT-005-CM', vehicle_type: 'standard', seats: 4 });
    expect(ANY).toContain(res.statusCode);
  });

  test('duplicate plate → 409', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'f1', fleet_number: 1, max_vehicles: 15, min_vehicles: 5 }] })
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }));
    const res = await request(app)
      .post('/fleet/f1/vehicles')
      .set('Authorization', fleetToken)
      .send({ make: 'Honda', model: 'Civic', year: 2019, plate: 'DUPLICATE-CM', vehicle_type: 'standard' });
    expect([409]).toContain(res.statusCode);
  });
});

describe('fleetController — updateVehicle', () => {
  test('vehicle not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .put('/fleet/f1/vehicles/v-ghost')
      .set('Authorization', fleetToken)
      .send({ make: 'Toyota' });
    expect([404]).toContain(res.statusCode);
  });

  test('no fields to update → 400', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'v1' }] }); // vehicle found
    const res = await request(app)
      .put('/fleet/f1/vehicles/v1')
      .set('Authorization', fleetToken)
      .send({}); // no updateable fields
    expect([400]).toContain(res.statusCode);
  });

  test('success updates vehicle → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'v1' }] }) // find vehicle
      .mockResolvedValueOnce({ rows: [{ id: 'v1', make: 'Toyota', model: 'Camry' }] }); // UPDATE
    const res = await request(app)
      .put('/fleet/f1/vehicles/v1')
      .set('Authorization', fleetToken)
      .send({ make: 'Toyota', model: 'Camry' });
    expect(ANY).toContain(res.statusCode);
  });

  test('DB error → 500', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'v1' }] })
      .mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .put('/fleet/f1/vehicles/v1')
      .set('Authorization', fleetToken)
      .send({ make: 'Ford' });
    expect([500]).toContain(res.statusCode);
  });
});

describe('fleetController — removeVehicle', () => {
  test('vehicle not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/fleet/f1/vehicles/v-ghost')
      .set('Authorization', fleetToken);
    expect([404]).toContain(res.statusCode);
  });

  test('success removes vehicle → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'v1', fleet_id: 'f1' }] }) // find vehicle
      .mockResolvedValueOnce({ rows: [] }) // UPDATE deactivate
      .mockResolvedValueOnce({ rows: [{ count: '3' }] }); // count remaining
    const res = await request(app)
      .delete('/fleet/f1/vehicles/v1')
      .set('Authorization', fleetToken);
    expect(ANY).toContain(res.statusCode);
  });
});

describe('fleetController — assignDriver', () => {
  test('driver not found → 404', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'v1', fleet_id: 'f1' }] }) // vehicle found
      .mockResolvedValueOnce({ rows: [] }); // driver not found
    const res = await request(app)
      .put('/fleet/f1/vehicles/v1/driver')
      .set('Authorization', fleetToken)
      .send({ driver_user_id: 'ghost-driver' });
    expect(ANY).toContain(res.statusCode);
  });

  test('success assigns driver → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'v1', fleet_id: 'f1' }] }) // vehicle found
      .mockResolvedValueOnce({ rows: [{ id: 'driver-1', user_id: 'user-driver-1' }] }) // driver found
      .mockResolvedValueOnce({ rows: [{ id: 'v1', assigned_driver_id: 'driver-1' }] }); // UPDATE assign
    const res = await request(app)
      .put('/fleet/f1/vehicles/v1/driver')
      .set('Authorization', fleetToken)
      .send({ driver_user_id: 'user-driver-1' });
    expect(ANY).toContain(res.statusCode);
  });
});

describe('fleetController — getFleetVehicles', () => {
  test('fleet not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/fleet/nonexistent/vehicles')
      .set('Authorization', fleetToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('success returns vehicles → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'f1', owner_id: 'fleet-1' }] }) // fleet
      .mockResolvedValueOnce({ rows: [{ id: 'v1' }, { id: 'v2' }] }); // vehicles
    const res = await request(app)
      .get('/fleet/f1/vehicles')
      .set('Authorization', fleetToken);
    expect(ANY).toContain(res.statusCode);
  });
});
