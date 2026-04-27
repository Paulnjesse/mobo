module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  forceExit: true,
  clearMocks: true,
  testTimeout: 10000,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/tracing.js',
    '!src/utils/logger.js',   // mocked in all tests — not meaningful to measure
    '!src/utils/errors.js',   // thin class, tested indirectly via errorHandler
    '!src/constants/index.js', // static data, no logic to test
  ],
  coverageThreshold: {
    global: {
      lines:      70,
      functions:  55,   // server.js init fns are integration-only; middleware well-covered
      branches:   60,
      statements: 70,
    },
  },
  coverageReporters: ['text', 'lcov', 'clover'],
  modulePaths: ['<rootDir>/node_modules'],
};
