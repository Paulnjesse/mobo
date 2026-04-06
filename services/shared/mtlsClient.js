/**
 * MOBO Mutual TLS (mTLS) HTTP Client
 *
 * Provides an HTTPS agent with client certificate authentication for
 * service-to-service communication. When SERVICE_CERT, SERVICE_KEY, and
 * SERVICE_CA_CERT environment variables are set, all inter-service requests
 * use mutual TLS — both sides present and verify certificates.
 *
 * Without mTLS certs (e.g. local dev), falls back to the bearer-token
 * internalAuth header approach (still secure over Render's private network).
 *
 * Environment variables (per service):
 *   SERVICE_CERT       — PEM-encoded client certificate (base64, newlines as \n)
 *   SERVICE_KEY        — PEM-encoded client private key (base64, newlines as \n)
 *   SERVICE_CA_CERT    — PEM-encoded CA certificate that signed all service certs
 *
 * Certificate generation (one-time setup):
 *   # Generate CA
 *   openssl genrsa -out ca.key 4096
 *   openssl req -new -x509 -days 3650 -key ca.key -out ca.crt -subj "/CN=mobo-internal-ca"
 *
 *   # Generate per-service cert (repeat for each service)
 *   openssl genrsa -out user-service.key 2048
 *   openssl req -new -key user-service.key -out user-service.csr -subj "/CN=mobo-user-service"
 *   openssl x509 -req -days 365 -in user-service.csr -CA ca.crt -CAkey ca.key \
 *     -CAcreateserial -out user-service.crt
 *
 *   # Store in Render env vars (base64-encode to preserve newlines):
 *   SERVICE_CERT=$(base64 -w0 user-service.crt)
 *   SERVICE_KEY=$(base64 -w0 user-service.key)
 *   SERVICE_CA_CERT=$(base64 -w0 ca.crt)
 */
'use strict';
/**
 * MOBO Mutual TLS (mTLS) HTTP Client — with zero-touch cert rotation.
 *
 * Integrates with certRotation.js to hot-reload the TLS agent whenever
 * certificates are renewed by an external cert manager (cert-manager, Vault
 * Agent, ACME, etc.) — no service restart required.
 *
 * Environment variables:
 *   SERVICE_CERT_FILE    — path to PEM cert file (watched for changes)
 *   SERVICE_KEY_FILE     — path to PEM key file  (watched for changes)
 *   SERVICE_CA_CERT_FILE — path to PEM CA file   (watched for changes)
 *   SERVICE_CERT         — base64/PEM cert (fallback if no file path set)
 *   SERVICE_KEY          — base64/PEM key  (fallback)
 *   SERVICE_CA_CERT      — base64/PEM CA   (fallback)
 *   CERT_WARN_DAYS       — warn N days before expiry (default: 14)
 *   CERT_CRITICAL_DAYS   — critical alert N days before expiry (default: 3)
 *   CERT_CHECK_INTERVAL_MS — expiry check frequency (default: 3600000)
 */

const https  = require('https');
const axios  = require('axios');
const { internalHeaders } = require('./internalAuth');
const { manager: certManager } = require('./certRotation');

// ─── Live-reloadable TLS agent ────────────────────────────────────────────────

/**
 * Build an https.Agent from current cert material.
 * Falls back to a plain TLS agent (server-cert validation only) when no
 * client certs are configured.
 */
function _buildAgent(certs) {
  const { cert, key, ca } = certs;
  if (cert && key && ca) {
    return new https.Agent({ cert, key, ca, rejectUnauthorized: true });
  }
  return new https.Agent({ rejectUnauthorized: true });
}

// Agent reference — replaced in-place on cert rotation
let _currentAgent = _buildAgent(certManager.getCerts());

// Start the rotation manager; rebuild the agent whenever certs rotate
certManager.start((newCerts) => {
  console.info('[mTLS] Cert rotation detected — rebuilding TLS agent.');
  _currentAgent = _buildAgent(newCerts);
});

if (process.env.NODE_ENV === 'production' && !certManager.isAvailable()) {
  console.warn(
    '[mTLS] WARNING: No client certificates configured. ' +
    'Set SERVICE_CERT_FILE / SERVICE_KEY_FILE / SERVICE_CA_CERT_FILE ' +
    '(or SERVICE_CERT / SERVICE_KEY / SERVICE_CA_CERT) for mutual TLS. ' +
    'Service-to-service calls will use bearer-token auth only.'
  );
}

// ─── Axios instance ────────────────────────────────────────────────────────────

/**
 * Axios instance for internal service-to-service calls.
 *   - Uses the current live-rotated TLS agent (re-read on every request)
 *   - Includes X-Internal-Service-Key bearer token (defence-in-depth)
 *   - Rejects unverified server certs
 *   - 10-second timeout
 */
const internalAxios = axios.create({
  timeout: 10_000,
  headers: internalHeaders(),
});

// Inject the latest agent and auth headers on every request — picks up
// any cert rotation that happened since the last request
internalAxios.interceptors.request.use((config) => {
  config.httpsAgent = _currentAgent;
  Object.assign(config.headers, internalHeaders());
  return config;
});

function isMtlsActive() {
  return certManager.isAvailable();
}

/** Exposed for testing — returns the currently active agent. */
function createMtlsAgent() {
  return _currentAgent;
}

module.exports = { internalAxios, isMtlsActive, createMtlsAgent, certManager };
