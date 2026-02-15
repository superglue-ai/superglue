# Secure Development (SDLC) Policy
**Version:** 1.0 | **Date:** February 2026 | **Company:** Index Commerce GmbH

## 1. Purpose

This policy establishes secure software development practices for Superglue to ensure security is integrated throughout the development lifecycle.

## 2. Scope

This policy applies to:
- All application source code
- Infrastructure as code
- CI/CD pipelines
- Third-party dependencies
- All developers and contributors

## 3. Secure Development Principles

- **Security by Design:** Consider security from the start of development
- **Defense in Depth:** Multiple layers of security controls
- **Least Privilege:** Code runs with minimum required permissions
- **Fail Secure:** Errors should not expose sensitive data or bypass security

## 4. Development Environment

### 4.1 Developer Workstation Requirements

| Requirement | Standard |
|-------------|----------|
| Operating System | macOS with latest security updates |
| Disk Encryption | FileVault enabled |
| Firewall | Enabled |
| Screen Lock | 5 minutes or less |
| Password Manager | 1Password |
| Git Configuration | Signed commits recommended |

### 4.2 Development Tools

| Tool | Purpose |
|------|---------|
| VS Code / Cursor | IDE |
| Git | Version control |
| Node.js 24+ | Runtime |
| Docker | Containerization |
| AWS CLI | Infrastructure management |

## 5. Code Review Requirements

### 5.1 Standard Changes

| Change Type | Reviewers Required | Reviewer Qualifications |
|-------------|-------------------|------------------------|
| Standard code changes | 1 | Any team developer |
| Bug fixes | 1 | Any team developer |
| Documentation | 1 | Any team member |

### 5.2 Security-Sensitive Changes

| Change Type | Reviewers Required | Reviewer Qualifications |
|-------------|-------------------|------------------------|
| Authentication/authorization logic | 2 | Must include Stefan or Nicolas |
| Cryptography or key handling | 2 | Must include Stefan or Nicolas |
| API security (rate limiting, validation) | 2 | Must include Stefan or Nicolas |
| Database security (RLS policies) | 2 | Must include Stefan or Nicolas |
| Infrastructure security (IAM, Security Groups) | 2 | Must include Stefan or Nicolas |

### 5.3 Execution-Affecting Changes

| Change Type | Reviewers Required | Reviewer Qualifications |
|-------------|-------------------|------------------------|
| Database schema migrations | 2 | Must include Stefan or Nicolas |
| Production configuration changes | 2 | Must include Stefan or Nicolas |
| CI/CD pipeline changes | 2 | Must include Stefan or Nicolas |
| Dependency major version upgrades | 2 | Must include Stefan or Nicolas |

### 5.4 Code Review Checklist

Reviewers should verify:
- [ ] Code follows project conventions
- [ ] No hardcoded secrets or credentials
- [ ] Input validation on user data
- [ ] Proper error handling (no sensitive data in errors)
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (output encoding)
- [ ] Authentication/authorization checks where needed
- [ ] Logging of security-relevant events
- [ ] Tests cover new functionality
- [ ] No unnecessary permissions or access

## 6. Security Controls in Development

### 6.1 Branch Protection

| Rule | Setting |
|------|---------|
| Protected branch | `main` |
| Direct pushes | Blocked |
| Required reviews | 1 minimum (2 for security/execution changes) |
| Status checks | Must pass |
| Force pushes | Blocked |
| Deletion | Blocked |

### 6.2 Secret Detection

| Tool | Stage | Action |
|------|-------|--------|
| secretlint | Pre-commit hook | Block commit if secrets detected |
| GitGuardian | Push to GitHub | Alert on detected secrets |
| GitHub Secret Scanning | Repository | Alert on detected secrets |

**If a secret is detected:**
1. Do NOT push the commit
2. Remove the secret from code
3. Rotate the exposed secret immediately
4. Use `git filter-branch` or BFG to remove from history if already pushed

### 6.3 Dependency Security

| Tool | Function | Frequency |
|------|----------|-----------|
| Dependabot | Automated security PRs | Continuous |
| npm audit | Vulnerability scanning | Every CI build |
| GitHub Security Advisories | Vulnerability alerts | Continuous |

**Dependency Update SLAs:**

| Severity | Response Time |
|----------|---------------|
| Critical | 48 hours |
| High | 7 days |
| Medium | 30 days |
| Low | Next release cycle |

### 6.4 CI/CD Security

