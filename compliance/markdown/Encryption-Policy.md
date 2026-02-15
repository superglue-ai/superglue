# Encryption Policy
**Version:** 1.0 | **Date:** February 2026 | **Company:** Index Commerce GmbH

## 1. Purpose

This policy defines encryption requirements for protecting data at rest and in transit across Superglue systems.

## 2. Scope

This policy applies to:
- All data stored in AWS services
- All data stored in Supabase
- All data transmitted between systems
- Application-level encryption of sensitive data
- Endpoint devices

## 3. Encryption Standards

### 3.1 Approved Algorithms

| Use Case | Algorithm | Key Size |
|----------|-----------|----------|
| Symmetric encryption | AES | 256-bit |
| Transport encryption | TLS | 1.2 or 1.3 |
| Hashing | SHA-256 or SHA-384 | - |
| Key derivation | PBKDF2, scrypt, or Argon2 | - |

### 3.2 Prohibited Algorithms

The following are prohibited for new implementations:
- DES, 3DES
- MD5, SHA-1 (for security purposes)
- RC4
- TLS 1.0, TLS 1.1
- SSL (all versions)

## 4. Encryption at Rest

### 4.1 AWS Services

| Service | Encryption | Method | Key Management |
|---------|------------|--------|----------------|
| RDS (database-1) | Enabled | AES-256 | AWS KMS |
| RDS Aurora (superglue-prod) | Enabled | AES-256 | AWS KMS |
| S3 buckets | Enabled | AES-256 | S3 managed (SSE-S3) |
| EBS volumes | Enabled | AES-256 | AWS KMS |
| Secrets Manager | Enabled | AES-256 | AWS KMS |
| Lambda environment variables | Enabled | AES-256 | AWS KMS |

### 4.2 AWS KMS Keys

| Key Alias | Purpose | Key ID |
|-----------|---------|--------|
| alias/aws/rds | RDS encryption | 045fcf85-2a6a-41d5-acc9-40df46dfaab5 |
| alias/aws/secretsmanager | Secrets encryption | ea50a756-7c40-4164-afeb-846376674941 |
| alias/aws/lambda | Lambda encryption | 245931e9-de7f-4b2a-8a68-40a9e4803bd3 |
| alias/aws/ecr | Container registry | 5f167a11-fc34-4010-a585-0990b3f8bec6 |
| alias/aws/acm | Certificate management | 83f7d1f2-2f37-4f28-b8ce-07d03a0cb2da |
| alias/aws/ssm | Parameter Store | 80ea1e5b-996d-4b65-af6f-ac9f3565169e |

### 4.3 Supabase

| Component | Encryption | Method |
|-----------|------------|--------|
| PostgreSQL data | Enabled | AES-256 (Supabase managed) |
| Backups | Enabled | AES-256 (Supabase managed) |
| File storage | Enabled | AES-256 (Supabase managed) |

### 4.4 Application-Level Encryption

Superglue implements additional application-level encryption for sensitive credentials:

| Data Type | Algorithm | Key Management |
|-----------|-----------|----------------|
| Integration credentials | AES-256-CBC | MASTER_ENCRYPTION_KEY |
| OAuth tokens | AES-256-CBC | MASTER_ENCRYPTION_KEY |
| API secrets | AES-256-CBC | MASTER_ENCRYPTION_KEY |

**Implementation:**
- Algorithm: AES-256-CBC with random IV per value
- Key derivation: SHA-256 hash of master key
- Format: `enc:<iv>:<ciphertext>`
- Master key stored in environment variable (AWS Secrets Manager)

### 4.5 Endpoint Encryption

| Device | Encryption | Method |
|--------|------------|--------|
| MacBooks | Required | FileVault (AES-256) |
| Mobile devices | Required | Device encryption |

## 5. Encryption in Transit

### 5.1 TLS Configuration

| Component | TLS Version | Policy |
|-----------|-------------|--------|
| ALB (superglue-loadbalancer) | TLS 1.2+ | ELBSecurityPolicy-TLS13-1-2-2021-06 |
| ALB (Elastic Beanstalk) | TLS 1.2+ | ELBSecurityPolicy-TLS13-1-2-2021-06 |
| RDS connections | TLS 1.2+ | Required |
| Supabase connections | TLS 1.2+ | Required |
| GitHub API | TLS 1.2+ | Required |

**Minimum TLS Version:** TLS 1.2 is enforced for all connections.

