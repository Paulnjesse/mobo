process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-jest-minimum-32-chars-long';

jest.mock('../src/config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }], rowCount: 1 }),
  connect: jest.fn().mockResolvedValue({
    query: jest.fn(),
    release: jest.fn(),
  }),
}));

jest.mock('../src/jobs/expiryAlertJob', () => ({
  startExpiryAlertJob: jest.fn(),
}));

const request = require('supertest');
const app = require('../server');

describe('User Service - Health', () => {
  it('GET /health returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.service).toBe('mobo-user-service');
  });
});
