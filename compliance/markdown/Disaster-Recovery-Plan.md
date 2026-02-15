# Disaster Recovery Plan
**Version:** 1.0 | **Date:** February 2026 | **Company:** Index Commerce GmbH

## 1. Purpose

This plan defines procedures for recovering Superglue systems and data following a disaster or major service disruption.

## 2. Scope

This plan covers all production systems including AWS infrastructure (EC2, RDS, S3, Lambda), Supabase authentication and database, and supporting services.

## 3. Contacts

| Role | Name | Contact |
|------|------|---------|
| Incident Manager | Stefan Faistenauer | stefan@superglue.ai |
| Fallback | Nicolas Neudeck | nicolas@superglue.ai |
| AWS Support | - | AWS Console |
| Supabase Support | - | support@supabase.io |

**Status Page:** status.superglue.cloud

## 4. Recovery Objectives

### 4.1 Recovery Time Objective (RTO)

| Priority | Systems | RTO |
|----------|---------|-----|
| Critical | Aurora DB, main EC2, scheduler, ALBs | 1 hour |
| High | database-1, billing-service, Lambda | 4 hours |
| Medium | dev/files, metabase, SFTP | 8 hours |
| Low | webscraping, test instances | 24 hours |

### 4.2 Recovery Point Objective (RPO)

| System | RPO | Backup Method |
|--------|-----|---------------|
| Aurora superglue-prod | 24 hours | Daily automated snapshot |
| RDS database-1 | 24 hours | Daily automated snapshot |
| S3 buckets | Near-zero | Versioning enabled |
| Supabase | 24 hours | Daily managed backup |
| Source code | Near-zero | Git version control |

## 5. Disaster Scenarios

### 5.1 Single Service Failure

**Database Failure**
- Automatic failover to Multi-AZ standby (RDS/Aurora)
- If failover fails, restore from latest snapshot

**EC2 Instance Failure**
- ALB automatically routes traffic to healthy instances
- Replace failed instance from deployment pipeline

**S3 Unavailability**
- AWS-managed redundancy handles most failures
- Contact AWS Support for regional S3 issues

### 5.2 Availability Zone Failure

- Multi-AZ database deployment provides automatic failover
- ALB routes traffic to instances in healthy AZs
- No manual intervention required for most AZ failures

### 5.3 Regional Failure (us-east-1)

**Short Outage (< 4 hours):**
1. Update status page immediately
2. Monitor AWS Service Health Dashboard
3. Notify customers of estimated recovery time
4. Verify all services after AWS recovery

**Extended Outage (> 4 hours):**
1. Declare disaster and activate DR procedures
2. Restore database to us-west-2 from latest snapshot
3. Deploy application to us-west-2
4. Update DNS to point to new region
5. Notify customers of failover
6. Verify all services operational

### 5.4 Data Corruption

1. Identify scope of corruption
2. Stop writes to affected systems
3. Restore from point-in-time backup before corruption
4. Validate data integrity
5. Resume operations

### 5.5 Security Breach

1. Follow Incident Response Plan
2. Isolate affected systems
3. Assess data exposure
4. Restore from clean backup if needed
5. Notify affected customers (GDPR: 72 hours for breaches)

## 6. Recovery Procedures

### 6.1 RDS Database Recovery

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
  --db-instance-class db.m7g.large \
  --vpc-security-group-ids <security-group-id>
```

**Point-in-Time Recovery:**
```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier database-1 \
  --target-db-instance-identifier database-1-pitr \
  --restore-time 2026-02-13T10:00:00Z
```

### 6.2 Aurora Cluster Recovery

```bash
# Restore Aurora cluster from snapshot
aws rds restore-db-cluster-from-snapshot \
  --db-cluster-identifier superglue-prod-restored \
  --snapshot-identifier <snapshot-id> \
  --engine aurora-postgresql \
  --vpc-security-group-ids <security-group-id>

# Create instance in restored cluster
aws rds create-db-instance \
  --db-instance-identifier superglue-prod-restored-instance \
  --db-cluster-identifier superglue-prod-restored \
  --db-instance-class db.r6g.large \
  --engine aurora-postgresql
```

### 6.3 Cross-Region Database Recovery

```bash
# Copy snapshot to DR region
aws rds copy-db-snapshot \
  --source-db-snapshot-identifier arn:aws:rds:us-east-1:277707112101:snapshot:<snapshot-id> \
  --target-db-snapshot-identifier dr-snapshot \
  --source-region us-east-1 \
  --region us-west-2

# Restore in DR region
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier database-1-dr \
  --db-snapshot-identifier dr-snapshot \
  --region us-west-2
```

### 6.4 S3 Object Recovery

**Recover Deleted Object:**
```bash
# List object versions
aws s3api list-object-versions \
  --bucket sg-prd-files \
  --prefix path/to/file

# Restore specific version
aws s3api copy-object \
  --bucket sg-prd-files \
  --copy-source sg-prd-files/path/to/file?versionId=<version-id> \
  --key path/to/file
