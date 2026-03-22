/**
 * db.js — convenience re-export of the shared database pool.
 * Controllers that require('../db') are redirected here.
 */
module.exports = require('./config/database');
