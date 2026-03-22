process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-jest-minimum-32-chars-long';

const mockDb = {
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn().mockResolvedValue({ query: jest.fn(), release: jest.fn() }),
};

jest.mock('../src/config/database', () => mockDb);
jest.mock('axios', () => ({
  get: jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ data: {} }),
}));

const request = require('supertest');
const app = require('../server');

describe('Location Service', () => {
  describe('GET /health', () => {
    it('returns 200', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.service).toBe('mobo-location-service');
    });
  });

  describe('Authentication guard', () => {
    it('POST /location requires auth', async () => {
      const res = await request(app)
        .post('/location')
        .send({ latitude: 3.848, longitude: 11.502, heading: 0, speed: 0, accuracy: 10 });
      expect([401, 403]).toContain(res.status);
    });

    it('GET /location/nearby-drivers requires auth', async () => {
      const res = await request(app).get('/location/nearby-drivers');
      expect([401, 403]).toContain(res.status);
    });

    it('GET /location/surge requires auth', async () => {
      const res = await request(app).get('/location/surge');
      expect([401, 403]).toContain(res.status);
    });
  });
});
