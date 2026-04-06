const fn = (name) => (req, res, next) => next ? next() : undefined;
module.exports = { circuitBreakerFor: fn, getAllServiceHealth: jest.fn().mockReturnValue({}) };
