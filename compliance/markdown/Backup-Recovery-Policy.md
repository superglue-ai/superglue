# Backup & Recovery Policy
**Version:** 1.0 | **Date:** February 2026 | **Company:** Index Commerce GmbH

## 1. Purpose

This policy defines backup and recovery procedures for Superglue systems to ensure data protection and business continuity.

## 2. Scope

This policy covers:
- AWS RDS databases (PostgreSQL, Aurora)
- Supabase databases
- S3 storage buckets
- Application source code (GitHub)
- Configuration and secrets

## 3. Recovery Objectives

### 3.1 Recovery Time Objective (RTO)

| Priority | Systems | RTO |
|----------|---------|-----|
| Critical | Aurora DB, main EC2, scheduler, ALBs | 1 hour |
| High | database-1, billing-service, Lambda | 4 hours |
| Medium | dev/files, metabase, SFTP | 8 hours |
| Low | webscraping, test instances | 24 hours |

### 3.2 Recovery Point Objective (RPO)

| System | RPO | Backup Frequency |
|--------|-----|------------------|
| RDS database-1 | 24 hours | Daily automated |
| Aurora superglue-prod | 24 hours | Daily automated |
| S3 buckets | Near-zero | Versioning enabled |
| Supabase | 24 hours | Daily (Supabase managed) |
| Source code | Near-zero | Git commits |

## 4. Backup Configuration

### 4.1 RDS Databases

| Database | Type | Retention | Multi-AZ | Encrypted |
|----------|------|-----------|----------|-----------|
| database-1 | PostgreSQL | 30 days | Yes | Yes (KMS) |
| superglue-prod | Aurora PostgreSQL | 7 days | Yes (2 AZs) | Yes (KMS) |

**Backup Window:** Automated daily backups at ~04:54 UTC

**Features:**
- Automated daily snapshots
- Point-in-time recovery (PITR) available
- Cross-AZ replication for Aurora
- Encryption at rest with AWS KMS

### 4.2 S3 Buckets

| Bucket | Purpose | Versioning | Encryption |
|--------|---------|------------|------------|
| sg-prd-files | Production files | Enabled | AES256 |
| sg-customer-test | Customer test data | Enabled | AES256 |
| superglue-hosted-setup | Hosted setup files | Enabled | AES256 |
| lambda-code-zip-location | Lambda deployments | Enabled | AES256 |
| superglue-cloudtrail-logs | Audit logs | Enabled | AES256 |
| elasticbeanstalk-us-east-1 | Legacy EB | Enabled | AES256 |

**Versioning:** Enabled on all production buckets to allow recovery of deleted or overwritten objects.

### 4.3 Supabase

| Component | Backup | Retention |
|-----------|--------|-----------|
| PostgreSQL | Daily automated | 7 days (Pro plan) |
| Auth data | Included in DB backup | 7 days |
| Storage | Included in DB backup | 7 days |

**Note:** Supabase manages backups automatically. Point-in-time recovery available via support request.

### 4.4 Source Code

| Repository | Backup Method | Retention |
|------------|---------------|-----------|
| All repos | Git version control | Indefinite |
| GitHub | GitHub redundancy | Indefinite |

**Note:** Git provides inherent versioning. GitHub maintains redundant copies across data centers.

### 4.5 Secrets & Configuration

| Item | Storage | Backup |
|------|---------|--------|
| API keys | AWS Secrets Manager | AWS managed |
| Environment variables | AWS Secrets Manager | AWS managed |
| Team credentials | 1Password | 1Password managed |

## 5. Recovery Procedures

### 5.1 RDS Database Recovery

**From Automated Snapshot:**
```bash
# List available snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier database-1 \
  --query 'DBSnapshots[*].[DBSnapshotIdentifier,SnapshotCreateTime]'

# Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier database-1-restored \
  --db-snapshot-identifier <snapshot-id> \
  --db-instance-class db.m7g.large
```

**Point-in-Time Recovery:**
```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier database-1 \
  --target-db-instance-identifier database-1-pitr \
  --restore-time 2026-02-13T10:00:00Z
```

### 5.2 Aurora Cluster Recovery

```bash
# Restore Aurora cluster from snapshot
aws rds restore-db-cluster-from-snapshot \
  --db-cluster-identifier superglue-prod-restored \
  --snapshot-identifier <snapshot-id> \
  --engine aurora-postgresql

# Create instance in restored cluster
aws rds create-db-instance \
  --db-instance-identifier superglue-prod-restored-instance \
  --db-cluster-identifier superglue-prod-restored \
  --db-instance-class db.r6g.large \
  --engine aurora-postgresql
```