```

### 6.5 Application Recovery

EC2 instances are stateless. Recovery involves redeployment:

1. Verify database connectivity
2. Trigger deployment from GitHub Actions
3. Verify health checks pass
4. Confirm ALB routing traffic to new instances

### 6.6 Supabase Recovery

1. Check Supabase status page for service issues
2. For data recovery, contact Supabase support
3. Request point-in-time recovery if needed
4. Verify authentication functioning after recovery

## 7. Communication Plan

### 7.1 Client Escalation Plan

When a disaster impacts clients, the following escalation process is followed:

| Severity | Trigger | Escalation |
|----------|---------|------------|
| Level 1 | Service degradation | Engineering team notified, status page updated |
| Level 2 | Service outage > 15 min | Incident Manager engaged, customer email sent |
| Level 3 | Extended outage > 1 hour | Direct customer contact, executive notification |
| Level 4 | Disaster declared | All hands response, continuous customer updates |

Clients can escalate issues directly to the Incident Manager (Stefan Faistenauer, stefan@superglue.ai) or Fallback (Nicolas Neudeck, nicolas@superglue.ai) if standard support channels are unavailable during a disaster.

### 7.2 Internal Communication

| Trigger | Action |
|---------|--------|
| Service degradation | Notify via Slack #engineering |
| Service outage | Incident Manager coordinates response |
| Disaster declared | All hands response, continuous updates |

### 7.3 Client Communication Plan

Impacted clients are notified through the following documented process:

| Trigger | Action | Timeline |
|---------|--------|----------|
| Service degradation | Update status page | Immediate |
| Service outage > 15 min | Status page + customer email | Within 15 minutes |
| Disaster declared | Status page + direct customer contact | Within 30 minutes |
| Data breach | Direct notification to affected customers | Within 72 hours (GDPR) |
| Recovery complete | Resolution summary to all affected customers | Within 24 hours of recovery |

**Communication Channels:**
- Status page: status.superglue.cloud (primary, real-time updates)
- Email: Direct notification to customer contacts
- Direct contact: Phone/video call for critical customers during major incidents

### 7.4 Status Page Updates

- Update immediately upon incident detection
- Provide estimated recovery time when known
- Update every 30 minutes during active incident
- Post resolution summary after recovery

## 8. DR Site Information

### 8.1 Disaster Recovery Provider

AWS serves as the infrastructure provider. The DR site is AWS us-west-2 (Oregon), a fully operational AWS region with the same services available as the primary region. No third-party DR provider is used; all DR capabilities are provided through AWS's multi-region infrastructure.

### 8.2 DR Site Locations

| | Primary | DR Site |
|--|---------|---------|
| Region | us-east-1 (N. Virginia) | us-west-2 (Oregon) |
| Country | United States | United States |
| Distance | - | ~2,350 miles |
| Activation | Active | On-demand |
| Data Sync | - | Snapshot copy |

All disaster recovery locations are within the United States. No DR sites exist outside the University Data Zone. Data is never recovered to locations outside the US.

### 8.3 DR Site Activation

The DR site is activated on-demand when a regional disaster is declared. Activation involves copying database snapshots to us-west-2, deploying application infrastructure, and updating DNS routing. The DR site uses the same AWS account and security controls as the primary site.

## 9. Testing

### 9.1 Annual DR Site Relocation Test

The organization conducts an annual test of relocating to the DR site. This test validates the ability to fully recover operations in us-west-2 if the primary region becomes unavailable. The annual DR simulation includes executing cross-region snapshot copy procedures, deploying application infrastructure in us-west-2, verifying application functionality in the DR region, measuring actual recovery time against RTO objectives, and documenting lessons learned for plan improvement.

### 9.2 Test Schedule

| Test Type | Frequency | Participants |
|-----------|-----------|--------------|
| Backup restore | Quarterly | Stefan or Nicolas |
| Failover test | Annually | Stefan and Nicolas |
| Full DR simulation | Annually | Stefan and Nicolas |
| Tabletop exercise | Annually | All team members |

### 9.2 Test Procedures

**Quarterly Backup Test:**
1. Select recent automated snapshot
2. Restore to test instance
3. Verify connectivity and data integrity
4. Document results
5. Delete test instance

**Annual DR Simulation:**
1. Simulate regional failure scenario
2. Execute cross-region recovery procedures
3. Verify application functionality in DR region
4. Document recovery time achieved
5. Identify improvements

### 9.3 Test Log

| Date | Test Type | Result | Duration | Issues | Tester |
|------|-----------|--------|----------|--------|--------|
| Q1 2026 | Backup restore | Scheduled | - | - | Stefan |
| Q2 2026 | DR simulation | Scheduled | - | - | Stefan, Nicolas |

## 10. Plan Maintenance

### 10.1 Review Schedule

This plan is reviewed:
- Annually (minimum)
- After any disaster recovery event
- After significant infrastructure changes
- After failed DR tests

### 10.2 Update Triggers

- New systems added to production
- Changes to backup procedures
- Changes to recovery objectives
- Lessons learned from incidents or tests

## 11. Appendix

### 11.1 AWS Account Information

- Account ID: 277707112101
- Primary Region: us-east-1
- DR Region: us-west-2

### 11.2 Critical Resources

| Resource | Identifier | Priority |
|----------|------------|----------|
| Aurora Cluster | superglue-prod | Critical |
| RDS Instance | database-1 | High |
| ALB | superglue-loadbalancer | Critical |
| S3 | sg-prd-files | High |

### 11.3 Related Documents

- Backup-Recovery-Policy
- Incident-Response-Plan
- Information-Security-Policy
- System-Architecture

---
**Approved by:** Stefan Faistenauer (CTO) | **Next Review:** February 2027
