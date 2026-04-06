const path = require('path');

/** @type {import('jest').Config} */
module.exports = {
  rootDir: path.resolve(__dirname, '../..'),
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/functional/**/*.test.js'],
  testTimeout: 15000,
  forceExit: true,
  clearMocks: true,
  verbose: true,
  transform: {},
  moduleNameMapper: {
    // OpenTelemetry tracing — uses top-level return, must be stubbed
    '.*src/tracing$': '<rootDir>/tests/functional/__mocks__/tracing.js',
    // axios — prevent real HTTP calls in tests
    '^axios$': '<rootDir>/tests/functional/__mocks__/axios.js',
    // Google Maps SDK — has TypeScript files that require a transform
    '@googlemaps/google-maps-services-js': '<rootDir>/tests/functional/__mocks__/googleMapsClient.js',
    // Shared utilities (matched by the raw require string used in source files)
    '.*shared/fieldEncryption.*': '<rootDir>/tests/functional/__mocks__/fieldEncryption.js',
    '.*shared/featureFlags.*':    '<rootDir>/tests/functional/__mocks__/featureFlags.js',
    '.*shared/circuitBreaker.*':  '<rootDir>/tests/functional/__mocks__/circuitBreaker.js',
    '.*shared/fraudDetection.*':  '<rootDir>/tests/functional/__mocks__/fraudDetection.js',
    '.*shared/internalAuth.*':    '<rootDir>/tests/functional/__mocks__/internalAuth.js',
    '.*shared/internalClient.*':  '<rootDir>/tests/functional/__mocks__/internalClient.js',
    '.*shared/mtlsClient.*':      '<rootDir>/tests/functional/__mocks__/mtlsClient.js',
    '.*shared/locationRateLimit.*': '<rootDir>/tests/functional/__mocks__/locationRateLimit.js',
    '.*shared/redis.*':           '<rootDir>/tests/functional/__mocks__/redis.js',
    '.*shared/logger.*':          '<rootDir>/tests/functional/__mocks__/logger.js',
    '.*shared/jwtUtil.*':         '<rootDir>/tests/functional/__mocks__/jwtUtil.js',
    '.*shared/auditLog.*':        '<rootDir>/tests/functional/__mocks__/auditLog.js',
    // Per-service db convenience re-exports (matched by the raw ../db require string)
    '.*user-service/src/db$':     '<rootDir>/tests/functional/__mocks__/userDb.js',
    '.*ride-service/src/db$':     '<rootDir>/tests/functional/__mocks__/rideDb.js',
    '.*location-service/src/db$': '<rootDir>/tests/functional/__mocks__/locationDb.js',
  },
};
