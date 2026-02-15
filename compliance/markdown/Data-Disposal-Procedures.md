# Data Disposal Procedures
**Version:** 1.0  
**Date:** January 2026  
**Classification:** Internal  

## 1. Purpose

This procedure governs secure data disposal for Superglue. As a cloud-first startup using MacBooks, most data resides in AWS/Supabase.

## 2. Cloud Data Disposal

### 2.1 AWS Resources
| Resource | Disposal Method |
|----------|-----------------|
| EC2 Instances | Terminate (EBS auto-deleted) |
| S3 Buckets | Delete all objects, then bucket |
| RDS | Delete with final snapshot if needed |
| Secrets Manager | Schedule deletion (7-30 day window) |
| CloudWatch Logs | Set retention policy or delete log group |

### 2.2 Supabase
- Delete user data via API or dashboard
- Row deletions are soft-deleted, then purged
- Request full account deletion if needed

### 2.3 GitHub
- Delete repositories (irreversible)
- Remove secrets from settings
- Revoke access tokens

## 3. MacBook Disposal/Offboarding

When a team member leaves or a MacBook is retired:

1. **Backup** any needed data to company systems
2. **Sign out** of all accounts (iCloud, GitHub, Slack, 1Password, AWS)
3. **Revoke** access tokens and SSH keys
4. **Erase** via macOS Recovery (Erase All Content and Settings)
5. **Verify** FileVault encryption was active

For sale/donation: Factory reset is sufficient (FileVault encryption makes data unrecoverable).

## 4. Customer Data Deletion

When a customer requests data deletion (GDPR):

1. Delete from Supabase (workflows, credentials, logs)
2. Delete from S3 (any stored files)
3. Verify deletion in audit logs
4. Confirm to customer within 30 days

## 5. Responsibilities

**CTO (Stefan Faistenauer):** Approve and verify all data disposal  
**All Team Members:** Follow procedures, report issues

---
**Approved by:** Stefan Faistenauer (CTO)  
**Date:** January 2026
