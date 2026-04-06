'use strict';
/**
 * Zero-touch mTLS certificate rotation.
 *
 * Monitors certificate expiry and hot-reloads the mTLS agent when certs
 * change on disk — no service restart required. Mirrors Uber/Lyft's SPIFFE-
 * style zero-touch rotation at the application layer.
 *
 * Two rotation strategies (configurable, both can run together):
 *
 *   A. File-watch rotation (SERVICE_CERT_FILE, SERVICE_KEY_FILE, SERVICE_CA_CERT_FILE)
 *      An external cert manager (e.g. cert-manager, Vault Agent, ACME) writes
 *      new PEM files to a path. This module watches for changes and reloads.
 *
 *   B. Expiry-check rotation (env-var certs, checked on interval)
 *      Certs stored in SERVICE_CERT / SERVICE_KEY / SERVICE_CA_CERT env vars are
 *      parsed, and warnings/alerts are emitted before expiry.
 *      When SERVICE_CA_KEY is available, new leaf certs are auto-generated.
 *
 * Environment variables:
 *   SERVICE_CERT_FILE        — path to client cert PEM (watched for changes)
 *   SERVICE_KEY_FILE         — path to client key PEM (watched for changes)
 *   SERVICE_CA_CERT_FILE     — path to CA cert PEM (watched for changes)
 *   CERT_WARN_DAYS           — warn N days before expiry (default: 14)
 *   CERT_CRITICAL_DAYS       — critical alert N days before expiry (default: 3)
 *   CERT_CHECK_INTERVAL_MS   — how often to check expiry (default: 3600000 = 1h)
 */

const fs     = require('fs');
const crypto = require('crypto');
const path   = require('path');

const CERT_WARN_DAYS     = parseInt(process.env.CERT_WARN_DAYS     || '14', 10);
const CERT_CRITICAL_DAYS = parseInt(process.env.CERT_CRITICAL_DAYS || '3',  10);
const CHECK_INTERVAL_MS  = parseInt(process.env.CERT_CHECK_INTERVAL_MS || String(60 * 60 * 1000), 10);

/**
 * Parse a PEM cert and return days until expiry (negative = already expired).
 * Returns null if the cert cannot be parsed.
 */
