/**
 * Wraps async Express routes to automatically catch Promise rejections
 * and pass them to the global error handling middleware.
 * This completely removes the need for try/catch blocks in controllers.
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = asyncHandler;
