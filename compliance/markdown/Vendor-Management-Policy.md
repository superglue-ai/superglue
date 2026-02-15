# Vendor Management Policy
**Version:** 3.0 | **Date:** January 2026 | **Company:** Index Commerce GmbH

## 1. Vendor Inventory

### Critical (Quarterly Review)
| Vendor | Service | Certifications | DPA |
|--------|---------|----------------|-----|
| AWS | Cloud infrastructure | SOC 2, ISO 27001 | ✅ |
| Supabase | Database, Auth | SOC 2 Type II | ✅ |
| GitHub | Source control, CI/CD | SOC 2, ISO 27001 | ✅ |

### High (Semi-annual Review)
| Vendor | Service | Certifications | DPA |
|--------|---------|----------------|-----|
| Docker Hub | Container registry | SOC 2 Type II | ✅ |
| AWS Bedrock | AI/ML models | Via AWS | ✅ |

### Medium (Annual Review)
| Vendor | Service | Certifications | DPA |
|--------|---------|----------------|-----|
| PostHog | Analytics | SOC 2 Type II | ✅ |
| Google Workspace | Email, docs | SOC 2, ISO 27001 | ✅ |
| Slack | Communication | SOC 2, ISO 27001 | ✅ |
| Delve | SOC 2 compliance | SOC 2 Type II | ✅ |

## 2. AWS Resources

**Account:** 277707112101 | **Region:** us-east-1

- 2 Application Load Balancers
- 8 EC2 instances
- 3 RDS instances (Aurora + standalone)
- 8 S3 buckets (AES256 encrypted)
- 3 Lambda functions
- 14 Security Groups
- 6 KMS keys

**Security Enabled:** CloudTrail, GuardDuty, Secrets Manager, KMS, Security Hub, WAF (COUNT mode)

## 3. Shared Responsibility

### Superglue Responsibility
- Application security
- IAM policies and access control
- Security Group configuration
- Data encryption keys
- OS patches (EC2)
- RLS policies (Supabase)

### Vendor Responsibility
- Physical security
- Network infrastructure
- Managed service security
- Compliance certifications

## 4. Vendor Requirements

New vendors must have:
- [ ] SOC 2 or ISO 27001
- [ ] GDPR compliance
- [ ] Data encryption
- [ ] DPA available
- [ ] Incident notification < 72h

## 5. Key Dependencies (SBOM)

```json
{
  "runtime": "node >=20.0.0",
  "core": ["@supabase/supabase-js", "next", "graphql"],
  "ai": ["@ai-sdk/anthropic", "@ai-sdk/openai", "@ai-sdk/google"],
  "security": ["secretlint", "lefthook"]
}
```

**Dependency Management:**
- Dependabot for security updates
- npm audit in CI/CD
- secretlint pre-commit hooks

## 6. Vendor Offboarding

1. Export/migrate data
2. Confirm data deletion in writing
3. Revoke all access
4. Archive contracts

---
**Responsible:** Stefan Faistenauer (CTO) | **Next Review:** Q2 2026
