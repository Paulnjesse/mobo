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
    '!src/config/database.js',
    '!src/jobs/expiryAlertJob.js',
    '!src/middleware/dataAccessLogger.js',
    '!src/services/pushNotifications.js',
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
  // Allow shared/ modules to resolve packages installed in user-service/node_modules
  modulePaths: ['<rootDir>/node_modules'],
};
