# Risk Assessment & Management Policy
**Version:** 1.0 | **Date:** February 2026 | **Company:** Index Commerce GmbH

## 1. Purpose

This policy establishes a framework for identifying, assessing, and managing information security risks to Superglue's systems, data, and operations.

## 2. Scope

This policy applies to all:
- Information systems and infrastructure (AWS, Supabase, GitHub)
- Business processes handling customer data
- Third-party services and vendors
- Personnel with access to company systems

## 3. Risk Management Principles

### 3.1 Risk Appetite
Superglue maintains a **moderate risk appetite**:
- We accept reasonable risks to enable business agility and speed
- We do not accept risks that could result in significant data breaches or customer harm
- We prioritize risks based on likelihood and business impact

### 3.2 Risk Management Objectives
- Protect customer data confidentiality and integrity
- Maintain service availability
- Ensure regulatory compliance (GDPR, SOC 2)
- Enable informed decision-making on security investments

## 4. Roles & Responsibilities

| Role | Responsibility |
|------|----------------|
| Stefan Faistenauer (CTO) | Risk owner, final approval on risk decisions |
| Nicolas Neudeck | Risk review participant, technical assessment |
| All Team Members | Report potential risks and incidents |

## 5. Risk Assessment Process

### 5.1 Assessment Schedule

| Assessment Type | Frequency | Participants |
|-----------------|-----------|--------------|
| Annual risk assessment | Yearly (January) | Stefan, Nicolas |
| Triggered assessment | As needed | Stefan, Nicolas |
| Vendor risk assessment | Before onboarding | Stefan |

**Triggers for ad-hoc assessment:**
- New system or service deployment
- Significant infrastructure changes
- Security incident or near-miss
- New regulatory requirements
- Major vendor changes

### 5.2 Risk Identification

Sources for identifying risks:
- Security monitoring (GuardDuty, CloudTrail)
- Vulnerability scans and dependency audits
- Incident post-mortems
- Industry threat intelligence
- Vendor security advisories
- Team observations

### 5.3 Risk Analysis

Each risk is evaluated on two dimensions:

**Likelihood (1-5)**
| Score | Level | Description |
|-------|-------|-------------|
| 1 | Rare | Unlikely to occur (< 5% annually) |
| 2 | Unlikely | Could occur but not expected (5-20%) |
| 3 | Possible | May occur (20-50%) |
| 4 | Likely | Expected to occur (50-80%) |
| 5 | Almost Certain | Will occur (> 80%) |

**Impact (1-5)**
| Score | Level | Description |
|-------|-------|-------------|
| 1 | Negligible | Minor inconvenience, no data exposure |
| 2 | Minor | Limited impact, quick recovery |
| 3 | Moderate | Noticeable disruption, some data exposure |
| 4 | Major | Significant breach, regulatory notification required |
| 5 | Severe | Large-scale breach, business-threatening |

**Risk Score = Likelihood × Impact**

### 5.4 Risk Rating Matrix

|  | Impact 1 | Impact 2 | Impact 3 | Impact 4 | Impact 5 |
|--|----------|----------|----------|----------|----------|
| **Likelihood 5** | 5 (M) | 10 (M) | 15 (H) | 20 (C) | 25 (C) |
| **Likelihood 4** | 4 (L) | 8 (M) | 12 (H) | 16 (H) | 20 (C) |
| **Likelihood 3** | 3 (L) | 6 (M) | 9 (M) | 12 (H) | 15 (H) |
| **Likelihood 2** | 2 (L) | 4 (L) | 6 (M) | 8 (M) | 10 (M) |
| **Likelihood 1** | 1 (L) | 2 (L) | 3 (L) | 4 (L) | 5 (M) |

**L** = Low (1-4) | **M** = Medium (5-10) | **H** = High (11-16) | **C** = Critical (17-25)

## 6. Risk Treatment

### 6.1 Treatment Options

| Option | Description | When to Use |
|--------|-------------|-------------|
| **Mitigate** | Implement controls to reduce likelihood or impact | Most common approach |
| **Accept** | Acknowledge and monitor the risk | Low risks within appetite |
| **Transfer** | Shift risk via insurance or contracts | Financial/liability risks |
| **Avoid** | Eliminate the risk by removing the activity | Unacceptable risks |

### 6.2 Treatment by Risk Level

| Risk Level | Required Action | Timeline |
|------------|-----------------|----------|
| Critical (17-25) | Immediate mitigation required | Within 48 hours |
| High (11-16) | Mitigation plan required | Within 2 weeks |
| Medium (5-10) | Mitigation planned | Within quarter |
| Low (1-4) | Accept or address opportunistically | As resources allow |