### 5.3 S3 Object Recovery

**Recover Deleted Object:**
```bash
# List object versions (including delete markers)
aws s3api list-object-versions \
  --bucket sg-prd-files \
  --prefix path/to/file

# Restore specific version
aws s3api copy-object \
  --bucket sg-prd-files \
  --copy-source sg-prd-files/path/to/file?versionId=<version-id> \
  --key path/to/file
```

**Recover Overwritten Object:**
```bash
# Same process - copy the previous version back
aws s3api copy-object \
  --bucket sg-prd-files \
  --copy-source sg-prd-files/path/to/file?versionId=<previous-version-id> \
  --key path/to/file
```

### 5.4 Supabase Recovery

1. Contact Supabase support for point-in-time recovery
2. Or restore from daily backup via dashboard
3. For self-managed recovery: export data via API before incident

### 5.5 EC2 Instance Recovery

EC2 instances are stateless - redeploy from GitHub:

```bash
# Clone repository
git clone <repo-url>

# Deploy application
# (Follow deployment runbook)
```

**Note:** No AMI backups maintained. All application state is in databases.

## 6. Backup Testing

### 6.1 Testing Schedule

| Test Type | Frequency | Responsible |
|-----------|-----------|-------------|
| RDS snapshot restore | Quarterly | Stefan or Nicolas |
| S3 version recovery | Quarterly | Stefan or Nicolas |
| Full DR simulation | Annually | Stefan and Nicolas |

### 6.2 Quarterly Test Procedure

**RDS Restore Test:**
1. Select a recent automated snapshot
2. Restore to a new instance (test-restore-YYYYMMDD)
3. Verify database connectivity
4. Run sample queries to verify data integrity
5. Document test results
6. Delete test instance

**S3 Recovery Test:**
1. Upload a test file to versioned bucket
2. Delete or overwrite the file
3. Recover using version history
4. Verify file integrity
5. Document test results

### 6.3 Test Documentation

Each test must document:
- [ ] Date and time of test
- [ ] Systems tested
- [ ] Recovery steps performed
- [ ] Time to recover
- [ ] Issues encountered
- [ ] Pass/Fail result

### 6.4 Test Log

| Date | Test Type | System | Result | Duration | Tester |
|------|-----------|--------|--------|----------|--------|
| Q1 2026 | RDS Restore | database-1 | Scheduled | - | Stefan |
| Q1 2026 | S3 Recovery | sg-prd-files | Scheduled | - | Stefan |
| Q2 2026 | Full DR Simulation | All critical | Scheduled | - | Stefan, Nicolas |

**Note:** Testing program established February 2026. First quarterly tests to be conducted by end of Q1 2026.

## 7. Disaster Recovery

### 7.1 Single-Region Architecture

Current architecture is single-region (us-east-1). In case of region failure:

**Short Outage (< 4 hours):**
- Update status page
- Wait for AWS recovery
- Verify all services after recovery

**Extended Outage (> 4 hours):**
- Restore RDS from snapshot in alternate region
- Deploy application to alternate region
- Update DNS/load balancer
- Notify customers

### 7.2 DR Runbook Location

Detailed DR procedures in: [Incident Response Plan](Incident-Response-Plan.md)

## 8. Roles & Responsibilities

| Role | Responsibility |
|------|----------------|
| Stefan Faistenauer | Backup strategy, DR planning, test oversight |
| Nicolas Neudeck | Backup testing, recovery execution |
| AWS | Automated backup execution, infrastructure |
| Supabase | Database backup management |

## 9. Monitoring & Alerts

| Check | Method | Alert |
|-------|--------|-------|
| RDS backup completion | CloudWatch Events | On failure |
| Snapshot retention | Manual quarterly review | N/A |
| S3 versioning status | AWS Config (if enabled) | On change |

## 10. Compliance

This policy supports:
- SOC 2 Type II (A1.2: Recovery procedures)
- CAIQ (BCR: Business Continuity and Resilience)
- GDPR (Data availability requirements)

## 11. Policy Review

This policy is reviewed annually or after:
- Significant infrastructure changes
- Recovery test failures
- Actual disaster recovery events

---
**Approved by:** Stefan Faistenauer (CTO) | **Next Review:** February 2027
