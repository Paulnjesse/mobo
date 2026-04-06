const client = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK'), setex: jest.fn().mockResolvedValue('OK'), del: jest.fn().mockResolvedValue(1), quit: jest.fn() };
module.exports = client;
