#!/usr/bin/env bash
# generate-mtls-certs.sh — Generate mTLS certificates for MOBO inter-service communication
# Run once during initial setup, then store certs in Render secret files or env vars.
# Each service gets its own client certificate, all signed by the internal CA.

set -euo pipefail

CERT_DIR="${CERT_DIR:-./certs/mtls}"
CA_DAYS=3650    # 10 years
CERT_DAYS=365   # 1 year (rotate annually)
KEY_BITS=2048

mkdir -p "$CERT_DIR"
cd "$CERT_DIR"

echo "=== Generating MOBO Internal CA ==="
openssl genrsa -out ca.key "$KEY_BITS"
openssl req -new -x509 -days "$CA_DAYS" -key ca.key -out ca.crt \
  -subj "/C=CM/O=MOBO/CN=mobo-internal-ca"

SERVICES=("api-gateway" "user-service" "ride-service" "payment-service" "location-service" "ml-service")

for SERVICE in "${SERVICES[@]}"; do
  echo "=== Generating cert for $SERVICE ==="
  openssl genrsa -out "${SERVICE}.key" "$KEY_BITS"
  openssl req -new \
    -key "${SERVICE}.key" \
    -out "${SERVICE}.csr" \
    -subj "/C=CM/O=MOBO/CN=mobo-${SERVICE}"
  openssl x509 -req -days "$CERT_DAYS" \
    -in "${SERVICE}.csr" \
    -CA ca.crt -CAkey ca.key -CAcreateserial \
    -out "${SERVICE}.crt"
  rm "${SERVICE}.csr"
  echo "  → ${SERVICE}.crt + ${SERVICE}.key generated"
done

echo ""
echo "=== Base64-encode for Render env vars ==="
echo "Copy these into your Render service environment variables:"
echo ""
echo "SERVICE_CA_CERT (same for all services):"
base64 -w0 ca.crt
echo ""
for SERVICE in "${SERVICES[@]}"; do
  echo "--- ${SERVICE} ---"
  echo "SERVICE_CERT:"
  base64 -w0 "${SERVICE}.crt"
  echo ""
  echo "SERVICE_KEY:"
  base64 -w0 "${SERVICE}.key"
  echo ""
done

echo "=== Certificate fingerprints ==="
for SERVICE in "${SERVICES[@]}"; do
  FINGERPRINT=$(openssl x509 -in "${SERVICE}.crt" -fingerprint -sha256 -noout | cut -d= -f2)
  echo "${SERVICE}: ${FINGERPRINT}"
done

echo ""
echo "SECURITY: Store ca.key securely — it signs all service certs."
echo "SECURITY: Do NOT commit any .key or .crt files to git."
echo "Done. Certs written to: $CERT_DIR"
