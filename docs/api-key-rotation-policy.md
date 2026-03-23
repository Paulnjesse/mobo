# MOBO Secret & API Key Rotation Policy

## 1. Overview
Compromised secrets (API keys, database passwords, JWT secrets) are the leading cause of massive data breaches. MOBO enforces a strict, documented rotation policy for all credentials.

## 2. The Golden Rule
**NEVER commit secrets to source control.**
- If a secret is accidentally committed to GitHub (e.g., a Personal Access Token or `.env` file), it must be considered **COMPROMISED** immediately.
- The secret must be revoked at the provider and a new one generated.

## 3. Rotation Schedule
| Secret Type | Rotation Frequency | Provider |
|---|---|---|
| **Database Passwords** | 90 Days | Render/Supabase |
| **JWT Secrets (`JWT_SECRET`)** | 90 Days | Render Env Vars |
| **Internal Service Keys (mTLS)** | 30 Days | Render Env Vars |
| **Third-Party API Keys (Google Maps, Twilio)** | 180 Days | Google Cloud / Twilio |
| **Payment Gateway Keys (Stripe, Flutterwave)** | 180 Days | Stripe Dashboard |
| **Developer Personal Access Tokens (GitHub)** | 90 Days | GitHub |

## 4. Zero-Downtime Rotation Procedure
To rotate an API key without taking down the production app:
1. **Generate** the new token at the provider (e.g., Stripe: "Roll Key").
2. **Configure App:** If the provider supports multiple active keys, add the new key to the environment variables alongside the old one, or replace it if the provider gracefully deprecates the old one over 24 hours.
3. **Deploy:** Restart all Render services (`API Gateway`, `User Service`, etc.) so they pick up the new environment variables.
4. **Verify:** Monitor logs (`Sentry` / `Grafana`) for 401/403 Unauthorized errors indicating the new key is failing.
5. **Revoke:** Once confirmed successful, permanently revoke the old key at the provider dashboard.

## 5. Emergency Rotation (Breach Scenario)
If an API key is leaked publicly (e.g., in a public GitHub repo or pastebin):
1. **REVOKE FIRST:** Immediately delete the compromised key at the provider level, ignoring downtime.
2. **Generate** a new key.
3. **Update** Render environment variables.
4. **Restart** services.
5. **Audit:** Check provider logs for unauthorized access during the exposure window.