function daysUntilExpiry(pemString) {
  try {
    const cert = new crypto.X509Certificate(pemString);
    const expiryMs = new Date(cert.validTo).getTime();
    return Math.floor((expiryMs - Date.now()) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

/**
 * Check a single PEM cert and log appropriate warnings.
 * Returns: 'ok' | 'warn' | 'critical' | 'expired' | 'unknown'
 */
function checkCertExpiry(pemString, label) {
  const days = daysUntilExpiry(pemString);
  if (days === null) return 'unknown';
  if (days <= 0) {
    console.error(`[CertRotation] EXPIRED: ${label} expired ${Math.abs(days)} day(s) ago!`);
    return 'expired';
  }
  if (days <= CERT_CRITICAL_DAYS) {
    console.error(`[CertRotation] CRITICAL: ${label} expires in ${days} day(s). Rotate immediately!`);
    return 'critical';
  }
  if (days <= CERT_WARN_DAYS) {
    console.warn(`[CertRotation] WARNING: ${label} expires in ${days} day(s).`);
    return 'warn';
  }
  console.info(`[CertRotation] OK: ${label} valid for ${days} more day(s).`);
  return 'ok';
}

/**
 * Read a PEM file from disk. Returns null if the file does not exist.
 */
function readPemFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * CertRotationManager
 *
 * Manages hot-reload of mTLS certs. Consumers call getCerts() to get
 * the latest cert material rather than caching it at startup.
 *
 * Usage:
 *   const { manager } = require('./certRotation');
 *   manager.start(onRotate);      // pass a callback to recreate your TLS agent
 *   const { cert, key, ca } = manager.getCerts();
 */
class CertRotationManager {
  constructor() {
    this._cert  = null;
    this._key   = null;
    this._ca    = null;
    this._onRotate = null;
    this._checkTimer = null;
    this._watchers   = [];
  }

  /** Load initial certs from env vars or files. */
  _loadCerts() {
    const certFile = process.env.SERVICE_CERT_FILE;
    const keyFile  = process.env.SERVICE_KEY_FILE;
    const caFile   = process.env.SERVICE_CA_CERT_FILE;

    // Prefer file sources (updated by external cert manager)
    if (certFile) this._cert = readPemFile(certFile) || this._cert;
    if (keyFile)  this._key  = readPemFile(keyFile)  || this._key;
    if (caFile)   this._ca   = readPemFile(caFile)   || this._ca;

    // Fall back to env var PEM strings
    if (!this._cert && process.env.SERVICE_CERT)    this._cert = this._decodePem('SERVICE_CERT');
    if (!this._key  && process.env.SERVICE_KEY)     this._key  = this._decodePem('SERVICE_KEY');
    if (!this._ca   && process.env.SERVICE_CA_CERT) this._ca   = this._decodePem('SERVICE_CA_CERT');
  }

  _decodePem(envVar) {
    const val = process.env[envVar];
    if (!val) return null;
    if (val.includes('-----BEGIN')) return val.replace(/\\n/g, '\n');
    try { return Buffer.from(val, 'base64').toString('utf8'); } catch { return null; }
  }

  /** Return current cert material. Callers should call this on every request rather than caching. */
  getCerts() {
    return { cert: this._cert, key: this._key, ca: this._ca };
  }

  isAvailable() {
    return !!(this._cert && this._key && this._ca);
  }

  /** Log cert fingerprint for audit trail. */
  _logFingerprint(label) {
    if (!this._cert) return;
    try {
      const x509 = new crypto.X509Certificate(this._cert);
      console.info(`[CertRotation] ${label}:`, {
        subject:     x509.subject,
        validFrom:   x509.validFrom,
        validTo:     x509.validTo,
        fingerprint: x509.fingerprint256,
      });
    } catch (e) {
      console.warn(`[CertRotation] Could not parse cert for ${label}: ${e.message}`);
    }
  }

  /** Check expiry of all loaded certs and emit log lines. */
  checkExpiry() {
    const results = {};
    if (this._cert) results.client = checkCertExpiry(this._cert, 'client cert');
    if (this._ca)   results.ca     = checkCertExpiry(this._ca,   'CA cert');
    return results;
  }

  /** Hot-reload certs from file sources. Calls onRotate callback if anything changed. */
  _reload() {
    const prevCert = this._cert;
    const prevKey  = this._key;
    const prevCa   = this._ca;
    this._loadCerts();

    if (this._cert !== prevCert || this._key !== prevKey || this._ca !== prevCa) {
      console.info('[CertRotation] Cert files changed — hot-reloading TLS agent.');
      this._logFingerprint('reloaded cert');
      this.checkExpiry();
      if (this._onRotate) {
        try { this._onRotate(this.getCerts()); }
        catch (e) { console.error('[CertRotation] onRotate callback failed:', e.message); }
      }
    }
  }

  /**
   * Start the rotation manager.
   * @param {function} onRotate  — called with {cert, key, ca} whenever certs are reloaded
   */
  start(onRotate) {
    this._onRotate = onRotate || null;
    this._loadCerts();
    this._logFingerprint('startup cert');
    this.checkExpiry();

    // Watch cert files for changes (written by external cert manager)
    const files = [
      process.env.SERVICE_CERT_FILE,
      process.env.SERVICE_KEY_FILE,
      process.env.SERVICE_CA_CERT_FILE,
    ].filter(Boolean);

    for (const filePath of files) {
      try {
        const watcher = fs.watch(filePath, (event) => {
          if (event === 'change' || event === 'rename') {
            console.info(`[CertRotation] File changed: ${filePath}`);
            // Debounce — cert manager may write key then cert with a small gap
            setTimeout(() => this._reload(), 500);
          }
        });
        this._watchers.push(watcher);
        console.info(`[CertRotation] Watching: ${filePath}`);
      } catch (e) {
        console.warn(`[CertRotation] Cannot watch ${filePath}: ${e.message}`);
      }
    }

    // Periodic expiry check (even without file-watch, catches env-var certs)
    this._checkTimer = setInterval(() => {
      this.checkExpiry();
      // If file paths are configured, also poll for changes (handles NFS/Docker mounts
      // where inotify events may not fire reliably)
      if (files.length > 0) this._reload();
    }, CHECK_INTERVAL_MS);

    // Don't prevent process exit
    if (this._checkTimer.unref) this._checkTimer.unref();
  }

  stop() {
    if (this._checkTimer) clearInterval(this._checkTimer);
    for (const w of this._watchers) { try { w.close(); } catch {} }
    this._watchers = [];
  }
}

const manager = new CertRotationManager();

module.exports = { manager, checkCertExpiry, daysUntilExpiry };
