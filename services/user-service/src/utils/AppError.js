class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    // Identifies errors we throw explicitly vs unexpected runtime crashes
    this.isOperational = true; 
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
