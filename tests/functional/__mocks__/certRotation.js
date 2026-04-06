// Mock: no-op cert rotation manager for functional tests
const manager = {
  start:       jest.fn(),
  stop:        jest.fn(),
  getCerts:    jest.fn().mockReturnValue({ cert: null, key: null, ca: null }),
  isAvailable: jest.fn().mockReturnValue(false),
  checkExpiry: jest.fn().mockReturnValue({}),
};
module.exports = { manager, checkCertExpiry: jest.fn(), daysUntilExpiry: jest.fn() };
