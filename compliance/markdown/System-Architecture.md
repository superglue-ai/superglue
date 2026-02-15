# System Architecture Documentation
**Version:** 1.0 | **Date:** February 2026 | **Company:** Index Commerce GmbH

## 1. Overview

This document provides comprehensive system and application architecture diagrams for the Superglue workflow automation platform, including data communications architecture for all system components.

**Platform:** Superglue - AI-native integration and workflow automation platform  
**Primary Region:** AWS us-east-1  
**AWS Account:** 277707112101

---

## 2. High-Level System Architecture

```mermaid
flowchart TB
    subgraph Users["Users & Clients"]
        WebClient["Web Browser"]
        APIClient["API Clients"]
        SDKClient["SDK Integrations"]
    end

    subgraph CDN["Content Delivery"]
        CloudFront["AWS CloudFront"]
    end

    subgraph LoadBalancing["Load Balancing Layer"]
        ALB1["ALB: superglue-loadbalancer"]
        ALB2["ALB: Elastic Beanstalk"]
    end

    subgraph Compute["Compute Layer (EC2 x8)"]
        WebUI["Web UI<br/>app.superglue.cloud<br/>"]
        REST["REST API<br/>api.superglue.cloud<br/>"]
    end

    subgraph Data["Data Layer"]
        RDS1["RDS Aurora<br/>superglue-prod"]
        RDS2["RDS<br/>database-1"]
        S3["S3 Buckets x8"]
    end

    subgraph Serverless["Serverless"]
        Lambda1["Lambda<br/>Node.js 24"]
        Lambda2["Lambda<br/>Node.js 24"]
        Lambda3["Lambda<br/>Node.js 24"]
    end

    subgraph External["External Services"]
        Supabase["Supabase<br/>Auth + PostgreSQL"]
        GitHub["GitHub<br/>CI/CD + Source"]
        DockerHub["Docker Hub<br/>Container Registry"]
        PostHog["PostHog<br/>Analytics"]
        Bedrock["AWS Bedrock<br/>AI/LLM"]
    end

    WebClient -->|HTTPS| CloudFront
    APIClient -->|HTTPS| ALB1
    SDKClient -->|HTTPS| ALB1
    
    CloudFront -->|HTTPS| ALB1
    ALB1 -->|HTTP| WebUI
    ALB1 -->|HTTP| REST
    ALB2 -->|HTTP| Compute

    WebUI --> REST
    REST --> RDS1
    REST --> S3
    
    Compute --> Supabase
    Compute --> Bedrock
    Lambda1 --> S3
    Lambda2 --> RDS1
    Lambda3 --> Supabase
```

---

## 3. Application Architecture

```mermaid
flowchart LR
    subgraph Frontend["Frontend (Next.js)"]
        WebApp["Web Application<br/>app.superglue.cloud"]
        AgentChat["Agent Chat UI"]
        Dashboard["Dashboard"]
    end

    subgraph Backend["Backend (Node.js)"]
        RESTAPI["REST API<br/>api.superglue.cloud"]
        Workers["Worker Pools"]
        ToolExec["Tool Execution Engine"]
    end

    subgraph Shared["Shared Package"]
        Types["TypeScript Types"]
        Utils["Utilities"]
    end

    subgraph Storage["Storage Layer"]
        PostgreSQL["PostgreSQL<br/>(RDS Aurora)"]
        ObjectStore["Object Storage<br/>(S3/MinIO)"]
        SecretsManager["AWS Secrets Manager"]
    end

    WebApp --> RESTAPI
    AgentChat --> RESTAPI
    Dashboard --> RESTAPI
    
    RESTAPI --> Workers
    RESTAPI --> ToolExec
    
    Workers --> PostgreSQL
    ToolExec --> PostgreSQL
    ToolExec --> ObjectStore
    RESTAPI --> SecretsManager
    
    Frontend -.-> Shared
    Backend -.-> Shared
```

---

## 4. Data Communications Architecture

### 4.1 Network Flow Diagram

