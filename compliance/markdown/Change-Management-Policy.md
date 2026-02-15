# Change Management Policy
**Version:** 1.0 | **Date:** February 2026 | **Company:** Index Commerce GmbH

## 1. Purpose

This policy establishes a controlled process for managing changes to Superglue's systems, applications, and infrastructure to minimize risk and ensure service stability.

## 2. Scope

This policy applies to all changes to:
- Application source code
- Infrastructure (AWS, Supabase)
- Database schemas
- Dependencies and libraries
- Configuration and secrets
- CI/CD pipelines

## 3. Roles & Responsibilities

| Role | Responsibility |
|------|----------------|
| Stefan Faistenauer (CTO) | Change approval, emergency authorization |
| Nicolas Neudeck | Change approval, emergency authorization |
| All Developers | Submit changes via PR, test before requesting review |

## 4. Change Categories

| Category | Description | Examples |
|----------|-------------|----------|
| **Standard** | Routine changes following normal process | Feature development, bug fixes, dependency updates |
| **Infrastructure** | Changes to cloud resources | AWS console changes, new services, scaling |
| **Database** | Schema or data changes | Migrations, index changes, RLS policies |
| **Emergency** | Urgent fixes for critical issues | Security patches, production outages |

## 5. Standard Change Process

### 5.1 Code Changes

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Develop   │───▶│  Pull       │───▶│   Review    │───▶│   Merge     │
│   on branch │    │  Request    │    │   + CI      │    │   to main   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

| Step | Action | Requirements |
|------|--------|--------------|
| 1. Develop | Create feature branch from `main` | Branch naming: `feature/`, `fix/`, `chore/` |
| 2. Test locally | Run tests, verify functionality | All tests pass |
| 3. Create PR | Open pull request with description | Describe what and why |
| 4. CI checks | Automated tests run | All checks must pass |
| 5. Code review | Reviewer examines changes | 1 approval required |
| 6. Merge | Squash merge to `main` | Only after approval |

### 5.2 Branch Protection Rules

| Rule | Setting |
|------|---------|
| Direct pushes to `main` | Blocked |
| PR reviews required | 1 minimum |
| CI status checks | Must pass |
| Force pushes | Blocked |

### 5.3 Pull Request Requirements

Every PR must include:
- [ ] Clear description of changes
- [ ] Reason for the change
- [ ] Testing performed
- [ ] Breaking changes noted (if any)
- [ ] Database migration included (if schema change)

## 6. Infrastructure Changes

### 6.1 AWS Changes

| Change Type | Process | Approval |
|-------------|---------|----------|
| Console changes | Document in Slack, apply | Stefan or Nicolas |
| New services | Discuss, document, apply | Stefan or Nicolas |
| Security groups | Review rules, apply | Stefan or Nicolas |
| IAM changes | Review permissions, apply | Stefan or Nicolas |

**Documentation:** All infrastructure changes logged in CloudTrail. Significant changes documented in Slack #engineering.

### 6.2 Authorized Personnel

| System | Authorized Users |
|--------|------------------|
| AWS Console | Stefan, Nicolas |
| Supabase Dashboard | Stefan, Nicolas, Michael |
| GitHub Settings | Stefan, Nicolas, Adina |

## 7. Database Changes

### 7.1 Migration Process

| Step | Action | Responsible |
|------|--------|-------------|
| 1 | Write migration with rollback script | Developer |
| 2 | Test migration on dev database | Developer |
| 3 | Include migration in PR | Developer |
| 4 | Review migration and rollback | Reviewer |
| 5 | Deploy to staging, verify | Developer |
| 6 | Deploy to production | Developer |
| 7 | Verify production, monitor | Developer |

### 7.2 Migration Requirements

Every database migration must include:
- [ ] Up migration (apply changes)
- [ ] Down migration (rollback changes)
- [ ] Tested on development environment
- [ ] PR approval from Stefan or Nicolas
- [ ] Staging verification before production