## 7. Current Risk Register

### 7.1 Identified Risks

| ID | Risk | Likelihood | Impact | Score | Treatment | Owner |
|----|------|------------|--------|-------|-----------|-------|
| R1 | Data breach via compromised credentials | 2 | 5 | 10 (M) | Mitigate | Stefan |
| R2 | Data breach via application vulnerability | 2 | 5 | 10 (M) | Mitigate | Stefan |
| R3 | Data breach via insider threat | 1 | 5 | 5 (M) | Mitigate | Stefan |
| R4 | Service outage - AWS region failure | 2 | 4 | 8 (M) | Accept | Stefan |
| R5 | Service outage - Supabase failure | 2 | 4 | 8 (M) | Accept | Stefan |
| R6 | Vendor security incident | 2 | 4 | 8 (M) | Transfer | Stefan |
| R7 | Loss of key personnel | 2 | 3 | 6 (M) | Accept | Stefan |
| R8 | Ransomware attack | 2 | 4 | 8 (M) | Mitigate | Stefan |
| R9 | API key exposure in code | 2 | 4 | 8 (M) | Mitigate | Stefan |
| R10 | Unauthorized access to customer data | 2 | 5 | 10 (M) | Mitigate | Stefan |

### 7.2 Risk Treatment Details

#### R1, R2, R10: Data Breach Risks
**Current Controls:**
- Google Workspace SSO with mandatory 2FA
- Supabase Row-Level Security (RLS)
- Encryption at rest (RDS, S3) and in transit (TLS)
- CloudTrail audit logging
- GuardDuty threat detection

**Planned Improvements:**
- [x] Enable AWS Security Hub (Feb 2026)
- [x] Enable AWS WAF - COUNT mode (Feb 2026)
- [x] Enable MFA for all Supabase users
- [ ] Implement regular penetration testing

#### R3: Insider Threat
**Current Controls:**
- Small team with high trust
- Least privilege access
- Audit logging on all systems
- Quarterly access reviews

#### R4, R5: Service Outages
**Current Controls:**
- Multi-AZ RDS deployment
- Automated backups (7-30 days)
- Status page monitoring
- Incident response plan

**Accepted Risk:** Single-region deployment accepted for cost efficiency. DR to alternate region documented but not pre-provisioned.

#### R6: Vendor Security Incident
**Current Controls:**
- Vendor security review before onboarding
- DPAs with all critical vendors
- Vendors have SOC 2/ISO 27001 certifications

**Risk Transfer:** Vendor contracts include security incident notification requirements.

#### R8: Ransomware
**Current Controls:**
- Automated RDS backups
- GitHub as source of truth (immutable history)
- No on-premise servers
- Endpoint security (FileVault, firewall)

#### R9: API Key Exposure
**Current Controls:**
- GitHub secret scanning enabled
- secretlint pre-commit hooks
- Secrets stored in AWS Secrets Manager
- .gitignore for sensitive files

## 8. Risk Monitoring

### 8.1 Continuous Monitoring
| Source | What We Monitor | Alert Threshold |
|--------|-----------------|-----------------|
| GuardDuty | Threat detection | All findings |
| CloudTrail | API activity | Unusual patterns |
| CloudWatch | System metrics | Defined alarms |
| Dependabot | Vulnerabilities | Critical/High |
| GitHub | Secret exposure | Any detection |

### 8.2 Risk Review Cadence
- **Weekly:** Review GuardDuty/CloudWatch alerts
- **Monthly:** Review Dependabot findings
- **Quarterly:** Access review, vendor review
- **Annually:** Full risk assessment

## 9. Risk Reporting

### 9.1 Risk Register Updates
The risk register is updated:
- After each risk assessment
- When new risks are identified
- When risk scores change significantly
- After incidents that reveal new risks

### 9.2 Escalation
| Risk Level | Escalation |
|------------|------------|
| Critical | Immediate notification to CTO |
| High | Discussed at next team sync |
| Medium/Low | Tracked in risk register |

## 10. Compliance

This policy supports:
- SOC 2 Type II (CC3.1 - CC3.4: Risk Assessment)
- CAIQ (GRM: Governance and Risk Management)
- GDPR (Article 32: Security of processing)

## 11. Policy Review

This policy and the risk register are reviewed:
- Annually (full review)
- After significant security incidents
- When major system changes occur

---
**Approved by:** Stefan Faistenauer (CTO) | **Next Review:** February 2027