```mermaid
flowchart TB
    subgraph Internet["Internet"]
        Client["Client Request"]
    end

    subgraph AWS["AWS VPC (us-east-1)"]
        subgraph Public["Public Subnet"]
            ALB["Application Load Balancer<br/>TLS 1.2+ Termination"]
        end
        
        subgraph Private["Private Subnet"]
            EC2["EC2 Instances<br/>(Security Groups x14)"]
            RDS["RDS Aurora<br/>(Encrypted)"]
            Lambda["Lambda Functions"]
        end
        
        subgraph Storage["Storage"]
            S3["S3 Buckets<br/>(AES-256)"]
            Secrets["Secrets Manager<br/>(KMS Encrypted)"]
        end
    end

    subgraph External["External Services"]
        Supabase["Supabase"]
        GitHub["GitHub"]
        Bedrock["AWS Bedrock"]
    end

    Client -->|"HTTPS<br/>TLS 1.2+"| ALB
    ALB -->|"HTTP/HTTPS<br/>Internal"| EC2
    EC2 -->|"TLS Required"| RDS
    EC2 -->|"HTTPS"| S3
    EC2 -->|"IAM Auth"| Secrets
    EC2 -->|"TLS"| Supabase
    EC2 -->|"HTTPS + OIDC"| GitHub
    Lambda -->|"AWS SDK"| Bedrock
    Lambda -->|"HTTPS"| S3
```

### 4.2 Data Flow Matrix

| Source | Destination | Protocol | Encryption | Port |
|--------|-------------|----------|------------|------|
| Client | ALB | HTTPS | TLS 1.2+ | 443 |
| ALB | EC2 | HTTP/HTTPS | Optional | 3001-3002 |
| EC2 | RDS Aurora | PostgreSQL | TLS Required | 5432 |
| EC2 | S3 | HTTPS | TLS + AES-256 | 443 |
| EC2 | Supabase | HTTPS | TLS 1.2+ | 443 |
| EC2 | Secrets Manager | HTTPS | TLS + KMS | 443 |
| Lambda | S3 | HTTPS | TLS + AES-256 | 443 |
| Lambda | Bedrock | HTTPS | TLS + AWS Auth | 443 |
| GitHub Actions | AWS | HTTPS | TLS + OIDC | 443 |

---

## 5. Security Architecture

```mermaid
flowchart TB
    subgraph Perimeter["Perimeter Security"]
        WAF["AWS WAF<br/>(COUNT Mode)"]
        CloudFront["CloudFront"]
        ALB["ALB + TLS"]
    end

    subgraph Network["Network Security"]
        VPC["VPC"]
        SG["Security Groups x14"]
        NACL["Network ACLs"]
    end

    subgraph Identity["Identity & Access"]
        IAM["AWS IAM + MFA"]
        Supabase_Auth["Supabase Auth<br/>JWT + OAuth"]
        RLS["Row-Level Security"]
    end

    subgraph DataProtection["Data Protection"]
        KMS["AWS KMS<br/>6 Keys"]
        Encryption["AES-256<br/>At Rest"]
        TLS["TLS 1.2+<br/>In Transit"]
    end

    subgraph Monitoring["Security Monitoring"]
        CloudTrail["CloudTrail<br/>Multi-Region"]
        GuardDuty["GuardDuty<br/>Threat Detection"]
        SecurityHub["Security Hub"]
        CloudWatch["CloudWatch<br/>11 Log Groups"]
    end

    WAF --> CloudFront
    CloudFront --> ALB
    ALB --> VPC
    VPC --> SG
    
    IAM --> Network
    Supabase_Auth --> RLS
    
    KMS --> Encryption
    Encryption --> DataProtection
    TLS --> DataProtection
    
    CloudTrail --> Monitoring
    GuardDuty --> Monitoring
```

---

## 6. Infrastructure Components

### 6.1 AWS Resources

```mermaid
flowchart LR
    subgraph Compute["Compute"]
        EC2_1["EC2 Instance 1"]
        EC2_2["EC2 Instance 2"]
        EC2_3["EC2 Instance 3"]
        EC2_4["EC2 Instance 4"]
        EC2_5["EC2 Instance 5"]
        EC2_6["EC2 Instance 6"]
        EC2_7["EC2 Instance 7"]
        EC2_8["EC2 Instance 8"]
        Lambda_1["Lambda 1<br/>Node.js 24"]
        Lambda_2["Lambda 2<br/>Node.js 24"]
        Lambda_3["Lambda 3<br/>Node.js 24"]
    end

    subgraph Database["Database"]
        RDS_Aurora["RDS Aurora<br/>superglue-prod<br/>Multi-AZ, Encrypted"]
        RDS_1["RDS<br/>database-1<br/>Encrypted"]
    end

    subgraph Storage["Storage (8 Buckets)"]
        S3_1["S3: App Data"]
        S3_2["S3: Backups"]
        S3_3["S3: Logs"]
        S3_4["S3: Assets"]
    end

    subgraph LoadBalancer["Load Balancers"]
        ALB_1["ALB: superglue-loadbalancer"]
        ALB_2["ALB: Elastic Beanstalk"]
    end
```

