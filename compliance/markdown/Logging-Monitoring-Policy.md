# Logging & Monitoring Policy
**Version:** 1.0 | **Date:** February 2026 | **Company:** Index Commerce GmbH

## 1. Purpose

This policy defines logging and monitoring requirements for Superglue systems to enable security monitoring, incident detection, troubleshooting, and compliance.

## 2. Scope

This policy applies to:
- AWS infrastructure (EC2, RDS, Lambda, S3, etc.)
- Supabase databases and authentication
- GitHub repositories and CI/CD
- Application logs

## 3. Roles & Responsibilities

| Role | Responsibility |
|------|----------------|
| Stefan Faistenauer (CTO) | Log strategy, alert response, audit review |
| Nicolas Neudeck (Fallback) | Alert response, log analysis |
| All Team Members | Report anomalies, respond to assigned alerts |

**Alert Contact:** stefan@superglue.ai (primary), nicolas@superglue.ai (fallback)

## 4. Log Retention

### 4.1 Retention Requirements

| Log Type | Retention Period | Rationale |
|----------|------------------|-----------|
| Security logs (CloudTrail) | 1 year | Compliance, forensics |
| Application logs | 1 year | Troubleshooting, audit |
| Database logs | 1 year | Compliance, forensics |
| Access logs | 1 year | Security audit |
| Performance metrics | 90 days | Capacity planning |

### 4.2 Current CloudWatch Log Groups

| Log Group | Current Retention | Target Retention | Action |
|-----------|-------------------|------------------|--------|
| /aws/rds/cluster/superglue-prod/postgresql | Never expire | 365 days | Update |
| /aws/lambda/ts-api-function | Never expire | 365 days | Update |
| /aws/lambda/puppeteer_scraping | Never expire | 365 days | Update |
| /aws/lambda/selenium_python_scraping | Never expire | 365 days | Update |
| /aws/lambda/trigger_scraping_lambda_async | Never expire | 365 days | Update |
| /aws/lambda/vicompany-sftp-uploader | Never expire | 365 days | Update |
| /aws/transfer/s-77fd8ae087784ccf9 | Never expire | 365 days | Update |
| /aws/vendedlogs/events/event-bus/default | Never expire | 365 days | Update |
| /ecs/superglue | Never expire | 365 days | Update |
| RDSOSMetrics | 30 days | 90 days | Update |
| /aws/ecs/containerinsights | 1 day | 90 days | Update |

## 5. Logging Configuration

### 5.1 AWS CloudTrail

| Setting | Value |
|---------|-------|
| Trail Name | superglue-audit-trail |
| Multi-Region | Yes |
| S3 Bucket | superglue-cloudtrail-logs-277707112101 |
| Log File Validation | Enabled |
| Encryption | S3 default encryption |

**Events Logged:**
- All management events (API calls)
- S3 data events (optional, high volume)
- Lambda invocations

### 5.2 AWS CloudWatch Logs

