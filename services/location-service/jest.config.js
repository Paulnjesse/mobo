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
    '!src/config/database.js',
    '!src/utils/logger.js',
    '!src/utils/cache.js',
    '!src/utils/errors.js',
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
