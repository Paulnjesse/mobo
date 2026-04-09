// Pass-through mock — re-exports the real currencyUtil so tests use real conversion logic.
// This entry exists solely so jest.config.js moduleNameMapper can resolve the shared path
// without the test runner needing the relative ../../../../shared/ traversal to work.
const real = jest.requireActual('../../services/shared/currencyUtil');
module.exports = real;
