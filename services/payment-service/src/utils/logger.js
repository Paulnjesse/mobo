'use strict';
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, errors, json, colorize, printf } = format;

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const devFormat = printf(({ level, message, timestamp, service, requestId, ...meta }) => {
  const rid = requestId ? ` [${requestId}]` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${service}]${rid} ${level}: ${message}${metaStr}`;
});

const logger = createLogger({
  silent: isTest,
  level: isProduction ? 'info' : 'debug',
  defaultMeta: { service: process.env.SERVICE_NAME || 'mobo-service' },
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    isProduction ? json() : combine(colorize(), devFormat)
  ),
  transports: [
    new transports.Console(),
  ],
  exceptionHandlers: [new transports.Console()],
  rejectionHandlers: [new transports.Console()],
});

module.exports = logger;