| Source | Log Group | Content |
|--------|-----------|---------|
| RDS Aurora | /aws/rds/cluster/superglue-prod/postgresql | Database queries, errors |
| Lambda functions | /aws/lambda/* | Function execution, errors |
| ECS containers | /ecs/superglue | Application logs |
| SFTP Transfer | /aws/transfer/* | File transfer activity |
| EventBridge | /aws/vendedlogs/events/* | Event processing |

### 5.3 AWS GuardDuty

| Setting | Value |
|---------|-------|
| Status | Enabled |
| Detector ID | 44ce2b9319ead53804f3940b94de4108 |
| Finding Frequency | Every 15 minutes |

**Threat Detection:**
- Unauthorized access attempts
- Compromised instances
- Malicious IP communication
- Cryptocurrency mining
- Data exfiltration patterns

### 5.4 Supabase Logs

| Log Type | Retention | Access |
|----------|-----------|--------|
| API logs | 7 days | Dashboard |
| Auth logs | 7 days | Dashboard |
| Database logs | 7 days | Dashboard |
| Realtime logs | 7 days | Dashboard |

### 5.5 GitHub Audit Logs

| Log Type | Retention | Access |
|----------|-----------|--------|
| Organization audit log | 90 days | Org admins |
| Repository activity | Indefinite | Repo admins |
| Security alerts | Until resolved | Repo admins |

## 6. Monitoring & Alerting

### 6.1 CloudWatch Alarms

| Alarm | Metric | Threshold | Status |
|-------|--------|-----------|--------|
| app-superglue-cloud Health | HealthCheckStatus | < 1 | OK |
| graphql Health | HealthCheckStatus | < 1 | OK |
| CPU Utilization | CPUUtilization | > 80% | OK |
| EB Network High | NetworkOut | Auto-scaling | OK |
| EB Network Low | NetworkOut | Auto-scaling | ALARM (expected) |

### 6.2 Alert Routing

| Severity | Notification Method | Recipients |
|----------|---------------------|------------|
| Critical | Email + Slack | stefan@superglue.ai, nicolas@superglue.ai |
| High | Email | stefan@superglue.ai |
| Medium | CloudWatch console | Review weekly |
| Low | CloudWatch console | Review monthly |

**SNS Topic:** Default_CloudWatch_Alarms_Topic

### 6.3 GuardDuty Alert Response

| Finding Severity | Response Time | Action |
|------------------|---------------|--------|
| Critical | Immediate | Investigate, contain, escalate |
| High | 1 hour | Investigate, assess impact |
| Medium | 4 hours | Review, determine if action needed |
| Low | 24 hours | Log, review in weekly check |

## 7. Log Analysis

### 7.1 Regular Reviews

| Review Type | Frequency | Reviewer | Focus |
|-------------|-----------|----------|-------|
| GuardDuty findings | Weekly | Stefan/Nicolas | Security threats |
| CloudWatch alarms | Weekly | Stefan/Nicolas | System health |
| CloudTrail events | Monthly | Stefan | Unusual API activity |
| Access logs | Quarterly | Stefan | Access patterns |

### 7.2 Log Queries

**CloudWatch Logs Insights - Common Queries:**

```sql
-- Find errors in Lambda logs
fields @timestamp, @message
| filter @message like /ERROR/
| sort @timestamp desc
| limit 100

-- Find failed authentication attempts
fields @timestamp, @message
| filter @message like /authentication failed/
| sort @timestamp desc

-- Find slow database queries
fields @timestamp, @message
| filter @message like /duration:/
| parse @message /duration: * ms/ as duration
| filter duration > 1000
| sort duration desc
```

### 7.3 Security Event Investigation

When investigating security events:
1. Identify timeframe of suspicious activity
2. Query CloudTrail for API calls in that period
3. Check GuardDuty for related findings
4. Review application logs for context
5. Document findings and actions taken

## 8. Log Protection

### 8.1 Log Integrity

| Control | Implementation |
|---------|----------------|
| CloudTrail log validation | Enabled |
| S3 versioning on log bucket | Enabled |
| Log bucket access | Restricted to admins |
| Encryption | S3 default encryption |

### 8.2 Access to Logs

| Log Source | Who Can Access |
|------------|----------------|
| CloudTrail | Stefan, Nicolas (via AWS console) |
| CloudWatch | Stefan, Nicolas (via AWS console) |
| Supabase logs | Stefan, Nicolas, Michael (via dashboard) |
| GitHub audit logs | Stefan, Nicolas, Adina (org owners) |

## 9. Compliance Logging

### 9.1 Required Audit Events

| Event Type | Source | Retention |
|------------|--------|-----------|
| User authentication | Supabase, Google Workspace | 1 year |
| Access changes | AWS IAM, GitHub, Supabase | 1 year |
| Data access | CloudTrail, Supabase | 1 year |
| Configuration changes | CloudTrail | 1 year |
| Security events | GuardDuty, CloudTrail | 1 year |

### 9.2 Audit Log Contents

Logs must capture:
- Who (user identity)
- What (action performed)
- When (timestamp)
- Where (source IP, resource)
- Outcome (success/failure)

## 10. Planned Improvements

- [ ] Set 365-day retention on all CloudWatch log groups
- [x] Enable AWS Security Hub for centralized findings (Feb 2026)
- [ ] Configure SNS email notifications for GuardDuty critical findings
- [ ] Set up CloudWatch dashboard for key metrics
- [ ] Enable S3 access logging on critical buckets

## 11. Compliance

This policy supports:
- SOC 2 Type II (CC7.1 - CC7.4: System Operations)
- CAIQ (LOG: Logging and Monitoring)
- GDPR (Article 30: Records of processing)

## 12. Policy Review

This policy is reviewed annually or when:
- New systems are deployed
- Significant security events occur
- Compliance requirements change

---
**Approved by:** Stefan Faistenauer (CTO) | **Next Review:** February 2027