### 7.3 High-Risk Database Changes

Changes requiring extra caution:
- Dropping tables or columns
- Modifying RLS policies
- Large data migrations
- Index changes on large tables

**Process:** Notify team before applying, have rollback ready, apply during low-traffic period.

## 8. Deployment Process

### 8.1 Lambda Deployments (Automated)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Merge     │───▶│   GitHub    │───▶│   Lambda    │
│   to main   │    │   Actions   │    │   Updated   │
└─────────────┘    └─────────────┘    └─────────────┘
```

- Triggered automatically on merge to `main`
- Uses `GitHubActionsDeployRole` (OIDC authentication)
- Logs available in GitHub Actions

### 8.2 EC2 Deployments (Manual)

| Step | Action | Environment |
|------|--------|-------------|
| 1 | Merge PR to `main` | - |
| 2 | Deploy to dev server | Development |
| 3 | Verify functionality on dev | Development |
| 4 | Deploy to production EC2 | Production |
| 5 | Verify production | Production |
| 6 | Monitor for issues | Production |

**Staging Check Required:** All EC2 changes must be verified on dev server before production deployment.

### 8.3 Deployment Checklist

- [ ] PR merged to `main`
- [ ] Dev server deployment successful
- [ ] Dev server functionality verified
- [ ] Production deployment completed
- [ ] Production health check passed
- [ ] Monitoring reviewed (no errors)

## 9. Emergency Changes

### 9.1 When to Use Emergency Process

- Production service is down
- Active security incident
- Critical bug affecting customers
- Data integrity issue

### 9.2 Emergency Process

| Step | Action | Timeline |
|------|--------|----------|
| 1 | Identify and assess issue | Immediate |
| 2 | Notify Stefan or Nicolas | Immediate |
| 3 | Develop fix | ASAP |
| 4 | Deploy directly (skip staging if critical) | ASAP |
| 5 | Verify fix | Immediate |
| 6 | Create PR for documentation | Within 24h |
| 7 | Post-mortem | Within 48h |

### 9.3 Emergency Authorization

| Authorizer | Availability |
|------------|--------------|
| Stefan Faistenauer | Primary |
| Nicolas Neudeck | Secondary |

**Note:** Either Stefan or Nicolas can authorize emergency changes. If neither is available, proceed with fix and document immediately after.

### 9.4 Post-Emergency Requirements

- [ ] PR created documenting the change
- [ ] Incident logged
- [ ] Root cause identified
- [ ] Post-mortem completed (for significant incidents)

## 10. Dependency Updates

### 10.1 Automated Updates (Dependabot)

| Severity | Process | Timeline |
|----------|---------|----------|
| Critical | Review and merge immediately | Within 48 hours |
| High | Review and merge promptly | Within 7 days |
| Medium/Low | Review in normal cycle | Within 30 days |

### 10.2 Manual Updates

- Test locally before creating PR
- Note breaking changes in PR description
- Update lock files (`package-lock.json`)

## 11. Rollback Procedures

### 11.1 Code Rollback

```bash
# Revert the problematic commit
git revert <commit-hash>

# Create PR for the revert
# Follow normal review process (expedited for emergencies)
```

### 11.2 Database Rollback

```bash
# Run the down migration
npm run migrate:down

# Or restore from backup if migration rollback fails
```

### 11.3 Infrastructure Rollback

- Revert console changes manually
- Restore from CloudFormation/Terraform state if available
- Contact AWS support for complex rollbacks

## 12. Change Log

All changes are tracked in:
- **GitHub:** Commit history, PR descriptions
- **AWS CloudTrail:** Infrastructure changes
- **Supabase:** Database audit logs

## 13. Compliance

This policy supports:
- SOC 2 Type II (CC8.1: Change Management)
- CAIQ (CCC: Change Control and Configuration)

## 14. Policy Review

This policy is reviewed annually or when significant process changes occur.

---
**Approved by:** Stefan Faistenauer (CTO) | **Next Review:** February 2027
