// Mock: no-op audit log for functional tests — avoids DB writes for audit events
const log = jest.fn().mockResolvedValue(undefined);
const middleware = jest.fn(() => (_req, _res, next) => next());
const AUDITABLE_ACTIONS = new Set();
module.exports = { log, middleware, AUDITABLE_ACTIONS };
