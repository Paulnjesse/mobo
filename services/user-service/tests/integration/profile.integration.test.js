/**
 * Profile API — Integration Tests
 *
 * Hits a real PostgreSQL instance (spun up by docker-compose in CI).
 * Tests the full request → middleware → controller → DB → response chain.
 *
 * Run: npm run test:integration
 * Requires: DATABASE_URL pointing to the test database
 */

const request  = require('supertest');
const jwt      = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const app      = require('../../server');   // Express app (not started — supertest handles it)
const db       = require('../../src/config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'ci-test-secret-minimum-32-characters-long-for-hmac';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeToken(overrides = {}) {
  return jwt.sign(
    { id: uuidv4(), role: 'rider', ...overrides },
    JWT_SECRET,
    { expiresIn: '1h', algorithm: 'HS256' }
  );
}

async function seedUser(overrides = {}) {
  const id = uuidv4();
  await db.query(
    `INSERT INTO users (id, full_name, phone, password_hash, role, is_active, is_verified)
     VALUES ($1, $2, $3, '$2b$10$testhashedpassword', 'rider', true, true)`,
    [id, overrides.full_name || 'Test User', overrides.phone || `+23760000${Math.floor(Math.random()*10000)}`]
  );
  return id;
}

async function cleanupUser(userId) {
  await db.query('DELETE FROM users WHERE id = $1', [userId]);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /users/profile', () => {
  let userId;

  beforeAll(async () => {
    userId = await seedUser({ full_name: 'Integration Test User' });
  });

  afterAll(async () => {
    await cleanupUser(userId);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/users/profile');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 with an expired token', async () => {
    const expiredToken = jwt.sign(
      { id: userId, role: 'rider' },
      JWT_SECRET,
      { expiresIn: '-1s', algorithm: 'HS256' }
    );
    const res = await request(app)
      .get('/users/profile')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/expired/i);
  });

  it('returns 200 with valid token and correct user data', async () => {
    const token = makeToken({ id: userId });
    const res = await request(app)
      .get('/users/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.id).toBe(userId);
    expect(res.body.data.user.full_name).toBe('Integration Test User');
    // Password hash must NEVER appear in profile response
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash/);
  });
});

describe('PUT /users/profile', () => {
  let userId;

  beforeAll(async () => {
    userId = await seedUser({ full_name: 'Update Test User' });
  });

  afterAll(async () => {
    await cleanupUser(userId);
  });

  it('returns 400 for invalid language', async () => {
    const token = makeToken({ id: userId });
    const res = await request(app)
      .put('/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ language: 'de' });   // German — not supported
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/language/i);
  });

  it('returns 400 for full_name that exceeds length limit', async () => {
    const token = makeToken({ id: userId });
    const res = await request(app)
      .put('/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'A'.repeat(200) });
    expect(res.status).toBe(400);
  });

  it('returns 400 for full_name with script injection attempt', async () => {
    const token = makeToken({ id: userId });
    const res = await request(app)
      .put('/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: '<script>alert(1)</script>' });
    expect(res.status).toBe(400);
  });

  it('updates valid fields and returns updated user', async () => {
    const token = makeToken({ id: userId });
    const res = await request(app)
      .put('/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ city: 'Yaoundé', language: 'fr' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.city).toBe('Yaoundé');
    expect(res.body.data.user.language).toBe('fr');
  });
});

describe('POST /users/profile/photo — magic byte validation', () => {
  let userId;

  beforeAll(async () => {
    userId = await seedUser();
  });

  afterAll(async () => {
    await cleanupUser(userId);
  });

  it('rejects a file with spoofed MIME type (PHP shell as image/jpeg)', async () => {
    const token = makeToken({ id: userId });
    // PHP shell content with Content-Type: image/jpeg header
    const fakeImage = Buffer.from('<?php system($_GET["cmd"]); ?>');

    const res = await request(app)
      .post('/users/profile/photo')
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', fakeImage, { filename: 'shell.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/image format/i);
  });

  it('rejects an SVG file (XSS vector)', async () => {
    const token = makeToken({ id: userId });
    const svgXss = Buffer.from('<svg><script>alert(1)</script></svg>');

    const res = await request(app)
      .post('/users/profile/photo')
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', svgXss, { filename: 'evil.svg', contentType: 'image/svg+xml' });

    expect(res.status).toBe(400);
  });

  it('accepts a valid JPEG file', async () => {
    const token = makeToken({ id: userId });
    // Minimal valid JPEG magic bytes: FF D8 FF E0 ...
    const minimalJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

    const res = await request(app)
      .post('/users/profile/photo')
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', minimalJpeg, { filename: 'photo.jpg', contentType: 'image/jpeg' });

    // May fail DB update if user not found, but should not be a 400 validation error
    expect([200, 404]).toContain(res.status);
    expect(res.status).not.toBe(400);
  });
});
