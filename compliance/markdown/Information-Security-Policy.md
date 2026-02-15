# Information Security Policy
**Version:** 3.0 | **Date:** January 2026 | **Company:** Index Commerce GmbH

## 1. Overview

This policy defines security requirements for Superglue's workflow automation platform.

**Scope:** All employees, contractors, cloud infrastructure (AWS us-east-1), and customer data (Supabase).

**Contacts:**
- CTO: Stefan Faistenauer (stefan@superglue.ai)
- Fallback: Nicolas Neudeck (nicolas@superglue.ai)

## 2. Security Objectives

- **Confidentiality:** Protect sensitive data from unauthorized access
- **Integrity:** Ensure data accuracy and completeness
- **Availability:** Maintain system uptime for customers

## 3. Infrastructure

### AWS (Account: 277707112101, Region: us-east-1)
| Service | Count | Security |
|---------|-------|----------|
| Load Balancers | 2 | TLS termination |
| EC2 | 8 | SSH keys, Security Groups |
| RDS Aurora | 2 | Encrypted, Multi-AZ |
| S3 | 8 | AES256 encryption |
| Lambda | 3 | Node.js 18/22 |

### Supabase
- Authentication (JWT, OAuth)
- Row-Level Security for multi-tenancy

### External Services
- GitHub (source control, CI/CD)
- Docker Hub (container registry)
- PostHog (analytics)

## 4. Security Controls

### Access Control
- AWS IAM with MFA on root
- SSH key authentication
- Supabase JWT + RLS
- Secrets in AWS Secrets Manager

### Network Security
- VPC with Security Groups (14 groups)
- TLS for all connections (ACM certificates)
- ALB health checks

### Data Security
- Encryption at rest (RDS, S3 via KMS)
- Encryption in transit (TLS)
- Automated backups (RDS: 7-30 days)

### Development Security
- GitHub Actions CI/CD
- Dependabot security updates
- Secret scanning enabled
- Branch protection rules

## 5. **Monitoring**

| Service | Status |
|---------|--------|
| CloudWatch | 11 log groups, 5 alarms |
| CloudTrail | Enabled (multi-region) |
| GuardDuty | Enabled |
| Security Hub | Enabled |
| WAF | Enabled - COUNT mode |

## 6. Data Classification

| Level | Examples | Protection |
|-------|----------|------------|
| Strictly Confidential | API keys, credentials, PII | KMS encryption, MFA, audit logs |
| Confidential | Customer data, source code | Encryption, access control |
| Internal | Logs, configs | Access control |
| Public | Docs, marketing | None |

## 7. Incident Response

Report security incidents immediately to CTO via Slack or stefan@superglue.ai.

**Severity Levels:**
- **Critical:** Data breach, ransomware → Immediate response
- **High:** Compromised account, data leak → 1 hour
- **Medium:** Suspicious activity → 4 hours
- **Low:** Policy violation → 24 hours

See Incident Response Plan for detailed procedures.

## 8. Change Management

All code and infrastructure changes follow this process:

| Change Type | Process | Approval |
|-------------|---------|----------|
| Code changes | PR → Review → CI tests → Merge | 1 reviewer required |
| Dependencies | Dependabot PR → Review → Merge | 1 reviewer |
| Infrastructure | Terraform/Console → Review → Apply | CTO approval |
| Emergency fixes | Hotfix → Deploy → Post-review | CTO notification |

**Controls:**
- Branch protection on `main` (no direct pushes)
- GitHub Actions CI runs on all PRs
- Dependabot for security updates
- CloudTrail logs all AWS changes

## 9. Human Resources Security

### Onboarding
- Access granted based on role (least privilege)
- Security policy acknowledgment required
- 1Password account provisioned
- MFA enabled on all accounts

### Offboarding
- Access revoked within 24 hours
- SSH keys removed
- AWS IAM credentials disabled
- MacBook wiped (see Data Disposal Procedures)

## 10. Vulnerability Management

- **Dependabot:** Automatic security PRs for dependencies
- **npm audit:** Run in CI pipeline
- **GitHub Secret Scanning:** Enabled on all repos
- **GuardDuty:** Continuous threat detection
- **Patch timeline:** Critical within 48h, High within 7 days

## 11. Endpoint Security

All team MacBooks must have:
- FileVault encryption enabled
- Firewall enabled
- Automatic updates enabled
- Screen lock after 5 minutes
- 1Password for credential management

## 12. Compliance

- GDPR (data protection)
- SOC 2 Type II (in progress via Delve)

## 13. Training

Annual security training for all team members.

## 14. Policy Review

Reviewed annually. Violations may result in disciplinary action.

---
**Approved by:** Stefan Faistenauer (CTO) | **Next Review:** January 2027
