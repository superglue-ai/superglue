# Security Review Calendar

**Document Owner:** Stefan Faistenauer (CTO)  
**Last Updated:** February 2026  
**Purpose:** Consolidated schedule of all security reviews, audits, and policy updates

---

## Quick Reference

| Frequency | Count | Key Activities |
|-----------|-------|----------------|
| Weekly | 3 | GuardDuty, CloudWatch, alerts |
| Monthly | 2 | CloudTrail, Dependabot |
| Quarterly | 12 | Access reviews, backups, vendors |
| Semi-Annual | 1 | High-risk vendor review |
| Annual | 15+ | All policies, training, DR test |

---

## Weekly Reviews

| Task | Reviewer | Source Policy |
|------|----------|---------------|
| GuardDuty findings review | Stefan/Nicolas | Logging & Monitoring Policy |
| CloudWatch alarms review | Stefan/Nicolas | Logging & Monitoring Policy |
| Security alerts triage | Stefan/Nicolas | Risk Assessment Policy |

**Schedule:** Every Monday morning

---

## Monthly Reviews

| Task | Reviewer | Source Policy |
|------|----------|---------------|
| CloudTrail unusual API activity | Stefan | Logging & Monitoring Policy |
| Dependabot findings review | Stefan/Nicolas | Risk Assessment Policy |

**Schedule:** First week of each month

---

## Quarterly Reviews

| Task | Reviewer | Due Months | Source Policy |
|------|----------|------------|---------------|
| User access review | Stefan | Mar, Jun, Sep, Dec | Access Control Policy |
| Privileged access review | Stefan | Mar, Jun, Sep, Dec | Access Control Policy |
| Service account review | Stefan | Mar, Jun, Sep, Dec | Access Control Policy |
| Access logs patterns review | Stefan | Mar, Jun, Sep, Dec | Logging & Monitoring Policy |
| S3 bucket encryption check | Stefan/Nicolas | Mar, Jun, Sep, Dec | Encryption Policy |
| RDS encryption status check | Stefan/Nicolas | Mar, Jun, Sep, Dec | Encryption Policy |
| CloudWatch retention settings | Stefan/Nicolas | Mar, Jun, Sep, Dec | Data Retention Policy |
| S3 lifecycle policies | Stefan/Nicolas | Mar, Jun, Sep, Dec | Data Retention Policy |
| RDS snapshot restore test | Stefan/Nicolas | Mar, Jun, Sep, Dec | Backup & Recovery Policy |
| S3 version recovery test | Stefan/Nicolas | Mar, Jun, Sep, Dec | Backup & Recovery Policy |
| Vendor review (Critical) | Stefan | Mar, Jun, Sep, Dec | Vendor Management Policy |
| Old S3 objects cleanup | Stefan/Nicolas | Mar, Jun, Sep, Dec | Data Retention Policy |

**Schedule:** Last week of March, June, September, December

### Quarterly Review Checklist

```
□ Access Reviews
  □ Export current user list from all systems
  □ Verify each user still requires access
  □ Check privileged access justification
  □ Review service account permissions
  □ Document findings and actions taken

□ Encryption & Data
  □ Verify S3 bucket encryption enabled
  □ Check RDS encryption status
  □ Review CloudWatch log retention
  □ Check S3 lifecycle policies active

□ Backup Testing
  □ Perform RDS snapshot restore test
  □ Test S3 version recovery
  □ Document recovery time achieved

□ Vendor Review (Critical vendors)
  □ AWS - Check compliance certifications
  □ Supabase - Review security updates
  □ GitHub - Check security advisories
```

---

## Semi-Annual Reviews

| Task | Reviewer | Due Months | Source Policy |
|------|----------|------------|---------------|
| High-risk vendor review | Stefan | Jun, Dec | Vendor Management Policy |

**Vendors:** Google Workspace, 1Password, Vercel

---

## Annual Reviews (January)

### Policy Reviews

| Policy | Owner | Next Review |
|--------|-------|-------------|
| Information Security Policy | Stefan | January 2027 |
| Access Control Policy | Stefan | February 2027 |
| Data Retention Policy | Stefan | February 2027 |
| Encryption Policy | Stefan | February 2027 |
| Security Awareness Training Policy | Stefan | February 2027 |
| Secure Development Policy | Stefan | February 2027 |
| Acceptable Use Policy | Stefan | February 2027 |
| Logging & Monitoring Policy | Stefan | February 2027 |
| Backup & Recovery Policy | Stefan | February 2027 |
| Change Management Policy | Stefan | February 2027 |
| Risk Assessment Policy | Stefan | February 2027 |
| Incident Response Plan | Stefan | January 2027 |
| Vendor Management Policy | Stefan | Q2 2026 |
| Privacy Policy | Stefan | As needed |

