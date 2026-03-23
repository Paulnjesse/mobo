# MOBO GDPR & CCPA Compliance Policy

## 1. Overview
As a ride-hailing app collecting location data, payment info, and PII (Personally Identifiable Information), MOBO complies strictly with global privacy frameworks including GDPR (Europe) and CCPA (California), as well as local African data protection laws.

## 2. User Rights
### 2.1 Right to Access
- Users can request a complete export of their personal data (ride history, payment methods, profile details) via a "Download My Data" button in the app settings.
- **Backend implementation:** `GET /users/data-export` triggers an async job that compiles user data into a ZIP folder containing JSON/CSV files and emails a secure link to the user within 7 days.

### 2.2 Right to be Forgotten (Account Deletion)
- Users can permanently delete their account via the app (`DELETE /users/profile`).
- **Anonymization vs Deletion:**
  - PII (Name, Email, Phone, Profile Picture) is hard-deleted from all databases.
  - Financial transactions and anonymized trip records (pickup/dropoff coordinates) are retained to comply with local tax laws and for aggregate routing analysis.
  - Foreign keys to the `users` table are set to `NULL` or linked to an `AnonymizedUser` record.
- **Retention Limitation:** Redis caches and session tokens are immediately purged. Backups containing the deleted PII age out according to the 35-day backup retention policy.

## 3. Data Processing Principles
- **Purpose Limitation:** Location data is ONLY collected when the app is in use (for riders) or when online (for drivers).
- **Data Minimization:** We collect only the data strictly necessary to fulfill the ride contract.
- **Encryption:** All PII is encrypted at rest (AES-256) and in transit (TLS 1.3). 

## 4. Third-Party Data Processors
We share minimal required data with explicitly vetted third parties:
- **Twilio:** Phone numbers for SMS OTP and masked calling.
- **Stripe/Flutterwave:** Financial tokens (We do NOT store full CC numbers).
- **Google Maps APIs:** Anonymized origin/destination coordinates for routing.

## 5. Breach Notification Protocol
In the event of a suspected data breach involving PII:
1. Within **72 hours** of discovery, we must notify the relevant Data Protection Authorities.
2. High-risk breaches will be communicated directly to affected users via email and push notification, outlining the nature of the breach, the data involved, and steps users should take (e.g., changing passwords).
3. The Incident Response Playbook (`incident-response-playbook.md`) governs the technical response.
