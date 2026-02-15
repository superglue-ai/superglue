# Data Retention Policy
**Version:** 1.0 | **Date:** February 2026 | **Company:** Index Commerce GmbH

## 1. Purpose

This policy defines data retention periods for Superglue to ensure compliance with legal requirements, support business operations, and protect customer privacy.

## 2. Scope

This policy applies to all data processed and stored by Superglue, including:
- Customer data
- Application data
- Logs and audit trails
- Business records
- Employee data

## 3. Retention Schedule

### 3.1 Customer Data

| Data Type | Retention Period | Deletion Trigger |
|-----------|------------------|------------------|
| Active customer data | Duration of service | Account termination |
| Data after account deletion | 30 days | Account deletion request |
| Workflow configurations | Duration of service | Account termination |
| Integration credentials | Duration of service | Account termination or integration removal |

### 3.2 Application Data

| Data Type | Retention Period | Location |
|-----------|------------------|----------|
| Workflow execution history | 90 days | PostgreSQL (RDS/Supabase) |
| Workflow run results | 90 days | PostgreSQL + S3 |
| File uploads | 90 days after last use | S3 |
| Discovery runs | 90 days | PostgreSQL |

### 3.3 Logs & Audit Trails

| Log Type | Retention Period | Location |
|----------|------------------|----------|
| CloudTrail (API audit) | 1 year | S3 |
| CloudWatch application logs | 1 year | CloudWatch |
| RDS database logs | 1 year | CloudWatch |
| Lambda execution logs | 1 year | CloudWatch |
| Supabase logs | 7 days | Supabase (managed) |
| GitHub audit logs | 90 days | GitHub (managed) |

### 3.4 Business Records

| Record Type | Retention Period | Rationale |
|-------------|------------------|-----------|
| Invoices and billing | 10 years | German tax law (§147 AO) |
| Contracts and agreements | 10 years after termination | German commercial law |
| Financial records | 10 years | German tax law (§147 AO) |
| Vendor agreements | 10 years after termination | Legal requirements |

### 3.5 Employee Data

| Data Type | Retention Period | Rationale |
|-----------|------------------|-----------|
| Employment records | 10 years after termination | German labor law |
| Payroll records | 10 years | German tax law |
| Access logs | 1 year | Security audit |
| Training records | 3 years after employment | Compliance evidence |

### 3.6 Security Data

| Data Type | Retention Period | Location |
|-----------|------------------|----------|
| Security incident records | 3 years | Internal documentation |
| Vulnerability scan results | 1 year | Internal documentation |
| Penetration test reports | 3 years | Internal documentation |
| Access review records | 3 years | Internal documentation |

## 4. Retention by System

### 4.1 AWS

| Service | Data Type | Retention |
|---------|-----------|-----------|
| RDS (database-1) | Backups | 30 days |
| RDS Aurora | Backups | 7 days |
| S3 | CloudTrail logs | 1 year |
| S3 | Customer files | 90 days after last use |
| CloudWatch | Application logs | 1 year |
| CloudWatch | Performance metrics | 90 days |

### 4.2 Supabase

| Data Type | Retention |
|-----------|-----------|
| Customer data | Duration of service + 30 days |
| Database backups | 7 days (Supabase managed) |
| Logs | 7 days (Supabase managed) |

### 4.3 GitHub

| Data Type | Retention |
|-----------|-----------|
| Source code | Indefinite |
| Commit history | Indefinite |
| PR history | Indefinite |
| Audit logs | 90 days (GitHub managed) |

## 5. Data Deletion Procedures

### 5.1 Customer Data Deletion

When a customer requests account deletion:

| Step | Action | Timeline |
|------|--------|----------|
| 1 | Acknowledge request | Within 24 hours |
| 2 | Disable account access | Immediate |
| 3 | Delete from Supabase | Within 30 days |
| 4 | Delete from S3 | Within 30 days |
| 5 | Confirm deletion to customer | Within 30 days |

**Exceptions:** Data may be retained longer if required for:
- Legal obligations
- Ongoing disputes
- Fraud prevention

### 5.2 Automated Deletion

| Data Type | Automation |
|-----------|------------|
| CloudWatch logs | Automatic (retention policy set) |
| Old workflow runs | Manual cleanup (quarterly) |
| Expired OAuth tokens | Automatic (application logic) |

### 5.3 Manual Deletion

| Data Type | Process | Frequency |
|-----------|---------|-----------|
| Terminated customer data | Manual review and deletion | As requested |
| Old S3 objects | S3 lifecycle policy or manual | Quarterly review |
| Inactive integrations | Manual cleanup | Quarterly |

## 6. Legal Holds

### 6.1 When Legal Hold Applies

Data subject to legal hold must be preserved when:
- Litigation is pending or anticipated
- Regulatory investigation is ongoing
- Legal counsel advises preservation

### 6.2 Legal Hold Process

1. Legal counsel notifies CTO of hold requirement
2. Identify affected data and systems
3. Suspend automated deletion for affected data
4. Document hold scope and duration
5. Release hold only with legal counsel approval

## 7. GDPR Compliance

### 7.1 Data Subject Rights

| Right | Response Time | Process |
|-------|---------------|---------|
| Right to erasure | 30 days | Delete all personal data |
| Right to access | 30 days | Export and provide data |
| Right to portability | 30 days | Export in machine-readable format |

### 7.2 Deletion Verification

After deletion:
- Verify data removed from primary database
- Verify data removed from backups (within backup retention window)
- Document deletion completion
- Confirm to data subject

## 8. Backup Considerations

### 8.1 Backup Retention vs. Data Deletion

| System | Backup Retention | Impact on Deletion |
|--------|------------------|-------------------|
| RDS database-1 | 30 days | Data persists in backups up to 30 days |
| RDS Aurora | 7 days | Data persists in backups up to 7 days |
| Supabase | 7 days | Data persists in backups up to 7 days |

**Note:** When customer data is deleted, it will be fully purged after backup retention period expires.

### 8.2 Backup Restoration

If backup is restored after data deletion:
- Re-apply deletion for affected records
- Document restoration and re-deletion

## 9. Responsibilities

| Role | Responsibility |
|------|----------------|
| Stefan Faistenauer (CTO) | Policy oversight, legal hold decisions |
| Nicolas Neudeck | Technical implementation of retention |
| All Team Members | Follow retention guidelines, report issues |

## 10. Monitoring & Compliance

### 10.1 Retention Monitoring

| Check | Frequency | Responsible |
|-------|-----------|-------------|
| CloudWatch retention settings | Quarterly | Stefan/Nicolas |
| S3 lifecycle policies | Quarterly | Stefan/Nicolas |
| Customer deletion requests | As received | Stefan |
| Legal hold status | As needed | Stefan |

### 10.2 Compliance Verification

- Quarterly review of retention settings
- Annual policy review
- Audit of deletion request handling

## 11. Compliance

This policy supports:
- SOC 2 Type II (Processing Integrity)
- GDPR (Article 5: Storage limitation, Article 17: Right to erasure)
- German tax law (§147 AO: Aufbewahrungspflichten)

## 12. Policy Review

This policy is reviewed annually or when:
- Legal requirements change
- New data types are introduced
- Business needs change

---
**Approved by:** Stefan Faistenauer (CTO) | **Next Review:** February 2027
