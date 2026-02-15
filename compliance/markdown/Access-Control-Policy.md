# Access Control Policy
**Version:** 1.0 | **Date:** February 2026 | **Company:** Index Commerce GmbH

## 1. Purpose

This policy defines access control requirements for Superglue systems and data, ensuring only authorized personnel have appropriate access based on their role.

## 2. Scope

This policy applies to all employees, contractors, and systems including:
- Google Workspace
- AWS (Account: 277707112101)
- Supabase
- GitHub (superglue organization)
- 1Password

## 3. Access Control Principles

- **Least Privilege:** Users receive minimum access required for their role
- **Need-to-Know:** Access granted only when business need is demonstrated
- **Separation of Duties:** Critical functions require multiple approvers where feasible

## 4. Authentication Requirements

### 4.1 Primary Authentication
All access uses Google Workspace SSO with mandatory 2-Factor Authentication (2FA).

| Requirement | Standard |
|-------------|----------|
| Authentication method | Google Workspace SSO |
| MFA | Required (Google Authenticator or hardware key) |
| Password minimum length | 12 characters (Google Workspace policy) |
| Session timeout | Per application defaults |

### 4.2 Service-Specific Authentication

| Service | Authentication Method | MFA |
|---------|----------------------|-----|
| Google Workspace | Password + 2FA | Required |
| AWS Console | IAM credentials | Required on root |
| AWS Programmatic | Access keys / OIDC roles | N/A |
| Supabase | Google SSO | Required |
| GitHub | Google SSO | Required |
| 1Password | Master password + Secret key | Required |

## 5. User Access Management

### 5.1 Access Request & Approval

| Step | Action | Responsible |
|------|--------|-------------|
| 1 | Request submitted | Requestor |
| 2 | Business need verified | Stefan Faistenauer (CTO) |
| 3 | Access provisioned | Stefan Faistenauer (CTO) |
| 4 | User notified | Stefan Faistenauer (CTO) |

**Approval Authority:** Stefan Faistenauer (CTO) approves all access requests.

### 5.2 Onboarding Checklist

New team members receive access based on role:

| System | Developer | Administrator |
|--------|-----------|---------------|
| Google Workspace | ✅ | ✅ |
| GitHub (Member) | ✅ | ✅ |
| GitHub (Owner) | ❌ | ✅ |
| Supabase (Developer) | ✅ | ❌ |
| Supabase (Administrator) | ❌ | ✅ |
| AWS Console | ❌ | As needed |
| 1Password | ✅ | ✅ |

### 5.3 Offboarding

Access revocation within 24 hours of termination:

1. Disable Google Workspace account (cascades to SSO services)
2. Remove from GitHub organization
3. Remove from Supabase team
4. Revoke AWS IAM credentials (if any)
5. Remove from 1Password team
6. Revoke SSH keys
7. Document in offboarding checklist

## 6. Current Access Inventory

### 6.1 Google Workspace
| User | Role | 2FA |
|------|------|-----|
| stefan@superglue.ai | Admin | ✅ |
| nicolas@superglue.ai | Admin | ✅ |
| adina@superglue.cloud | User | ✅ |
| michael@superglue.ai | User | ✅ |

### 6.2 GitHub (superglue organization)
| User | Role | 2FA |
|------|------|-----|
| stefanfaistenauer | Owner | ✅ |
| heushreck (Nicolas) | Owner | ✅ |
| adinagiulia (Adina) | Owner | ✅ |
| michaelfuest (Michael) | Member | ✅ |

**Repository Controls:**
- Branch protection enabled on `main`
- Direct commits to `main` blocked
- Pull request reviews required before merge

### 6.3 Supabase
| User | Role | MFA |
|------|------|-----|
| stefan@superglue.cloud | Owner | ✅ |
| nicolas@superglue.ai | Administrator | ✅ |
| michael@superglue.ai | Administrator | ✅ |
| adina@superglue.cloud | Developer | ✅ |

### 6.4 AWS IAM
| User/Role | Type | Purpose | MFA |
|-----------|------|---------|-----|
| Root account | Console | Emergency only | ✅ |
| mac | IAM User | Admin access | ✅ |
| BedrockAPIKey-* | IAM User | API access for Bedrock | N/A |
| BedrockUser | IAM User | Bedrock service | N/A |
| GitHubActionsDeployRole | IAM Role | CI/CD deployments | N/A (OIDC) |

**Password Policy:**
- Minimum 12 characters
- Requires uppercase, lowercase, numbers, symbols
- Expires after 365 days
- Cannot reuse last 12 passwords

**Planned Improvements:**
- [ ] Migrate BedrockAPIKey users to IAM roles
- [ ] Implement IAM groups for policy management

## 7. Privileged Access

### 7.1 Privileged Accounts
| System | Privileged Users | Access Level |
|--------|------------------|--------------|
| AWS | Stefan | Root + Admin IAM |
| GitHub | Stefan, Nicolas, Adina | Organization Owner |
| Supabase | Stefan | Owner |

### 7.2 Privileged Access Rules
- Root/Owner accounts used only when necessary
- All privileged actions logged (CloudTrail, GitHub audit log)
- Emergency access documented post-use

## 8. Access Reviews

### 8.1 Review Schedule
| Review Type | Frequency | Reviewer |
|-------------|-----------|----------|
| User access review | Quarterly | Stefan Faistenauer |
| Privileged access review | Quarterly | Stefan Faistenauer |
| Service account review | Quarterly | Stefan Faistenauer |

### 8.2 Review Process
1. Export current access lists from all systems
2. Verify each user still requires access
3. Verify access level is appropriate for role
4. Remove unnecessary access
5. Document review completion and findings

### 8.3 Review Checklist
- [ ] Google Workspace users and roles
- [ ] GitHub organization members and permissions
- [ ] Supabase team members and roles
- [ ] AWS IAM users, roles, and policies
- [ ] 1Password team members and vault access
- [ ] SSH keys on servers

## 9. Service Accounts & API Keys

### 9.1 Service Account Standards
- Named descriptively (purpose + date or identifier)
- Minimum required permissions
- Documented owner and purpose
- Reviewed quarterly

### 9.2 Current Service Accounts
| Account | Purpose | Owner |
|---------|---------|-------|
| BedrockAPIKey-* | Customer Bedrock API access | Stefan |
| GitHubActionsDeployRole | CI/CD Lambda deployments | Stefan |

### 9.3 API Key Management
- API keys stored in AWS Secrets Manager or 1Password
- Keys rotated annually or upon suspected compromise
- Unused keys deleted promptly

## 10. Remote Access

- No VPN required (cloud-native infrastructure)
- All services accessed via HTTPS with SSO
- SSH access to EC2 via key-based authentication only
- SSH keys managed per-user, removed on offboarding

## 11. Compliance

This policy supports:
- SOC 2 Type II (CC6.1 - CC6.8)
- CAIQ (IAM domain)
- GDPR (access control requirements)

## 12. Policy Review

This policy is reviewed annually or upon significant changes to systems or team.

---
**Approved by:** Stefan Faistenauer (CTO) | **Next Review:** February 2027
