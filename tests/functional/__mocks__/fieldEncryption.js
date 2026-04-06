module.exports = {
  encrypt:       jest.fn((v) => `enc:${v}`),
  decrypt:       jest.fn((v) => String(v).replace('enc:', '')),
  hashForLookup: jest.fn((v) => `hash:${v}`),
  reencrypt:     jest.fn((v) => v),
  KEY_VERSION:   1,
};