| Control | Implementation |
|---------|----------------|
| Pipeline definition | In repository (GitHub Actions) |
| Secrets management | GitHub Secrets + AWS Secrets Manager |
| Build isolation | GitHub-hosted runners |
| Deployment authentication | OIDC (GitHubActionsDeployRole) |
| Artifact signing | Not implemented |

## 7. Secure Coding Standards

All developers must follow these secure coding practices:

### 7.1 Input Validation
- Validate all user input before processing
- Use schema validation (e.g., Zod) for structured data
- Sanitize input to prevent injection attacks
- Never trust client-side validation alone

### 7.2 Authentication & Authorization
- Verify user authorization before every sensitive action
- Use Supabase RLS for database-level access control
- Never expose resources without access checks
- Log authentication failures

### 7.3 Database Security
- Use parameterized queries (never string concatenation)
- Apply least privilege to database connections
- Use RLS policies for multi-tenant data isolation
- Validate data types before database operations

### 7.4 Error Handling
- Return generic error messages to clients
- Log detailed errors server-side only
- Never expose stack traces, SQL errors, or internal paths
- Handle all error cases explicitly

### 7.5 Secrets Management
- Never hardcode secrets in source code
- Load secrets from environment variables or AWS Secrets Manager
- Use different secrets for each environment
- Rotate secrets regularly and after any suspected exposure

## 8. Security Testing

### 8.1 Current Testing

| Test Type | Tool | Stage |
|-----------|------|-------|
| Dependency vulnerabilities | Dependabot, npm audit | CI |
| Secret detection | secretlint, GitGuardian | Pre-commit, Push |
| Unit tests | Jest | CI |

### 8.2 Planned Testing

| Test Type | Tool | Timeline |
|-----------|------|----------|
| Penetration testing | External vendor | SOC 2 requirement |
| SAST (Static Analysis) | TBD | Future consideration |
| DAST (Dynamic Analysis) | TBD | Future consideration |

### 8.3 Penetration Testing

**Frequency:** Annually (as part of SOC 2 compliance)

**Scope:**
- External network penetration test
- Web application penetration test
- API security testing

**Process:**
1. Engage qualified third-party vendor
2. Define scope and rules of engagement
3. Conduct testing in staging environment first
4. Remediate critical/high findings before production test
5. Document findings and remediation
6. Retest to verify fixes

## 9. Vulnerability Management

### 9.1 Vulnerability Sources

- Dependabot alerts
- GitGuardian alerts
- GitHub Security Advisories
- Penetration test findings
- Bug reports

### 9.2 Vulnerability Response

| Severity | Response Time | Actions |
|----------|---------------|---------|
| Critical | 48 hours | Immediate patch, notify team |
| High | 7 days | Prioritize in current sprint |
| Medium | 30 days | Schedule for upcoming sprint |
| Low | 90 days | Address when convenient |

### 9.3 Vulnerability Tracking

All vulnerabilities tracked in:
- GitHub Security tab (Dependabot)
- GitGuardian dashboard
- Internal issue tracker for pentest findings

## 10. Third-Party Code

### 10.1 Dependency Selection Criteria

Before adding a new dependency:
- [ ] Is it actively maintained?
- [ ] Does it have known vulnerabilities?
- [ ] Is the license compatible (MIT, Apache, BSD preferred)?
- [ ] Is it widely used and trusted?
- [ ] Can we achieve the same with existing dependencies?

### 10.2 Dependency Review

| Check | Tool/Method |
|-------|-------------|
| License compatibility | npm license checker |
| Vulnerability status | npm audit, Snyk |
| Maintenance status | GitHub activity |
| Download statistics | npm stats |

## 11. Release Security

### 11.1 Pre-Release Checklist

- [ ] All CI checks pass
- [ ] No critical/high Dependabot alerts
- [ ] No GitGuardian alerts
- [ ] Code review completed
- [ ] Tested in staging environment
- [ ] Database migrations tested with rollback

### 11.2 Production Deployment

See [Change Management Policy](Change-Management-Policy.md) for deployment procedures.

## 12. Security Training

All developers should be familiar with:
- OWASP Top 10 vulnerabilities
- Secure coding practices for JavaScript/TypeScript
- Company security policies
- Incident reporting procedures

## 13. Compliance

This policy supports:
- SOC 2 Type II (CC8.1: Change Management)
- CAIQ (AIS: Application & Interface Security)
- OWASP ASVS (Application Security Verification Standard)

## 14. Policy Review

This policy is reviewed annually or when:
- New development tools are adopted
- Security incidents reveal gaps
- Industry best practices evolve

---
**Approved by:** Stefan Faistenauer (CTO) | **Next Review:** February 2027