### 5.2 Certificate Management

| Certificate | Provider | Auto-Renewal |
|-------------|----------|--------------|
| *.superglue.cloud | AWS ACM | Yes |
| app.superglue.cloud | AWS ACM | Yes |
| graphql.superglue.cloud | AWS ACM | Yes |

### 5.3 Internal Communications

| Connection | Encryption |
|------------|------------|
| Application → RDS | TLS required |
| Application → Supabase | TLS required |
| GitHub Actions → AWS | HTTPS + OIDC |
| Inter-service (VPC) | TLS recommended |

### 5.4 Database Connection Security

PostgreSQL connections enforce SSL:

```
ssl: { rejectUnauthorized: false }  // TLS enabled, self-signed allowed for RDS
```

**Note:** `rejectUnauthorized: false` is used because RDS uses Amazon-signed certificates. Connection is still encrypted.

## 6. Key Management

### 6.1 Key Storage

| Key Type | Storage Location | Access Control |
|----------|------------------|----------------|
| AWS KMS keys | AWS KMS | IAM policies |
| Master encryption key | AWS Secrets Manager | IAM policies |
| TLS certificates | AWS ACM | IAM policies |
| SSH keys | Local (encrypted) | User-managed |
| API keys | AWS Secrets Manager | IAM policies |

### 6.2 Key Rotation

| Key Type | Rotation Frequency | Method |
|----------|-------------------|--------|
| AWS KMS keys | Annual (automatic) | AWS managed |
| Master encryption key | Annual | Manual rotation |
| TLS certificates | Before expiry | ACM auto-renewal |
| API keys | On compromise or annually | Manual |
| SSH keys | On offboarding | Manual |

### 6.3 Key Rotation Procedure

**Master Encryption Key Rotation:**
1. Generate new master key
2. Update AWS Secrets Manager
3. Re-encrypt existing credentials with new key
4. Verify decryption works
5. Remove old key after verification

### 6.4 Key Access

| Role | KMS Access | Secrets Manager Access |
|------|------------|------------------------|
| Stefan (CTO) | Full | Full |
| Nicolas | Limited | Limited |
| Application (IAM role) | Encrypt/Decrypt | Read secrets |

## 7. Data Classification & Encryption Requirements

| Classification | At Rest | In Transit | Application-Level |
|----------------|---------|------------|-------------------|
| Strictly Confidential | Required (KMS) | Required (TLS 1.2+) | Required |
| Confidential | Required | Required (TLS 1.2+) | Recommended |
| Internal | Required | Required (TLS 1.2+) | Optional |
| Public | Optional | Recommended | Not required |

## 8. Prohibited Practices

- Storing encryption keys in source code
- Transmitting sensitive data over unencrypted channels
- Using deprecated encryption algorithms
- Sharing encryption keys via email or chat
- Disabling encryption on production systems
- Using the same key for multiple purposes

## 9. Monitoring & Compliance

### 9.1 Encryption Monitoring

| Check | Method | Frequency |
|-------|--------|-----------|
| S3 bucket encryption | AWS Config / manual | Quarterly |
| RDS encryption status | AWS Console | Quarterly |
| TLS certificate expiry | ACM monitoring | Continuous |
| KMS key usage | CloudTrail | On-demand |

### 9.2 Compliance Verification

- Quarterly review of encryption settings
- Annual encryption policy review
- Audit of key access logs

## 10. Incident Response

### 10.1 Key Compromise Response

If an encryption key is suspected compromised:

1. **Immediate:** Rotate the compromised key
2. **Assess:** Determine scope of potential exposure
3. **Re-encrypt:** Re-encrypt affected data with new key
4. **Investigate:** Review access logs for unauthorized use
5. **Report:** Document incident and notify stakeholders

### 10.2 Certificate Issues

If TLS certificate issues occur:

1. Check ACM for certificate status
2. Verify DNS configuration
3. Renew or reissue certificate if needed
4. Update load balancer configuration

## 11. Compliance

This policy supports:
- SOC 2 Type II (C1.1: Confidentiality)
- CAIQ (CEK: Cryptography, Encryption & Key Management)
- GDPR (Article 32: Encryption as security measure)

## 12. Policy Review

This policy is reviewed annually or when:
- New encryption requirements emerge
- Security incidents occur
- Infrastructure changes affect encryption

---
**Approved by:** Stefan Faistenauer (CTO) | **Next Review:** February 2027
