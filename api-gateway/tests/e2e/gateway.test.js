const request = require('supertest');
const app = require('../../server'); // Assumes API gateway exports the Express app instance

describe('API Gateway E2E Tests', () => {
  describe('Health Checks', () => {
    it('should return 200 OK for the gateway health check', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('status', 'Gateway OK');
    });
  });

  describe('Route Proxying (User Service)', () => {
    it('should proxy /api/users routes correctly', async () => {
      // Note: This requires the mock downstream services to be running or mocking HTTP calls using Nock.
      // E.g., testing that the gateway forwards auth tokens successfully.
      const res = await request(app)
        .get('/api/users/profile')
        .set('Authorization', 'Bearer invalid_token'); // Expect 401 or 403 as validation prevents bad proxying
        
      expect(res.statusCode).toBeGreaterThanOrEqual(401);
    });
  });
});
