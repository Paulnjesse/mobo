# MOBO Staging Environment Setup Guide

## Overview
The staging environment (`staging.mobo.cm`) is a production-like replica used for QA testing, UAT (User Acceptance Testing), and final validation before deploying code to production.

## 1. Architectural Differences from Production
To save costs and prevent accidental data leakage, the staging environment has the following constraints:
- **Database:** Smaller instance size. Contains scrubbed/anonymized data only. PII (Personally Identifiable Information) must be masked.
- **Third-Party Integrations:**
  - **Stripe / Flutterwave:** Uses Sandbox/Test API keys. No real money changes hands.
  - **Twilio (SMS):** Uses test credentials or routes all SMS to a mock local logging service instead of real phones.
  - **Mailgun/Sendgrid:** Email routing is restricted to internal `@mobo.cm` domains or a sandbox inbox (e.g., Mailtrap).
- **Scaling:** Microservices are locked to a single instance each (no horizontal autoscaling).

## 2. Infrastructure Setup (Render)
Staging services are deployed to Render under a separate "Staging" environment group.
1. **API Gateway:** `mobo-api-gateway-staging`
2. **User Service:** `mobo-user-service-staging`
3. **Ride Service:** `mobo-ride-service-staging`
4. **Location Service:** `mobo-location-service-staging`
5. **Payment Service:** `mobo-payment-service-staging`

## 3. GitHub Actions CI/CD Pipeline
- **Trigger:** Any push or merged Pull Request to the `develop` or `staging` branch triggers the staging deployment pipeline.
- **Process:**
  1. Lints code and runs unit/integration tests (`npm test`).
  2. Builds Docker images.
  3. Deploys to Render via Render Deploy Hooks.
  4. Runs post-deployment E2E smoke tests (Cypress/Detox against staging APIs).

## 4. Data Refresh Policy
- The staging database is wiped and refreshed from a masked snapshot of production every Friday at 02:00 AM UTC.
- To trigger a manual data refresh: Run the GitHub Action workflow `Refresh Staging Data`.

## 5. Mobile App Staging Builds
- **Android:** Distributed via Firebase App Distribution to internal QA testers. Points to the staging API Gateway (`https://api-staging.mobo.cm/api`).
- **iOS:** Distributed via Apple TestFlight to internal testing groups.
- A visual "STAGING" watermark or banner is forced in the app UI to prevent confusion with the live app.
