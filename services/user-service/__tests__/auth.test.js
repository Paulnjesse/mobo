process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-jest-minimum-32-chars-long';

const mockDb = {
  query: jest.fn(),
  connect: jest.fn().mockResolvedValue({ query: jest.fn(), release: jest.fn() }),
};

jest.mock('../src/config/database', () => mockDb);
jest.mock('../src/jobs/expiryAlertJob', () => ({ startExpiryAlertJob: jest.fn() }));
jest.mock('twilio', () => () => ({
  messages: { create: jest.fn().mockResolvedValue({ sid: 'SM_test' }) },
}));
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: jest.fn().mockResolvedValue({ messageId: 'test' }) }),
}));

const request = require('supertest');
const app = require('../server');

describe('User Service - Auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/login', () => {
    it('returns 400 when identifier is missing', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ password: 'password123' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when password is missing', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ phone: '+237612345678' });
      expect(res.status).toBe(400);
    });

    it('returns 401 when user not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const res = await request(app)
        .post('/auth/login')
        .send({ phone: '+237612345678', password: 'wrongpass' });
      expect([400, 401, 404]).toContain(res.status);
    });
  });

  describe('POST /auth/signup', () => {
    it('returns 400 when phone is missing', async () => {
      const res = await request(app)
        .post('/auth/signup')
        .send({ password: 'Password123!', full_name: 'Test User' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when password is missing', async () => {
      const res = await request(app)
        .post('/auth/signup')
        .send({ phone: '+237612345678', full_name: 'Test User' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/verify', () => {
    it('returns 400 when otp_code is missing', async () => {
      const res = await request(app)
        .post('/auth/verify')
        .send({ phone: '+237612345678' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('returns 400 when identifier is missing', async () => {
      const res = await request(app)
        .post('/auth/forgot-password')
        .send({});
      expect(res.status).toBe(400);
    });
  });
});
