# Acceptable Use Policy
**Version:** 1.0 | **Date:** February 2026 | **Company:** Index Commerce GmbH

## 1. Purpose

This policy defines acceptable use of Superglue's information systems, devices, and data to protect company assets and ensure security.

## 2. Scope

This policy applies to:
- All employees and contractors
- All company-provided devices (MacBooks, phones)
- All company systems and data
- Personal devices used for limited work purposes

## 3. Company Devices

### 3.1 Authorized Use

Company-provided devices (MacBooks) are for **business use only**.

| Use Type | Permitted |
|----------|-----------|
| Work-related tasks | ✅ Yes |
| Personal use | ❌ No |
| Personal email/browsing | ❌ No |
| Personal software installation | ❌ No |
| Personal file storage | ❌ No |

### 3.2 Device Security Requirements

All company MacBooks must have:

| Requirement | Standard |
|-------------|----------|
| FileVault encryption | Enabled |
| Firewall | Enabled |
| Automatic updates | Enabled |
| Screen lock | 5 minutes maximum |
| Password | Strong, unique |
| 1Password | Installed for credential management |

### 3.3 Prohibited Activities

The following are strictly prohibited on company devices:

- Personal use of any kind
- Installing unauthorized software
- Disabling security features (FileVault, firewall, updates)
- Connecting to untrusted networks for sensitive work
- Sharing devices with non-employees
- Storing company data on personal cloud services
- Circumventing security controls

## 4. Personal Devices (BYOD)

### 4.1 General Policy

Bring Your Own Device (BYOD) is **strictly prohibited** for work purposes, with limited exceptions.

### 4.2 Permitted Exceptions

| Device | Permitted Use | Requirements |
|--------|---------------|--------------|
| Personal smartphone | Slack messaging | 2FA enabled, screen lock |
| Personal smartphone | Gmail (company email) | 2FA enabled, screen lock |
| Personal smartphone | Google Authenticator | Screen lock |

### 4.3 Prohibited on Personal Devices

| Activity | Permitted |
|----------|-----------|
| Accessing AWS console | ❌ No |
| Accessing Supabase | ❌ No |
| Accessing GitHub (code) | ❌ No |
| Storing company files | ❌ No |
| Development work | ❌ No |
| Accessing customer data | ❌ No |

### 4.4 Personal Device Requirements

If using a personal smartphone for permitted activities:

- Screen lock enabled (PIN, biometric)
- Device encryption enabled
- Latest OS security updates installed
- Remote wipe capability enabled
- No jailbreaking/rooting
- Report lost/stolen devices immediately

## 5. Remote Work

### 5.1 Location Requirements

| Requirement | Policy |
|-------------|--------|
| Work location | Home country only |
| International travel | No work access while abroad |
| Public spaces | Limited (see network requirements) |

**Home Country:** Team members may only access company systems from their country of residence (Germany for most team members).

### 5.2 Network Requirements

| Network Type | Sensitive Work | General Work |
|--------------|----------------|--------------|
| Home WiFi (secured) | ✅ Permitted | ✅ Permitted |
| Public WiFi (coffee shop, airport) | ❌ Prohibited | ⚠️ Limited |
| Mobile hotspot (personal) | ✅ Permitted | ✅ Permitted |
| Hotel WiFi | ❌ Prohibited | ⚠️ Limited |

**Sensitive Work includes:**
- Accessing AWS console
- Accessing production databases
- Handling customer data
- Managing secrets/credentials
- Code deployment

**General Work includes:**
- Slack communication
- Email
- Documentation
- Non-sensitive browsing

### 5.3 Home Office Security

| Requirement | Standard |
|-------------|----------|
| WiFi encryption | WPA2 or WPA3 |
| Router password | Changed from default |
| Screen privacy | Not visible to others |
| Device storage | Secured when not in use |

## 6. Internet & Email Use

### 6.1 Acceptable Use

| Activity | Permitted |
|----------|-----------|
| Work-related research | ✅ Yes |
| Professional development | ✅ Yes |
| Work communication | ✅ Yes |

### 6.2 Prohibited Activities

- Accessing illegal content
- Downloading pirated software or media
- Harassment or offensive communications
- Sharing confidential information externally
- Using company email for personal purposes
- Clicking suspicious links or attachments

### 6.3 Email Security

- Do not open attachments from unknown senders
- Verify unexpected requests for sensitive information
- Report phishing attempts to CTO
- Do not forward company emails to personal accounts

## 7. Password & Authentication

### 7.1 Password Requirements

| Requirement | Standard |
|-------------|----------|
| Minimum length | 12 characters |
| Complexity | Mix of upper, lower, numbers, symbols |
| Reuse | Never reuse passwords |
| Storage | 1Password only |
| Sharing | Never share passwords |

### 7.2 Multi-Factor Authentication

MFA is required for all company systems:
- Google Workspace
- GitHub
- AWS (where applicable)
- Supabase
- 1Password

## 8. Data Handling

### 8.1 Data Classification

| Classification | Examples | Handling |
|----------------|----------|----------|
| Strictly Confidential | API keys, credentials, PII | Encrypted, need-to-know |
| Confidential | Customer data, source code | Access controlled |
| Internal | Policies, procedures | Team access |
| Public | Marketing, docs | No restrictions |

### 8.2 Data Protection Rules

- Never store confidential data on personal devices
- Never share confidential data via unsecured channels
- Never leave devices unattended with sensitive data visible
- Lock screen when stepping away
- Report suspected data breaches immediately

## 9. Software & Downloads

### 9.1 Authorized Software

Only install software that is:
- Required for work
- From official sources (App Store, vendor websites)
- Approved by CTO if uncertain

### 9.2 Prohibited Software

- Pirated or cracked software
- Peer-to-peer file sharing applications
- Remote access tools (unless approved)
- Personal cloud storage clients
- Browser extensions (unless approved)

## 10. Physical Security

### 10.1 Device Protection

- Never leave devices unattended in public
- Use laptop locks in shared spaces if available
- Store devices securely when not in use
- Do not leave devices visible in vehicles

### 10.2 Travel Security

- Keep devices in carry-on luggage
- Use privacy screens in public
- Avoid accessing sensitive data in public view
- Report lost or stolen devices immediately

## 11. Incident Reporting

Report the following immediately to CTO (stefan@superglue.ai):

- Lost or stolen devices
- Suspected malware or compromise
- Phishing attempts
- Unauthorized access attempts
- Policy violations observed
- Security vulnerabilities discovered

## 12. Monitoring

Superglue reserves the right to:
- Monitor company device usage
- Audit access logs
- Review security configurations
- Investigate policy violations

## 13. Violations

Violations of this policy may result in:
- Verbal or written warning
- Revocation of access privileges
- Disciplinary action
- Termination of employment
- Legal action (for serious violations)

## 14. Acknowledgment

All team members must acknowledge this policy upon onboarding and annually thereafter.

## 15. Compliance

This policy supports:
- SOC 2 Type II (CC1.4: Security Awareness)
- CAIQ (HRS: Human Resources Security)
- GDPR (Data protection requirements)

## 16. Policy Review

This policy is reviewed annually or when significant changes occur.

---
**Approved by:** Stefan Faistenauer (CTO) | **Next Review:** February 2027
