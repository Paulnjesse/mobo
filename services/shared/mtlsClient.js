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

const https  = require('https');
const axios  = require('axios');
const crypto = require('crypto');
const { internalHeaders } = require('./internalAuth');

// ─── Load certs from env ───────────────────────────────────────────────────────

function decodePem(envVar) {
  const val = process.env[envVar];
  if (!val) return null;
  // Support both raw PEM and base64-encoded PEM (for env var storage)
  if (val.includes('-----BEGIN')) return val.replace(/\\n/g, '\n');
  try {
    return Buffer.from(val, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

const CLIENT_CERT = decodePem('SERVICE_CERT');
const CLIENT_KEY  = decodePem('SERVICE_KEY');
const CA_CERT     = decodePem('SERVICE_CA_CERT');

const MTLS_AVAILABLE = !!(CLIENT_CERT && CLIENT_KEY && CA_CERT);

if (process.env.NODE_ENV === 'production' && !MTLS_AVAILABLE) {
  console.warn(
    '[mTLS] WARNING: SERVICE_CERT / SERVICE_KEY / SERVICE_CA_CERT not set. ' +
    'Service-to-service calls use bearer-token auth only (no mutual TLS). ' +
    'See services/shared/mtlsClient.js for setup instructions.'
  );
} else if (MTLS_AVAILABLE) {
  // Log cert fingerprint at startup for audit trail
  try {
    const cert = new crypto.X509Certificate(CLIENT_CERT);
    console.info('[mTLS] Client certificate loaded:', {
      subject: cert.subject,
      validTo: cert.validTo,
      fingerprint: cert.fingerprint256,
    });
  } catch { /* ignore parse errors */ }
}

// ─── HTTPS agent ───────────────────────────────────────────────────────────────

/**
 * Creates an HTTPS agent that presents our client certificate to the server
 * and validates the server's certificate against our internal CA.
 */
function createMtlsAgent() {
  if (!MTLS_AVAILABLE) {
    // Standard TLS agent — validates server cert, no client cert presented
    return new https.Agent({ rejectUnauthorized: true });
  }
  return new https.Agent({
    cert: CLIENT_CERT,
    key:  CLIENT_KEY,
    ca:   CA_CERT,
    rejectUnauthorized: true,
  });
}

const _agent = createMtlsAgent();

// ─── Axios instance ────────────────────────────────────────────────────────────

/**
 * Axios instance pre-configured for internal service-to-service calls.
 * - Presents client certificate (mTLS) when certs are configured
 * - Includes X-Internal-Service-Key bearer token (always, as defence-in-depth)
 * - Rejects unverified server certs
 * - 10-second timeout
 */
const internalAxios = axios.create({
  httpsAgent: _agent,
  timeout: 10_000,
  headers: internalHeaders(),
});

// Refresh internal auth headers on every request (in case secret rotates at runtime)
internalAxios.interceptors.request.use((config) => {
  Object.assign(config.headers, internalHeaders());
  return config;
});

/**
 * Check whether mTLS is active (both client cert and CA cert loaded).
 */
function isMtlsActive() {
  return MTLS_AVAILABLE;
}

module.exports = { internalAxios, isMtlsActive, createMtlsAgent };
