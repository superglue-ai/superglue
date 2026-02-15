# Security Awareness Training Policy
**Version:** 1.0 | **Date:** February 2026 | **Company:** Index Commerce GmbH

## 1. Purpose

This policy establishes security awareness training requirements to ensure all team members understand their security responsibilities and can identify and respond to security threats.

## 2. Scope

This policy applies to all employees and contractors with access to Superglue systems or data.

## 3. Training Requirements

### 3.1 Training Schedule

| Training Type | Frequency | Audience |
|---------------|-----------|----------|
| Initial training | Within first week of employment | New hires |
| Annual refresher | Yearly (January) | All team members |
| Policy updates | As needed | Affected team members |
| Incident-triggered | After security incidents | All team members |

### 3.2 Training Method

Training is delivered via **self-study documentation**:
- Review of security policies
- Security awareness materials
- Acknowledgment of understanding

## 4. Training Topics

### 4.1 Core Topics (All Team Members)

| Topic | Description |
|-------|-------------|
| **Phishing & Social Engineering** | Recognizing and reporting phishing emails, suspicious requests |
| **Password Security** | Strong passwords, password managers, never sharing credentials |
| **Multi-Factor Authentication** | Importance of MFA, proper use of authenticator apps |
| **Data Classification** | Understanding data sensitivity levels and handling requirements |
| **Data Protection** | Protecting confidential and customer data |
| **Acceptable Use** | Proper use of company devices and systems |
| **Remote Work Security** | Secure home office, network requirements |
| **Incident Reporting** | How and when to report security concerns |
| **Physical Security** | Device protection, screen locking, travel security |

### 4.2 Role-Specific Topics

| Role | Additional Topics |
|------|-------------------|
| Developers | Secure coding practices, secret management, code review |
| Administrators | Access management, privileged account security, audit logging |

## 5. Training Materials

### 5.1 Required Reading

All team members must review:

| Document | Location |
|----------|----------|
| Information Security Policy | itsec-documents/ |
| Acceptable Use Policy | itsec-documents/ |
| Incident Response Plan | itsec-documents/ |
| Data Disposal Procedures | itsec-documents/ |

### 5.2 Developer Additional Reading

| Document | Location |
|----------|----------|
| Secure Development Policy | itsec-documents/ |
| Change Management Policy | itsec-documents/ |
| Access Control Policy | itsec-documents/ |

## 6. Key Security Awareness Topics

### 6.1 Phishing & Social Engineering

**Recognize phishing attempts:**
- Unexpected emails requesting urgent action
- Emails with suspicious links or attachments
- Requests for credentials or sensitive information
- Emails from unknown senders impersonating known contacts
- Poor grammar or unusual formatting

**Response:**
- Do not click links or open attachments
- Do not provide credentials or sensitive information
- Report to CTO (stefan@superglue.ai)
- Delete the email

### 6.2 Password Security

**Requirements:**
- Minimum 12 characters
- Mix of uppercase, lowercase, numbers, symbols
- Unique password for each account
- Store only in 1Password
- Never share passwords with anyone
- Never send passwords via email or chat

### 6.3 Data Protection

**Handling sensitive data:**
- Only access data you need for your work
- Never store company data on personal devices
- Never share confidential data via unsecured channels
- Lock your screen when stepping away
- Report suspected data breaches immediately

### 6.4 Device Security

**Protect your MacBook:**
- Keep FileVault encryption enabled
- Keep firewall enabled
- Install security updates promptly
- Lock screen after 5 minutes (or manually when leaving)
- Never leave device unattended in public
- Report lost or stolen devices immediately

### 6.5 Remote Work Security

**Working from home:**
- Use secured home WiFi (WPA2/WPA3)
- Never use public WiFi for sensitive work
- Work only from home country
- Ensure screen is not visible to others
- Secure device when not in use

### 6.6 Incident Reporting

**Report immediately:**
- Lost or stolen devices
- Suspected phishing or social engineering
- Unusual system behavior
- Unauthorized access attempts
- Suspected malware
- Any security concerns

**Contact:** stefan@superglue.ai or Slack #engineering

## 7. Training Completion

### 7.1 Completion Requirements

| Requirement | Standard |
|-------------|----------|
| Review all required documents | Within training period |
| Sign acknowledgment | After review |
| Complete within | 7 days (new hires), 30 days (annual) |

### 7.2 Acknowledgment

Team members must acknowledge:
- They have read and understood the security policies
- They will comply with all security requirements
- They understand consequences of policy violations
- They will report security incidents promptly

## 8. Training Records

### 8.1 Record Keeping

Training completion is tracked in a spreadsheet maintained by the CTO.

**Training Log Location:** [Internal - Security Training Tracker]

### 8.2 Training Log Fields

| Field | Description |
|-------|-------------|
| Employee Name | Full name |
| Email | Company email |
| Training Type | Initial / Annual / Update |
| Completion Date | Date training completed |
| Acknowledgment | Yes/No |
| Next Due Date | Date of next required training |

### 8.3 Current Training Status

| Name | Role | Last Training | Next Due |
|------|------|---------------|----------|
| Stefan Faistenauer | CTO | _TBD_ | _TBD_ |
| Nicolas Neudeck | Developer | _TBD_ | _TBD_ |
| Adina | Developer | _TBD_ | _TBD_ |
| Michael Fuest | Developer | _TBD_ | _TBD_ |

## 9. Non-Compliance

### 9.1 Overdue Training

| Days Overdue | Action |
|--------------|--------|
| 1-7 days | Reminder email |
| 8-14 days | Escalation to CTO |
| 15+ days | Access restrictions may apply |

### 9.2 Policy Violations

Failure to follow security practices may result in:
- Additional training requirements
- Written warning
- Access restrictions
- Disciplinary action

## 10. Responsibilities

| Role | Responsibility |
|------|----------------|
| Stefan Faistenauer (CTO) | Training program oversight, record keeping, policy updates |
| All Team Members | Complete training on time, follow security practices |

## 11. Compliance

This policy supports:
- SOC 2 Type II (CC1.4: Security Awareness)
- CAIQ (HRS: Human Resources Security)
- GDPR (Staff awareness requirements)

## 12. Policy Review

This policy is reviewed annually or when:
- Security incidents reveal training gaps
- New threats emerge
- Significant policy changes occur

---
**Approved by:** Stefan Faistenauer (CTO) | **Next Review:** February 2027