### 6.2 Resource Summary

| Service | Count | Configuration |
|---------|-------|---------------|
| Load Balancers (ALB) | 2 | TLS termination, health checks |
| EC2 Instances | 8 | SSH key auth, Security Groups |
| RDS Aurora | 2 | Encrypted (AES-256), Multi-AZ |
| S3 Buckets | 8 | AES-256 encryption (SSE-S3) |
| Lambda Functions | 3 | Node.js 24 runtime |
| Security Groups | 14 | VPC network isolation |
| KMS Keys | 6 | Key management |
| CloudWatch Log Groups | 11 | Centralized logging |

---

## 7. CI/CD Pipeline Architecture

```mermaid
flowchart LR
    subgraph Development["Development"]
        Dev["Developer"]
        LocalEnv["Local Environment"]
    end

    subgraph GitHub["GitHub"]
        Repo["Repository"]
        PR["Pull Request"]
        Actions["GitHub Actions"]
        Dependabot["Dependabot"]
        SecretScan["Secret Scanning"]
    end

    subgraph Build["Build & Test"]
        CI["CI Pipeline"]
        Tests["Automated Tests"]
        Lint["Linting"]
        Audit["npm audit"]
    end

    subgraph Deploy["Deployment"]
        OIDC["OIDC Auth"]
        ECR["AWS ECR"]
        EB["Elastic Beanstalk"]
    end

    Dev --> LocalEnv
    LocalEnv -->|"git push"| Repo
    Repo --> PR
    PR --> Actions
    Actions --> CI
    CI --> Tests
    CI --> Lint
    CI --> Audit
    Dependabot --> PR
    SecretScan --> Repo
    
    CI -->|"On merge to main"| OIDC
    OIDC --> ECR
    ECR --> EB
```

---

## 8. Authentication & Authorization Flow

```mermaid
sequenceDiagram
    participant User
    participant WebApp
    participant Supabase
    participant API
    participant RDS

    User->>WebApp: Access Application
    WebApp->>Supabase: OAuth/Email Login
    Supabase->>Supabase: Validate Credentials
    Supabase->>WebApp: JWT Token
    WebApp->>API: Request + JWT
    API->>API: Validate JWT
    API->>RDS: Query with RLS Context
    RDS->>RDS: Apply Row-Level Security
    RDS->>API: Filtered Results
    API->>WebApp: Response
    WebApp->>User: Display Data
```

---

## 9. External Services Integration

```mermaid
flowchart TB
    subgraph Superglue["Superglue Platform"]
        Core["Core Application"]
    end

    subgraph Critical["Critical Services"]
        AWS["AWS<br/>Infrastructure"]
        Supabase["Supabase<br/>Auth + Database"]
        GitHub["GitHub<br/>Source + CI/CD"]
    end

    subgraph High["High Priority"]
        DockerHub["Docker Hub<br/>Containers"]
        Bedrock["AWS Bedrock<br/>AI/LLM"]
    end

    subgraph Medium["Medium Priority"]
        PostHog["PostHog<br/>Analytics"]
        Google["Google Workspace<br/>Email + SSO"]
        Slack["Slack<br/>Communication"]
        Delve["Delve<br/>Compliance"]
    end

    Core <-->|"AWS SDK<br/>IAM Auth"| AWS
    Core <-->|"HTTPS<br/>JWT"| Supabase
    Core <-->|"HTTPS<br/>OIDC"| GitHub
    Core <-->|"HTTPS"| DockerHub
    Core <-->|"AWS SDK"| Bedrock
    Core <-->|"HTTPS"| PostHog
```

---

## 10. Encryption Architecture

