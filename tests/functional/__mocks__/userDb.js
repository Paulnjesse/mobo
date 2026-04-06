const mockUserDb = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
module.exports = mockUserDb;
