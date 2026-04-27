module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  forceExit: true,
  clearMocks: true,
  testTimeout: 15000,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/tracing.js',
    '!src/utils/logger.js',
    '!src/utils/email.js',
    '!src/jobs/escalationJob.js',
    '!src/jobs/scheduledRideJob.js',
    '!src/config/database.js',
    '!src/middleware/validate.js',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    'src/socket/rideSocket\\.js',
    'src/socket/deliverySocket\\.js',
  ],
  coverageThreshold: {
    global: {
      lines:      70,
      functions:  70,
      branches:   60,
      statements: 70,
    },
  },
  coverageReporters: ['text', 'lcov', 'clover'],
  modulePaths: ['<rootDir>/node_modules'],
};
