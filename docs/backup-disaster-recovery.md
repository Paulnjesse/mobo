# MOBO Backup & Disaster Recovery (DR) Plan

## 1. Overview
This document outlines the procedures for backing up critical data and recovering the MOBO ride-hailing infrastructure in the event of a catastrophic failure, data corruption, or regional outage.

## 2. Backup Strategy
### 2.1 PostgreSQL Database (Supabase / Render)
- **Continuous Archiving:** Write-Ahead Logs (WAL) are configured to stream to an S3-compatible cold storage bucket, allowing Point-in-Time Recovery (PITR) with an RPO (Recovery Point Objective) of 5 minutes.
- **Daily Full Backups:** Automated `pg_dump` snapshots are captured daily at 00:00 UTC and stored in an encrypted off-site cloud storage bucket (AWS S3).
- **Retention Policy:** Daily backups are retained for 35 days. Weekly backups are retained for 1 year.

### 2.2 Redis Cache
- **Snapshotting:** Redis is configured using RDB snapshots saved every 60 minutes.
- **Criticality:** Redis is treated as ephemeral. Loss of cache degrades performance (ETA calculations, surge pricing) but does not result in permanent data loss.

### 2.3 Files & Assets (Cloudinary / S3)
- Assets (driver profile pictures, vehicle documents) uploaded by users are replicated across 3 Availability Zones.
- Soft-delete is enabled; objects are hidden but recoverable for 30 days before permanent purging.

## 3. Disaster Recovery Procedures
### 3.1 Scenario A: Primary Database Failure
1. **Declare severity:** Alert the on-call engineer and define P1 incident.
2. **Promote read replica (if applicable):** If a hot standby exists, promote it to primary. Update connection strings in `Render` environment variables.
3. **If no replica:** Provision a new PostgreSQL instance. Restore the most recent daily backup using `pg_restore`.
4. **Apply WAL:** Apply WAL files up to the point of failure to minimize data loss.
5. **Verify data integrity:** Run automated database health checks before allowing traffic.

### 3.2 Scenario B: Regional Cloud Provider Outage (Render/AWS)
1. **Failsafe Environment:** A secondary "cold" environment is defined via Infrastructure-as-Code (Terraform/Ansible) but kept scaled to zero to save costs.
2. **DNS Failover:** Route53 health checks automatically route traffic to the secondary region if the primary region goes down.
3. **Deploy Microservices:** Trigger the CI/CD pipeline (GitHub Actions) to deploy the latest Docker images to the secondary cluster.

## 4. Testing the Plan
- **Frequency:** The DR plan must be tested quarterly.
- **Method:** A "Game Day" exercise where a synthetic failure is injected in the staging environment. The engineering team must execute the recovery steps and measure the RTO (Recovery Time Objective) against the 4-hour SLA.