```mermaid
flowchart TB
    subgraph Transit["Encryption in Transit"]
        TLS["TLS 1.2+"]
        HTTPS["HTTPS"]
        SSL_DB["SSL/TLS<br/>Database Connections"]
    end

    subgraph Rest["Encryption at Rest"]
        KMS["AWS KMS<br/>6 Keys"]
        S3_Enc["S3: AES-256<br/>(SSE-S3)"]
        RDS_Enc["RDS: AES-256<br/>(KMS)"]
        EBS_Enc["EBS: AES-256<br/>(KMS)"]
    end

    subgraph AppLevel["Application-Level"]
        MasterKey["Master Encryption Key<br/>(Secrets Manager)"]
        Credentials["Integration Credentials<br/>AES-256-CBC"]
        OAuth["OAuth Tokens<br/>AES-256-CBC"]
        APIKeys["API Secrets<br/>AES-256-CBC"]
    end

    subgraph Endpoint["Endpoint"]
        FileVault["FileVault<br/>AES-256"]
    end

    TLS --> Transit
    HTTPS --> Transit
    SSL_DB --> Transit
    
    KMS --> S3_Enc
    KMS --> RDS_Enc
    KMS --> EBS_Enc
    
    MasterKey --> Credentials
    MasterKey --> OAuth
    MasterKey --> APIKeys
```

---

## 11. Disaster Recovery Architecture

```mermaid
flowchart TB
    subgraph Primary["Primary Region (us-east-1)"]
        ALB_P["ALB"]
        EC2_P["EC2 Instances"]
        RDS_P["RDS Aurora<br/>Multi-AZ"]
        S3_P["S3 Buckets"]
    end

    subgraph Backups["Backup Systems"]
        RDS_Backup["RDS Snapshots<br/>7-30 days"]
        S3_Versioning["S3 Versioning"]
        Supabase_Backup["Supabase Backups<br/>Daily"]
        GitHub_Backup["GitHub<br/>Source Code"]
    end

    subgraph Recovery["Recovery Targets"]
        RTO["RTO by Priority:<br/>Critical: 4h<br/>High: 8h<br/>Medium: 24h"]
        RPO["RPO by System:<br/>RDS: 5 min<br/>S3: Real-time<br/>Supabase: 24h"]
    end

    RDS_P -->|"Automated"| RDS_Backup
    S3_P -->|"Versioning"| S3_Versioning
    Primary -.->|"Recovery"| Recovery
```

---

## 12. Monitoring Architecture

```mermaid
flowchart TB
    subgraph Sources["Log Sources"]
        EC2_Logs["EC2 Logs"]
        RDS_Logs["RDS Logs"]
        Lambda_Logs["Lambda Logs"]
        ALB_Logs["ALB Access Logs"]
        API_Logs["API Logs"]
    end

    subgraph CloudWatch["CloudWatch"]
        LogGroups["11 Log Groups"]
        Alarms["5 Alarms"]
        Metrics["Metrics"]
    end

    subgraph Security["Security Monitoring"]
        CloudTrail["CloudTrail<br/>API Audit"]
        GuardDuty["GuardDuty<br/>Threat Detection"]
        SecurityHub["Security Hub<br/>Findings"]
    end

    subgraph Alerting["Alerting"]
        SNS["SNS Topics"]
        Slack_Alert["Slack<br/>Notifications"]
        Email_Alert["Email<br/>Alerts"]
    end

    EC2_Logs --> LogGroups
    RDS_Logs --> LogGroups
    Lambda_Logs --> LogGroups
    ALB_Logs --> LogGroups
    API_Logs --> LogGroups
    
    LogGroups --> Alarms
    Alarms --> SNS
    SNS --> Slack_Alert
    SNS --> Email_Alert
    
    CloudTrail --> SecurityHub
    GuardDuty --> SecurityHub
```

---

## 13. API Endpoints Summary

| Endpoint | Port | Protocol | Purpose |
|----------|------|----------|---------|
| `app.superglue.cloud` | 443 | HTTPS | Web Application (UI) |
| `api.superglue.cloud` | 443 | HTTPS | REST API |

---

## 14. Compliance Mapping

This architecture supports the following compliance frameworks:

| Framework | Relevant Controls |
|-----------|-------------------|
| **SOC 2 Type II** | CC6.1 (Logical Access), CC6.6 (Encryption), CC7.2 (Monitoring) |
| **GDPR** | Article 32 (Security of Processing), Article 25 (Data Protection by Design) |
| **CAIQ** | IVS (Infrastructure & Virtualization), CEK (Cryptography), IAM (Identity & Access) |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | February 2026 | Index Commerce GmbH | Initial release |

---
**Approved by:** Stefan Faistenauer (CTO) | **Next Review:** February 2027
