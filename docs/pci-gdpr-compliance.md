# MOBO — PCI DSS & GDPR Compliance Boundary

## PCI DSS Scope

### In Scope (Cardholder Data Environment — CDE)
| Component | Data Handled | Requirement |
|-----------|-------------|-------------|
| `payment-service` | Tokenized payment references, transaction IDs | Tokens only — no raw PANs |
| `users.wallet_balance` | Balance in XAF (no card data) | Not in scope |
| MTN/Orange/Wave | Phone numbers used for mobile money | PCI SAQ A-EP |
| Stripe integration | Card payments tokenized by Stripe.js/Elements | SAQ A — fully outsourced |

### Out of Scope
- All other microservices (user, ride, location, gateway) — no card data
- Mobile app — card entry handled by Stripe SDK (never touches our servers)

### Controls Required
- [ ] **3.4** — Mask PANs when displayed (show last 4 only) ✅ done in PaymentMethodsScreen
- [ ] **6.3** — Patch critical vulnerabilities within 1 month ← enforce via Dependabot
- [ ] **8.2** — Unique IDs for all system components ✅ UUID-based
- [ ] **10.2** — Audit logs for payment events ← add to payment-service
- [ ] **12.10** — Incident response plan ← see docs/incident-response-playbook.md

### Annual Actions
- Run `npm audit` monthly (automated via CI)
- Annual PCI Self-Assessment Questionnaire (SAQ A or SAQ A-EP)
- Quarterly network scans (use Qualys or Tenable via Render)

---

## GDPR Compliance

### Data Categories & Legal Basis
| Data | Category | Legal Basis | Retention |
|------|----------|-------------|-----------|
| Name, phone, email | Identity | Contract performance | Account lifetime + 2y |
| Location history | Sensitive | Legitimate interest (safety/disputes) | 90 days |
| Ride history | Transactional | Contract performance | 7 years (tax) |
| Payment methods | Financial | Contract performance | Account lifetime |
| Push token | Technical | Consent | Until token expires or revoked |
| Device info | Technical | Legitimate interest (fraud) | 30 days |

### Implemented Rights
- **Right to access**: `GET /users/profile` returns all stored data ✅
- **Right to erasure**: `DELETE /users/account` anonymizes + soft-deletes ✅
  - Gaps: location history not deleted, ride history anonymized but retained
- **Right to portability**: ❌ No data export endpoint — **MUST ADD**
- **Right to rectification**: `PUT /users/profile` ✅

### Required Actions
- [ ] Implement `GET /users/data-export` (JSON download of all user data)
- [ ] Add explicit consent checkbox for location tracking at signup
- [ ] Document Data Processing Agreement (DPA) with Render, Twilio, Sentry, Cloudinary
- [ ] Add cookie/tracking consent for web admin panel
- [ ] Appoint a Data Protection Officer (DPO) or document DPO exemption

### Data Breach Protocol
Per GDPR Article 33: notify supervisory authority within **72 hours** of discovery.
See: `docs/incident-response-playbook.md` — SEV-1 Data Breach procedure.

---

## Secrets Rotation Schedule

| Secret | Rotation Interval | Method |
|--------|------------------|--------|
| JWT_SECRET | 90 days | Render env var + rolling restart |
| INTERNAL_SERVICE_KEY | 30 days | Render env var + rolling restart |
| Database password | 90 days | Render DB rotation |
| Redis password | 90 days | Manual |
| Stripe API key | 180 days | Stripe dashboard |
| Google Maps API key | 180 days | GCP console |
| Sentry DSN | On compromise only | Sentry dashboard |
| GitHub Actions secrets | 90 days | GitHub settings |

See: `docs/api-key-rotation-policy.md` for detailed procedures.