### Annual Activities

| Task | Reviewer | Month | Source Policy |
|------|----------|-------|---------------|
| Full risk assessment | Stefan, Nicolas | January | Risk Assessment Policy |
| Security awareness training (refresher) | All team | January | Security Awareness Training Policy |
| Full DR simulation | Stefan, Nicolas | January | Backup & Recovery Policy |
| Penetration testing | External vendor | TBD | Secure Development Policy |
| SOC 2 audit preparation | Stefan | Per audit schedule | Information Security Policy |
| AWS KMS key rotation | AWS (automatic) | Continuous | Encryption Policy |
| Master encryption key rotation | Stefan | January | Encryption Policy |
| API keys rotation review | Stefan | January | Encryption Policy |
| Medium-risk vendor review | Stefan | January | Vendor Management Policy |

### Annual Review Checklist

```
□ Policy Updates
  □ Review all policies for accuracy
  □ Update based on infrastructure changes
  □ Update based on team changes
  □ Get CTO approval on changes
  □ Communicate updates to team

□ Risk Assessment
  □ Review current risk register
  □ Identify new risks
  □ Update risk ratings
  □ Review treatment plans
  □ Document accepted risks

□ Training
  □ Schedule annual refresher training
  □ Update training materials
  □ Track completion
  □ Document acknowledgments

□ DR Testing
  □ Plan full DR simulation
  □ Execute simulation
  □ Document results
  □ Update procedures based on findings

□ Vendor Review
  □ Review all vendor contracts
  □ Check compliance certifications
  □ Assess continued need
  □ Update vendor inventory
```

---

## Calendar View 2026

### Q1 (January - March)

| Month | Week | Activities |
|-------|------|------------|
| **January** | 1 | Annual risk assessment kickoff |
| | 2 | Security awareness training (refresher) |
| | 3 | Full DR simulation |
| | 4 | Policy reviews begin |
| **February** | 1-2 | Policy reviews continue |
| | 3-4 | Complete policy updates |
| **March** | 1-3 | Normal operations |
| | 4 | **Q1 Quarterly Reviews** |

### Q2 (April - June)

| Month | Week | Activities |
|-------|------|------------|
| **April** | All | Normal operations |
| **May** | All | Normal operations |
| **June** | 1-2 | Semi-annual vendor review (High-risk) |
| | 4 | **Q2 Quarterly Reviews** |

### Q3 (July - September)

| Month | Week | Activities |
|-------|------|------------|
| **July** | All | Normal operations |
| **August** | All | Normal operations |
| **September** | 4 | **Q3 Quarterly Reviews** |

### Q4 (October - December)

| Month | Week | Activities |
|-------|------|------------|
| **October** | All | Normal operations |
| **November** | All | Prepare for annual reviews |
| **December** | 1-2 | Semi-annual vendor review (High-risk) |
| | 4 | **Q4 Quarterly Reviews** |

---

## Responsibilities

| Role | Responsibilities |
|------|------------------|
| **Stefan Faistenauer (CTO)** | All policy reviews, risk assessment, privileged access reviews, vendor management |
| **Nicolas Neudeck** | Technical reviews, backup testing, encryption checks, alert monitoring |
| **All Team Members** | Complete annual training, acknowledge policies |

---

## Review Triggers (Ad-hoc)

Reviews may also be triggered by:

- Security incidents
- Significant infrastructure changes
- New regulatory requirements
- Team member changes (onboarding/offboarding)
- Vendor security incidents
- Failed backup/recovery tests
- Audit findings

---

## Documentation

All reviews should be documented with:

1. Date of review
2. Reviewer name
3. Scope of review
4. Findings
5. Actions taken
6. Follow-up items

Store documentation in: `itsec-documents/review-records/`

---

## Reminders Setup

Recommended calendar reminders:

| Reminder | Frequency | Lead Time |
|----------|-----------|-----------|
| Weekly reviews | Weekly | Monday 9am |
| Monthly reviews | Monthly | 1st of month |
| Quarterly reviews | Quarterly | 1 week before |
| Annual reviews | Annually | 2 weeks before |
| Policy renewals | Per policy | 30 days before |

---

**Document Version:** 1.0  
**Created:** February 2026  
**Approved by:** Stefan Faistenauer (CTO)
