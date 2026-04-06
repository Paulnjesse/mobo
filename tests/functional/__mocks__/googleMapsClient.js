const Client = jest.fn(() => ({
  directions:     jest.fn().mockResolvedValue({ data: { status: 'OK', routes: [] } }),
  distancematrix: jest.fn().mockResolvedValue({ data: { status: 'OK', rows: [] } }),
  geocode:        jest.fn().mockResolvedValue({ data: { status: 'OK', results: [] } }),
  reverseGeocode: jest.fn().mockResolvedValue({ data: { status: 'OK', results: [] } }),
}));

module.exports = { Client };
