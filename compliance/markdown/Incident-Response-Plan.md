# Incident Response & Business Continuity Plan
**Version:** 3.0 | **Date:** January 2026 | **Company:** Index Commerce GmbH

## 1. Contacts

| Role | Name | Contact |
|------|------|---------|
| Incident Manager | Stefan Faistenauer | stefan@superglue.ai |
| Fallback | Nicolas Neudeck | nicolas@superglue.ai |
| AWS Support | - | Console |
| Supabase Support | - | support@supabase.io |

**Status Page:** status.superglue.cloud

## 2. Incident Classification

| Severity | Examples | Response Time |
|----------|----------|---------------|
| Critical | Ransomware, data breach, full outage | Immediate |
| High | Compromised account, partial outage | 1 hour |
| Medium | Suspicious activity, degraded service | 4 hours |
| Low | Policy violation, failed logins | 24 hours |

## 3. Response Process

### Detection
- CloudWatch alarms
- GuardDuty alerts
- User reports
- Vendor notifications

### Response Steps
1. **Verify** - Confirm the incident is real
2. **Assess** - Determine scope and severity
3. **Contain** - Isolate affected systems
4. **Eradicate** - Remove threat
5. **Recover** - Restore services
6. **Learn** - Post-mortem within 48h

### Communication
- Internal: Slack #engineering
- External: Status page, then customer email
- Authorities: After legal review (GDPR 72h for breaches)

## 4. Incident Playbooks

### API Key Compromise
1. Rotate keys in AWS Secrets Manager
2. Check CloudTrail for unauthorized access
3. Notify affected customers
4. Post-mortem

### AWS Account Compromise
1. Check root MFA
2. Rotate all IAM keys
3. Review CloudTrail logs
4. Terminate unauthorized resources
5. Contact AWS Support

### Database Breach
1. Check RDS/Supabase logs
2. Rotate credentials
3. Assess data exposure
4. Notify customers (GDPR 72h if PII)

### EC2 Instance Compromise
1. Isolate via Security Group
2. Create AMI snapshot for forensics
3. Terminate and replace instance

## 5. Business Continuity

### Recovery Priorities

| Priority | RTO | Systems |
|----------|-----|---------|
| Critical | 1h | Aurora DB, main EC2, scheduler, ALBs |
| High | 4h | database-1, billing-service, Lambda |
| Medium | 8h | dev/files, metabase, SFTP |
| Low | 24h | webscraping, test instances |

### Backup Status

| Resource | Retention | Recovery |
|----------|-----------|----------|
| RDS database-1 | 30 days | Restore from snapshot |
| Aurora cluster | 7 days | Restore from snapshot |
| S3 buckets | No versioning | Contact AWS if deleted |
| EC2 instances | No AMIs | Redeploy from GitHub |

### AWS Region Outage (us-east-1)
- Update status page immediately
- For short outages: Wait for AWS recovery
- For extended outages: Spin up infrastructure in alternate region
- Verify all services after recovery

### Supabase Outage
- Check Supabase status page
- Pause workflow queue
- Resume after recovery

## 6. Recovery Commands

```bash
# Restore RDS from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier database-1-restored \
  --db-snapshot-identifier <snapshot-id>

# Export CloudWatch logs for forensics
aws logs create-export-task \
  --log-group-name /aws/rds/cluster/superglue-prod/postgresql \
  --destination evidence-bucket

# Snapshot EC2 for forensics
aws ec2 create-image --instance-id <id> --name "forensic-$(date +%Y%m%d)"
```

## 7. Post-Incident

- Document timeline and actions
- Identify root cause
- Update playbooks
- Implement improvements

## 8. Testing & Exercises

### 8.1 Tabletop Exercises
Annual tabletop exercises to test incident response procedures.

| Date | Exercise Type | Scenario | Status |
|------|--------------|----------|--------|
| Q2 2026 | Tabletop | Data breach scenario | Scheduled |
| Q2 2026 | Tabletop | Ransomware scenario | Scheduled |

### 8.2 Exercise Log

| Date | Type | Scenario | Participants | Findings | Actions |
|------|------|----------|--------------|----------|---------|
| - | - | - | - | - | - |

**Note:** Tabletop exercise program established February 2026. First exercises scheduled for Q2 2026.

---
**Approved by:** Stefan Faistenauer (CTO) | **Next Review:** January 2027
