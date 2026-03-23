# MOBO Incident Response Playbook

## 1. Incident Severity Definitions

| Severity | Description | Target Response Time | Example |
|---|---|---|---|
| **SEV-1** | Critical outage. Core functionality is completely broken for many users. | 15 minutes (24/7) | Payment gateway down, API gateway rejecting all requests, Database offline. |
| **SEV-2** | Significant degradation. A major feature is broken but the core app works, or a small subset of users are completely down. | 1 hour | Maps integration failing, SMS OTPs not sending, specific ride type unavailable. |
| **SEV-3** | Minor issue. Non-critical feature broken or performance degradation without outright failure. | Next business day | Analytics dashboards delayed, admin portal slow, delayed email receipts. |

## 2. Roles and Responsibilities
During a SEV-1 or SEV-2 incident, the following roles must be assigned:
- **Incident Commander (IC):** Drives the incident to resolution. Makes authoritative decisions, coordinates responders, and manages the timeline.
- **Communications Lead (CommZ):** Handles external communication (status page, customer support updates) and internal executive summaries.
- **Subject Matter Expert (SME):** The engineer(s) actively debugging the code, infrastructure, or database logs.

## 3. The Incident Lifecycle
### Step 1: Detection & Alerting
- Automated alerts (Sentry, Prometheus/Grafana) trigger PagerDuty for the on-call engineer.
- If manually discovered, an engineer triggers the alert via the `#incidents` Slack channel (`/incident new`).

### Step 2: Triage & Escalation
- The on-call engineer acknowledges the page.
- Assess severity. If SEV-1/SEV-2, the engineer declares an incident, assumes the IC role, and pages additional SMEs if required.
- Open a dedicated Slack channel (e.g., `#inc-2023-10-24-payment-failure`).

### Step 3: Mitigation
- **Goal:** Stop the bleeding. Prioritize restoring service over finding the root cause.
- Common mitigation strategies:
  - Rollback the latest deployment (if correlated).
  - Scale up resources (Render dashboard).
  - Restart failing services.
  - Failover to secondary database.
  - Disable a broken non-critical feature via Feature Flag.

### Step 4: Resolution & Communication
- Once the service is restored and metrics stabilize, the IC declares the incident resolved.
- CommZ updates the public status page to "Resolved."

### Step 5: Post-Mortem (Root Cause Analysis)
- **Mandatory for SEV-1 and SEV-2.**
- Must be completed within 3 business days of resolution.
- Blameless culture: Focus on *what* went wrong with the system, not *who* broke it.
- Action items (Jira tickets) must be created to prevent recurrence.
