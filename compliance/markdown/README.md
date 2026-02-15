# Superglue Security Documentation

## Documents

| Document | Purpose | SOC 2 |
|----------|---------|-------|
| [Information Security Policy](Information-Security-Policy.md) | Main security policy | Required |
| [Access Control Policy](Access-Control-Policy.md) | User access management | Required |
| [Risk Assessment Policy](Risk-Assessment-Policy.md) | Risk identification & management | Required |
| [Change Management Policy](Change-Management-Policy.md) | Code & infrastructure changes | Required |
| [Backup & Recovery Policy](Backup-Recovery-Policy.md) | Backup & disaster recovery | Required |
| [Logging & Monitoring Policy](Logging-Monitoring-Policy.md) | Logs, alerts & monitoring | Required |
| [Secure Development Policy](Secure-Development-Policy.md) | SDLC & secure coding | Required |
| [Acceptable Use Policy](Acceptable-Use-Policy.md) | Device & system usage rules | Required |
| [Security Awareness Training Policy](Security-Awareness-Training-Policy.md) | Security training requirements | Required |
| [Encryption Policy](Encryption-Policy.md) | Data encryption standards | Required |
| [Data Retention Policy](Data-Retention-Policy.md) | Data retention & deletion | Required |
| [Incident Response Plan](Incident-Response-Plan.md) | Incident & business continuity | Required |
| [Vendor Management Policy](Vendor-Management-Policy.md) | Third-party risk | Required |
| [Data Disposal Procedures](Data-Disposal-Procedures.md) | Data deletion | Required |
| [Privacy Policy](Privacy-Policy.md) | GDPR/CCPA compliance | Required |

## Infrastructure Summary

**AWS (us-east-1):** 2 ALBs, 8 EC2, 3 RDS, 8 S3, 3 Lambda  
**Supabase:** Auth, PostgreSQL with RLS  
**GitHub:** Source control, CI/CD

## Security Status

| Control | Status |
|---------|--------|
| Encryption at rest | ✅ RDS, S3 |
| Encryption in transit | ✅ TLS |
| CloudTrail | ✅ Enabled |
| GuardDuty | ✅ Enabled |
| Backups | ✅ RDS (7-30 days) |
| Security Hub | ✅ Enabled |
| WAF | ✅ Enabled (COUNT mode) |

## Contacts

- **CTO:** Stefan Faistenauer (stefan@superglue.ai)
- **Fallback:** Nicolas Neudeck (nicolas@superglue.ai)
- **Status Page:** status.superglue.cloud

---
**Last Updated:** February 2026
