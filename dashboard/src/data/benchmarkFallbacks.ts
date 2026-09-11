import { Twin } from "../types/api";

export const BENCHMARK_FALLBACK_TWINS: Record<string, Twin> = {
  "twin-cloudapp-easy": {
    "id": "twin-cloudapp-easy",
    "assets": [
      {
        "id": "cdn-gw",
        "name": "Cloud CDN & Edge Ingress",
        "kind": "server",
        "zone": "dmz",
        "criticality": 1,
        "crown_jewel": false
      },
      {
        "id": "app-server",
        "name": "Monolithic Web Application Server",
        "kind": "server",
        "zone": "corp",
        "criticality": 3,
        "crown_jewel": false
      },
      {
        "id": "dev-laptop",
        "name": "Lead Developer Workstation",
        "kind": "workstation",
        "zone": "corp",
        "criticality": 2,
        "crown_jewel": false
      },
      {
        "id": "cache-redis",
        "name": "User Session Redis Cache",
        "kind": "server",
        "zone": "prod",
        "criticality": 3,
        "crown_jewel": false
      },
      {
        "id": "customer-db",
        "name": "PostgreSQL Customer & Transaction DB",
        "kind": "database",
        "zone": "prod",
        "criticality": 4,
        "crown_jewel": true
      }
    ],
    "identities": [
      {
        "id": "id-user-dev",
        "name": "Full-Stack Web Developer",
        "kind": "user",
        "tier": 2
      },
      {
        "id": "id-admin-cloud",
        "name": "AWS Root Cloud Administrator",
        "kind": "admin",
        "tier": 0
      }
    ],
    "edges": [
      {
        "src": "cdn-gw",
        "dst": "app-server",
        "technique": "exploit_public_app"
      },
      {
        "src": "dev-laptop",
        "dst": "app-server",
        "technique": "ssh_lateral"
      },
      {
        "src": "app-server",
        "dst": "cache-redis",
        "technique": "db_login"
      },
      {
        "src": "app-server",
        "dst": "customer-db",
        "technique": "db_login"
      },
      {
        "src": "dev-laptop",
        "dst": "customer-db",
        "technique": "db_login"
      },
      {
        "src": "id-admin-cloud",
        "dst": "dev-laptop",
        "technique": "db_login"
      },
      {
        "src": "id-user-dev",
        "dst": "app-server",
        "technique": "db_login"
      },
      {
        "src": "id-user-dev",
        "dst": "dev-laptop",
        "technique": "db_login"
      }
    ],
    "flows": [
      {
        "id": "F1",
        "name": "Public Storefront Ingress Traffic",
        "src": "cdn-gw",
        "dst": "app-server",
        "technique": "exploit_public_app",
        "criticality": 3
      },
      {
        "id": "F2",
        "name": "Customer Orders & Payment Ledger Sync",
        "src": "app-server",
        "dst": "customer-db",
        "technique": "db_login",
        "criticality": 4
      }
    ],
    "controls": [
      {
        "id": "ctrl-waf-easy",
        "name": "Cloudflare Edge WAF Protection",
        "cost": 800,
        "blocks": [
          "exploit_public_app",
          "T1190"
        ],
        "scope": [
          "cdn-gw",
          "app-server"
        ],
        "efficacy": 0.85
      },
      {
        "id": "ctrl-db-auth-easy",
        "name": "Database IAM Token Authentication",
        "cost": 1200,
        "blocks": [
          "db_login",
          "T1078"
        ],
        "scope": [
          "customer-db"
        ],
        "efficacy": 0.9
      }
    ],
    "parent_id": null
  },
  "twin-neobank-medium": {
    "id": "twin-neobank-medium",
    "assets": [
      {
        "id": "internet",
        "name": "Public Ingress Gateway",
        "kind": "server",
        "zone": "dmz",
        "criticality": 1,
        "crown_jewel": false
      },
      {
        "id": "api-gateway",
        "name": "Kong API Gateway & Rate Limiter",
        "kind": "server",
        "zone": "dmz",
        "criticality": 3,
        "crown_jewel": false
      },
      {
        "id": "auth-idp",
        "name": "Keycloak OIDC Identity Provider",
        "kind": "server",
        "zone": "corp",
        "criticality": 4,
        "crown_jewel": false
      },
      {
        "id": "ws-engineer",
        "name": "Lead SRE DevOps Workstation",
        "kind": "workstation",
        "zone": "corp",
        "criticality": 2,
        "crown_jewel": false
      },
      {
        "id": "ci-pipeline",
        "name": "ArgoCD / GitHub Actions Runner",
        "kind": "server",
        "zone": "corp",
        "criticality": 3,
        "crown_jewel": false
      },
      {
        "id": "bastion-mgmt",
        "name": "Hardened Teleport Bastion Host",
        "kind": "server",
        "zone": "mgmt",
        "criticality": 4,
        "crown_jewel": false
      },
      {
        "id": "ledger-service",
        "name": "Card Authorization Settlement API",
        "kind": "server",
        "zone": "prod",
        "criticality": 4,
        "crown_jewel": false
      },
      {
        "id": "redis-queue",
        "name": "Kafka / Redis Event Stream Bus",
        "kind": "server",
        "zone": "prod",
        "criticality": 3,
        "crown_jewel": false
      },
      {
        "id": "core-ledger-db",
        "name": "Immutable Double-Entry Financial DB",
        "kind": "database",
        "zone": "prod",
        "criticality": 5,
        "crown_jewel": true
      },
      {
        "id": "s3-archive",
        "name": "S3 Compliance & Disaster Recovery Vault",
        "kind": "share",
        "zone": "mgmt",
        "criticality": 4,
        "crown_jewel": true
      }
    ],
    "identities": [
      {
        "id": "id-user-fintech",
        "name": "Mobile Banking End-User",
        "kind": "user",
        "tier": 3
      },
      {
        "id": "id-sre-lead",
        "name": "Principal Site Reliability Engineer",
        "kind": "user",
        "tier": 2
      },
      {
        "id": "id-cloud-sec",
        "name": "Cloud Security Administrator",
        "kind": "admin",
        "tier": 0
      },
      {
        "id": "id-svc-settle",
        "name": "Automated Settlement Engine Principal",
        "kind": "service_account",
        "tier": 1
      }
    ],
    "edges": [
      {
        "src": "internet",
        "dst": "api-gateway",
        "technique": "exploit_public_app"
      },
      {
        "src": "api-gateway",
        "dst": "auth-idp",
        "technique": "db_login"
      },
      {
        "src": "api-gateway",
        "dst": "ledger-service",
        "technique": "db_login"
      },
      {
        "src": "ws-engineer",
        "dst": "ci-pipeline",
        "technique": "ssh_lateral"
      },
      {
        "src": "ws-engineer",
        "dst": "bastion-mgmt",
        "technique": "rdp_lateral"
      },
      {
        "src": "ci-pipeline",
        "dst": "bastion-mgmt",
        "technique": "ssh_lateral"
      },
      {
        "src": "bastion-mgmt",
        "dst": "core-ledger-db",
        "technique": "rdp_lateral"
      },
      {
        "src": "bastion-mgmt",
        "dst": "s3-archive",
        "technique": "ssh_lateral"
      },
      {
        "src": "ledger-service",
        "dst": "redis-queue",
        "technique": "db_login"
      },
      {
        "src": "ledger-service",
        "dst": "core-ledger-db",
        "technique": "db_login"
      },
      {
        "src": "id-cloud-sec",
        "dst": "bastion-mgmt",
        "technique": "db_login"
      },
      {
        "src": "id-sre-lead",
        "dst": "ws-engineer",
        "technique": "db_login"
      },
      {
        "src": "id-svc-settle",
        "dst": "ledger-service",
        "technique": "db_login"
      },
      {
        "src": "id-user-fintech",
        "dst": "api-gateway",
        "technique": "db_login"
      }
    ],
    "flows": [
      {
        "id": "F1",
        "name": "Customer Mobile Payment Requests",
        "src": "internet",
        "dst": "api-gateway",
        "technique": "exploit_public_app",
        "criticality": 3
      },
      {
        "id": "F2",
        "name": "OIDC Token Authorization Verification",
        "src": "api-gateway",
        "dst": "auth-idp",
        "technique": "db_login",
        "criticality": 4
      },
      {
        "id": "F3",
        "name": "Core Banking Ledger Transaction Commits",
        "src": "ledger-service",
        "dst": "core-ledger-db",
        "technique": "db_login",
        "criticality": 5
      },
      {
        "id": "F4",
        "name": "DevOps Automated Infrastructure CD Deployments",
        "src": "ws-engineer",
        "dst": "ci-pipeline",
        "technique": "ssh_lateral",
        "criticality": 3
      },
      {
        "id": "F5",
        "name": "Nightly Encrypted Disaster Recovery Snapshot",
        "src": "bastion-mgmt",
        "dst": "s3-archive",
        "technique": "ssh_lateral",
        "criticality": 4
      }
    ],
    "controls": [
      {
        "id": "ctrl-mfa-bastion",
        "name": "FIDO2 Hardware MFA on Teleport Bastion",
        "cost": 1500,
        "blocks": [
          "rdp_lateral",
          "ssh_lateral",
          "T1021.001",
          "T1021.004"
        ],
        "scope": [
          "bastion-mgmt"
        ],
        "efficacy": 0.95
      },
      {
        "id": "ctrl-payment-seg",
        "name": "Payment Subnet Zero-Trust Microsegmentation",
        "cost": 2500,
        "blocks": [
          "db_login",
          "ssh_lateral",
          "rdp_lateral",
          "T1078",
          "T1021.001"
        ],
        "scope": [
          "core-ledger-db",
          "s3-archive"
        ],
        "efficacy": 0.9
      },
      {
        "id": "ctrl-host-edr",
        "name": "CrowdStrike Falcon Host EDR Protection",
        "cost": 2000,
        "blocks": [
          "cred_dump",
          "priv_esc_local",
          "T1003",
          "T1068"
        ],
        "scope": [
          "ws-engineer",
          "ci-pipeline"
        ],
        "efficacy": 0.85
      },
      {
        "id": "ctrl-credguard",
        "name": "Windows Credential Guard & LSA Isolation",
        "cost": 1000,
        "blocks": [
          "cred_dump",
          "T1003"
        ],
        "scope": [
          "ws-engineer",
          "bastion-mgmt"
        ],
        "efficacy": 0.9
      }
    ],
    "parent_id": null
  },
  "twin-globalbank-hard": {
    "id": "twin-globalbank-hard",
    "assets": [
      {
        "id": "ext-waf-us",
        "name": "North America Edge WAF & Reverse Proxy",
        "kind": "server",
        "zone": "dmz",
        "criticality": 2,
        "crown_jewel": false
      },
      {
        "id": "ext-waf-eu",
        "name": "European OpenBanking PSD2 Gateway",
        "kind": "server",
        "zone": "dmz",
        "criticality": 3,
        "crown_jewel": false
      },
      {
        "id": "portal-cluster",
        "name": "Global Retail Banking Portal Microservices",
        "kind": "server",
        "zone": "dmz",
        "criticality": 3,
        "crown_jewel": false
      },
      {
        "id": "ws-trader",
        "name": "High-Frequency FX Trading Desk Terminal",
        "kind": "workstation",
        "zone": "corp",
        "criticality": 3,
        "crown_jewel": false
      },
      {
        "id": "ws-analyst",
        "name": "AML & Financial Crime Investigator PC",
        "kind": "workstation",
        "zone": "corp",
        "criticality": 2,
        "crown_jewel": false
      },
      {
        "id": "ws-sysadmin",
        "name": "Tier-1 IT Infrastructure Support PC",
        "kind": "workstation",
        "zone": "corp",
        "criticality": 3,
        "crown_jewel": false
      },
      {
        "id": "corp-fileshare",
        "name": "Enterprise Document NetApp Storage Share",
        "kind": "share",
        "zone": "corp",
        "criticality": 3,
        "crown_jewel": false
      },
      {
        "id": "ci-cluster",
        "name": "Enterprise GitLab CI/CD Orchestrator",
        "kind": "server",
        "zone": "corp",
        "criticality": 3,
        "crown_jewel": false
      },
      {
        "id": "activedir-dc",
        "name": "Tier-0 Primary Active Directory Domain Controller",
        "kind": "server",
        "zone": "mgmt",
        "criticality": 5,
        "crown_jewel": true
      },
      {
        "id": "cyberark-vault",
        "name": "CyberArk Enterprise Privileged Access Vault",
        "kind": "server",
        "zone": "mgmt",
        "criticality": 5,
        "crown_jewel": false
      },
      {
        "id": "jumpbox-mgmt",
        "name": "Global Operations Bastion Jump Host",
        "kind": "server",
        "zone": "mgmt",
        "criticality": 4,
        "crown_jewel": false
      },
      {
        "id": "siem-collector",
        "name": "Splunk Enterprise SIEM Event Collector",
        "kind": "server",
        "zone": "mgmt",
        "criticality": 4,
        "crown_jewel": false
      },
      {
        "id": "swift-gateway",
        "name": "SWIFT Alliance Clearing & Messaging Engine",
        "kind": "server",
        "zone": "prod",
        "criticality": 5,
        "crown_jewel": true
      },
      {
        "id": "payment-api",
        "name": "Core Real-Time Transaction Routing API",
        "kind": "server",
        "zone": "prod",
        "criticality": 4,
        "crown_jewel": false
      },
      {
        "id": "settle-engine",
        "name": "Overnight ACH & Interbank Settlement Service",
        "kind": "server",
        "zone": "prod",
        "criticality": 4,
        "crown_jewel": false
      },
      {
        "id": "core-ledger-db",
        "name": "Tier-0 Core Banking Master Ledger Database",
        "kind": "database",
        "zone": "prod",
        "criticality": 5,
        "crown_jewel": true
      },
      {
        "id": "hsm-vault",
        "name": "Hardware Security Module (HSM) Key Vault",
        "kind": "database",
        "zone": "prod",
        "criticality": 5,
        "crown_jewel": true
      },
      {
        "id": "dr-backup-site",
        "name": "Disaster Recovery Geographically Replicated Vault",
        "kind": "server",
        "zone": "mgmt",
        "criticality": 5,
        "crown_jewel": true
      }
    ],
    "identities": [
      {
        "id": "id-user-retail",
        "name": "Retail Consumer Identity",
        "kind": "user",
        "tier": 3
      },
      {
        "id": "id-trader-fx",
        "name": "Institutional FX Broker Identity",
        "kind": "user",
        "tier": 2
      },
      {
        "id": "id-admin-domain",
        "name": "Global Enterprise Domain Administrator",
        "kind": "admin",
        "tier": 0
      },
      {
        "id": "id-sec-ops",
        "name": "SOC Lead Incident Responder",
        "kind": "admin",
        "tier": 1
      },
      {
        "id": "id-svc-swift",
        "name": "SWIFT Alliance Protocol Service Account",
        "kind": "service_account",
        "tier": 1
      },
      {
        "id": "id-svc-ledger",
        "name": "Core Banking Financial Database Service Account",
        "kind": "service_account",
        "tier": 1
      }
    ],
    "edges": [
      {
        "src": "ext-waf-us",
        "dst": "portal-cluster",
        "technique": "exploit_public_app"
      },
      {
        "src": "ext-waf-eu",
        "dst": "portal-cluster",
        "technique": "exploit_public_app"
      },
      {
        "src": "portal-cluster",
        "dst": "payment-api",
        "technique": "db_login"
      },
      {
        "src": "ws-trader",
        "dst": "payment-api",
        "technique": "db_login"
      },
      {
        "src": "ws-trader",
        "dst": "corp-fileshare",
        "technique": "smb_lateral"
      },
      {
        "src": "ws-analyst",
        "dst": "corp-fileshare",
        "technique": "smb_lateral"
      },
      {
        "src": "ws-sysadmin",
        "dst": "ci-cluster",
        "technique": "ssh_lateral"
      },
      {
        "src": "ws-sysadmin",
        "dst": "jumpbox-mgmt",
        "technique": "rdp_lateral"
      },
      {
        "src": "ci-cluster",
        "dst": "jumpbox-mgmt",
        "technique": "ssh_lateral"
      },
      {
        "src": "corp-fileshare",
        "dst": "ws-sysadmin",
        "technique": "smb_lateral"
      },
      {
        "src": "jumpbox-mgmt",
        "dst": "cyberark-vault",
        "technique": "rdp_lateral"
      },
      {
        "src": "cyberark-vault",
        "dst": "activedir-dc",
        "technique": "rdp_lateral"
      },
      {
        "src": "jumpbox-mgmt",
        "dst": "siem-collector",
        "technique": "ssh_lateral"
      },
      {
        "src": "jumpbox-mgmt",
        "dst": "dr-backup-site",
        "technique": "rdp_lateral"
      },
      {
        "src": "activedir-dc",
        "dst": "core-ledger-db",
        "technique": "db_login"
      },
      {
        "src": "activedir-dc",
        "dst": "swift-gateway",
        "technique": "ssh_lateral"
      },
      {
        "src": "payment-api",
        "dst": "settle-engine",
        "technique": "db_login"
      },
      {
        "src": "payment-api",
        "dst": "swift-gateway",
        "technique": "db_login"
      },
      {
        "src": "settle-engine",
        "dst": "core-ledger-db",
        "technique": "db_login"
      },
      {
        "src": "swift-gateway",
        "dst": "hsm-vault",
        "technique": "db_login"
      },
      {
        "src": "swift-gateway",
        "dst": "core-ledger-db",
        "technique": "db_login"
      },
      {
        "src": "id-admin-domain",
        "dst": "cyberark-vault",
        "technique": "db_login"
      },
      {
        "src": "id-sec-ops",
        "dst": "jumpbox-mgmt",
        "technique": "db_login"
      },
      {
        "src": "id-trader-fx",
        "dst": "ws-trader",
        "technique": "db_login"
      },
      {
        "src": "id-svc-swift",
        "dst": "swift-gateway",
        "technique": "db_login"
      },
      {
        "src": "id-svc-ledger",
        "dst": "core-ledger-db",
        "technique": "db_login"
      },
      {
        "src": "id-user-retail",
        "dst": "portal-cluster",
        "technique": "db_login"
      }
    ],
    "flows": [
      {
        "id": "F1",
        "name": "Global Retail Customer Banking Traffic",
        "src": "ext-waf-us",
        "dst": "portal-cluster",
        "technique": "exploit_public_app",
        "criticality": 3
      },
      {
        "id": "F2",
        "name": "OpenBanking API Transaction Integration",
        "src": "ext-waf-eu",
        "dst": "portal-cluster",
        "technique": "exploit_public_app",
        "criticality": 4
      },
      {
        "id": "F3",
        "name": "Payment Authorization & Fraud Scoring Bus",
        "src": "portal-cluster",
        "dst": "payment-api",
        "technique": "db_login",
        "criticality": 4
      },
      {
        "id": "F4",
        "name": "SWIFT Interbank Settlement Protocol",
        "src": "payment-api",
        "dst": "swift-gateway",
        "technique": "db_login",
        "criticality": 5
      },
      {
        "id": "F5",
        "name": "Core Banking Ledger Transaction Commits",
        "src": "settle-engine",
        "dst": "core-ledger-db",
        "technique": "db_login",
        "criticality": 5
      },
      {
        "id": "F6",
        "name": "Hardware Security Module Cryptographic Signing",
        "src": "swift-gateway",
        "dst": "hsm-vault",
        "technique": "db_login",
        "criticality": 5
      },
      {
        "id": "F7",
        "name": "Enterprise Document & Audit Record Sync",
        "src": "ws-trader",
        "dst": "corp-fileshare",
        "technique": "smb_lateral",
        "criticality": 3
      },
      {
        "id": "F8",
        "name": "Disaster Recovery Real-Time Mirroring",
        "src": "jumpbox-mgmt",
        "dst": "dr-backup-site",
        "technique": "rdp_lateral",
        "criticality": 4
      }
    ],
    "controls": [
      {
        "id": "ctrl-pam-cyberark",
        "name": "CyberArk Privileged Session & Credential Isolation",
        "cost": 3500,
        "blocks": [
          "rdp_lateral",
          "ssh_lateral",
          "cred_dump",
          "T1021.001",
          "T1021.004",
          "T1003"
        ],
        "scope": [
          "cyberark-vault",
          "activedir-dc"
        ],
        "efficacy": 0.95
      },
      {
        "id": "ctrl-swift-seg",
        "name": "SWIFT & Core Ledger PCI Microsegmentation",
        "cost": 4000,
        "blocks": [
          "db_login",
          "rdp_lateral",
          "ssh_lateral",
          "T1078",
          "T1021.001"
        ],
        "scope": [
          "swift-gateway",
          "core-ledger-db",
          "hsm-vault"
        ],
        "efficacy": 0.95
      },
      {
        "id": "ctrl-mfa-bastion",
        "name": "Tier-0 Hardware Token MFA Bastion Guard",
        "cost": 2000,
        "blocks": [
          "rdp_lateral",
          "ssh_lateral",
          "T1021.001",
          "T1021.004"
        ],
        "scope": [
          "jumpbox-mgmt"
        ],
        "efficacy": 0.9
      },
      {
        "id": "ctrl-edr-corp",
        "name": "CrowdStrike Falcon Enterprise EDR & XDR",
        "cost": 3000,
        "blocks": [
          "cred_dump",
          "priv_esc_local",
          "T1003",
          "T1068"
        ],
        "scope": [
          "ws-trader",
          "ws-analyst",
          "ws-sysadmin",
          "ci-cluster"
        ],
        "efficacy": 0.85
      },
      {
        "id": "ctrl-credguard-corp",
        "name": "Windows Credential Guard Virtualization-Based Security",
        "cost": 1500,
        "blocks": [
          "cred_dump",
          "T1003"
        ],
        "scope": [
          "ws-sysadmin",
          "jumpbox-mgmt",
          "ws-trader"
        ],
        "efficacy": 0.9
      },
      {
        "id": "ctrl-waf-global",
        "name": "F5 Distributed Cloud DDoS & API Armor",
        "cost": 2500,
        "blocks": [
          "exploit_public_app",
          "T1190"
        ],
        "scope": [
          "ext-waf-us",
          "ext-waf-eu",
          "portal-cluster"
        ],
        "efficacy": 0.9
      }
    ],
    "parent_id": null
  },
  "twin-medicare-hospital": {
    "id": "twin-medicare-hospital",
    "assets": [
      {
        "id": "internet",
        "name": "Public Patient Web Ingress",
        "kind": "server",
        "zone": "dmz",
        "criticality": 1,
        "crown_jewel": false
      },
      {
        "id": "patient-portal",
        "name": "Patient Appointment & Telehealth Portal",
        "kind": "server",
        "zone": "dmz",
        "criticality": 3,
        "crown_jewel": false
      },
      {
        "id": "doctor-tablet",
        "name": "Emergency Ward Doctor Tablet",
        "kind": "workstation",
        "zone": "corp",
        "criticality": 2,
        "crown_jewel": false
      },
      {
        "id": "radiology-pacs",
        "name": "Radiology PACS Imaging Server",
        "kind": "server",
        "zone": "corp",
        "criticality": 3,
        "crown_jewel": false
      },
      {
        "id": "nurse-station",
        "name": "ICU Central Nurse Terminal",
        "kind": "workstation",
        "zone": "corp",
        "criticality": 3,
        "crown_jewel": false
      },
      {
        "id": "telehealth-api",
        "name": "Clinical Integration Gateway",
        "kind": "server",
        "zone": "prod",
        "criticality": 4,
        "crown_jewel": false
      },
      {
        "id": "ehr-database",
        "name": "Electronic Health Records & Patient PII DB",
        "kind": "database",
        "zone": "prod",
        "criticality": 5,
        "crown_jewel": true
      },
      {
        "id": "icu-telemetry",
        "name": "ICU Real-Time Bedside Telemetry Controller",
        "kind": "server",
        "zone": "prod",
        "criticality": 5,
        "crown_jewel": true
      }
    ],
    "identities": [
      {
        "id": "id-user-patient",
        "name": "Outpatient User",
        "kind": "user",
        "tier": 3
      },
      {
        "id": "id-user-doctor",
        "name": "Attending Physician",
        "kind": "user",
        "tier": 2
      },
      {
        "id": "id-admin-biomed",
        "name": "BioMed Systems Administrator",
        "kind": "admin",
        "tier": 0
      }
    ],
    "edges": [
      {
        "src": "internet",
        "dst": "patient-portal",
        "technique": "exploit_public_app"
      },
      {
        "src": "patient-portal",
        "dst": "telehealth-api",
        "technique": "db_login"
      },
      {
        "src": "patient-portal",
        "dst": "doctor-tablet",
        "technique": "ssh_lateral"
      },
      {
        "src": "doctor-tablet",
        "dst": "radiology-pacs",
        "technique": "smb_lateral"
      },
      {
        "src": "radiology-pacs",
        "dst": "ehr-database",
        "technique": "db_login"
      },
      {
        "src": "telehealth-api",
        "dst": "ehr-database",
        "technique": "db_login"
      },
      {
        "src": "nurse-station",
        "dst": "telehealth-api",
        "technique": "ssh_lateral"
      },
      {
        "src": "nurse-station",
        "dst": "icu-telemetry",
        "technique": "rdp_lateral"
      },
      {
        "src": "doctor-tablet",
        "dst": "nurse-station",
        "technique": "smb_lateral"
      },
      {
        "src": "id-user-patient",
        "dst": "patient-portal",
        "technique": "db_login"
      },
      {
        "src": "id-user-doctor",
        "dst": "doctor-tablet",
        "technique": "db_login"
      },
      {
        "src": "id-user-doctor",
        "dst": "nurse-station",
        "technique": "db_login"
      },
      {
        "src": "id-admin-biomed",
        "dst": "telehealth-api",
        "technique": "db_login"
      },
      {
        "src": "id-admin-biomed",
        "dst": "ehr-database",
        "technique": "db_login"
      },
      {
        "src": "id-admin-biomed",
        "dst": "icu-telemetry",
        "technique": "db_login"
      }
    ],
    "flows": [
      {
        "id": "F1",
        "name": "Patient Telehealth Booking Traffic",
        "src": "internet",
        "dst": "patient-portal",
        "technique": "exploit_public_app",
        "criticality": 3
      },
      {
        "id": "F2",
        "name": "Physician EHR Prescription Sync",
        "src": "telehealth-api",
        "dst": "ehr-database",
        "technique": "db_login",
        "criticality": 5
      },
      {
        "id": "F3",
        "name": "Radiology Diagnostic Image Sync",
        "src": "doctor-tablet",
        "dst": "radiology-pacs",
        "technique": "smb_lateral",
        "criticality": 4
      },
      {
        "id": "F4",
        "name": "ICU Continuous Bedside Telemetry Stream",
        "src": "nurse-station",
        "dst": "icu-telemetry",
        "technique": "rdp_lateral",
        "criticality": 5
      }
    ],
    "controls": [
      {
        "id": "ctrl-hospital-mfa",
        "name": "Clinical Workstation MFA Enforcement",
        "cost": 1200,
        "blocks": [
          "rdp_lateral",
          "ssh_lateral",
          "T1021.001",
          "T1021.004"
        ],
        "scope": [
          "nurse-station",
          "icu-telemetry"
        ],
        "efficacy": 0.9
      },
      {
        "id": "ctrl-pacs-microseg",
        "name": "PACS Network Microsegmentation",
        "cost": 1800,
        "blocks": [
          "smb_lateral",
          "T1021.002"
        ],
        "scope": [
          "radiology-pacs"
        ],
        "efficacy": 0.95
      },
      {
        "id": "ctrl-ehr-guard",
        "name": "Zero-Trust DB Authentication Barrier",
        "cost": 2200,
        "blocks": [
          "db_login",
          "T1078"
        ],
        "scope": [
          "ehr-database"
        ],
        "efficacy": 0.92
      }
    ],
    "parent_id": null
  },
  "twin-finbank-golden": {
    "id": "twin-finbank-golden",
    "assets": [
      {
        "id": "internet",
        "name": "External Internet Gateway",
        "kind": "server",
        "zone": "dmz",
        "criticality": 1,
        "crown_jewel": false
      },
      {
        "id": "web-dmz",
        "name": "Online Banking Web DMZ",
        "kind": "server",
        "zone": "dmz",
        "criticality": 3,
        "crown_jewel": false
      },
      {
        "id": "ws-dev",
        "name": "Developer Workstation",
        "kind": "workstation",
        "zone": "corp",
        "criticality": 2,
        "crown_jewel": false
      },
      {
        "id": "ws-hr",
        "name": "HR Operations Workstation",
        "kind": "workstation",
        "zone": "corp",
        "criticality": 2,
        "crown_jewel": false
      },
      {
        "id": "fileshare",
        "name": "Corporate File Share",
        "kind": "share",
        "zone": "corp",
        "criticality": 3,
        "crown_jewel": false
      },
      {
        "id": "ci-runner",
        "name": "CI/CD Build & Deployment Runner",
        "kind": "server",
        "zone": "corp",
        "criticality": 3,
        "crown_jewel": false
      },
      {
        "id": "jump-01",
        "name": "Privileged Admin Jump Host",
        "kind": "server",
        "zone": "mgmt",
        "criticality": 4,
        "crown_jewel": false
      },
      {
        "id": "payroll-api",
        "name": "Payroll & Payment Processing API",
        "kind": "server",
        "zone": "prod",
        "criticality": 4,
        "crown_jewel": false
      },
      {
        "id": "backup-01",
        "name": "Disaster Recovery Backup Vault",
        "kind": "server",
        "zone": "mgmt",
        "criticality": 4,
        "crown_jewel": true
      },
      {
        "id": "prod-db",
        "name": "Core Production Database",
        "kind": "database",
        "zone": "prod",
        "criticality": 5,
        "crown_jewel": true
      }
    ],
    "identities": [
      {
        "id": "id-user-customer",
        "name": "Retail Banking Customer",
        "kind": "user",
        "tier": 3
      },
      {
        "id": "id-user-analyst",
        "name": "Financial Operations Analyst",
        "kind": "user",
        "tier": 2
      },
      {
        "id": "id-user-admin",
        "name": "Cloud Infrastructure Administrator",
        "kind": "admin",
        "tier": 0
      },
      {
        "id": "id-svc-payroll",
        "name": "Payroll Settlement Service Account",
        "kind": "service_account",
        "tier": 1
      }
    ],
    "edges": [
      {
        "src": "internet",
        "dst": "web-dmz",
        "technique": "exploit_public_app"
      },
      {
        "src": "web-dmz",
        "dst": "payroll-api",
        "technique": "db_login"
      },
      {
        "src": "web-dmz",
        "dst": "jump-01",
        "technique": "ssh_lateral"
      },
      {
        "src": "ws-dev",
        "dst": "fileshare",
        "technique": "smb_lateral"
      },
      {
        "src": "ws-dev",
        "dst": "ci-runner",
        "technique": "ssh_lateral"
      },
      {
        "src": "ws-dev",
        "dst": "jump-01",
        "technique": "rdp_lateral"
      },
      {
        "src": "ws-hr",
        "dst": "fileshare",
        "technique": "smb_lateral"
      },
      {
        "src": "fileshare",
        "dst": "ws-dev",
        "technique": "smb_lateral"
      },
      {
        "src": "ci-runner",
        "dst": "jump-01",
        "technique": "ssh_lateral"
      },
      {
        "src": "jump-01",
        "dst": "prod-db",
        "technique": "rdp_lateral"
      },
      {
        "src": "jump-01",
        "dst": "backup-01",
        "technique": "rdp_lateral"
      },
      {
        "src": "payroll-api",
        "dst": "prod-db",
        "technique": "db_login"
      },
      {
        "src": "id-user-admin",
        "dst": "jump-01",
        "technique": "db_login"
      },
      {
        "src": "id-user-analyst",
        "dst": "ws-dev",
        "technique": "db_login"
      },
      {
        "src": "id-svc-payroll",
        "dst": "payroll-api",
        "technique": "db_login"
      },
      {
        "src": "id-user-customer",
        "dst": "web-dmz",
        "technique": "db_login"
      }
    ],
    "flows": [
      {
        "id": "F1",
        "name": "Customer Web Banking Traffic",
        "src": "internet",
        "dst": "web-dmz",
        "technique": "exploit_public_app",
        "criticality": 3
      },
      {
        "id": "F2",
        "name": "Web Portal API Integration",
        "src": "web-dmz",
        "dst": "payroll-api",
        "technique": "db_login",
        "criticality": 4
      },
      {
        "id": "F3",
        "name": "Payroll Transaction Ledger Commits",
        "src": "payroll-api",
        "dst": "prod-db",
        "technique": "db_login",
        "criticality": 5
      },
      {
        "id": "F4",
        "name": "Developer CI/CD Build Pipelines",
        "src": "ws-dev",
        "dst": "ci-runner",
        "technique": "ssh_lateral",
        "criticality": 3
      },
      {
        "id": "F5",
        "name": "Corporate File Sync & Archival",
        "src": "ws-hr",
        "dst": "fileshare",
        "technique": "smb_lateral",
        "criticality": 3
      },
      {
        "id": "F6",
        "name": "Disaster Recovery Backup Synchronization",
        "src": "jump-01",
        "dst": "backup-01",
        "technique": "rdp_lateral",
        "criticality": 4
      }
    ],
    "controls": [
      {
        "id": "ctrl-mfa",
        "name": "Privileged Access Multi-Factor Authentication",
        "cost": 1500,
        "blocks": [
          "mfa",
          "rdp_lateral",
          "ssh_lateral",
          "db_login",
          "T1078",
          "T1021.001",
          "T1021.004"
        ],
        "scope": [
          "jump-01",
          "payroll-api"
        ],
        "efficacy": 0.95
      },
      {
        "id": "ctrl-network-seg",
        "name": "Core Banking Network Segmentation",
        "cost": 2500,
        "blocks": [
          "network_segmentation",
          "exploit_public_app",
          "rdp_lateral",
          "smb_lateral",
          "ssh_lateral",
          "db_login",
          "T1190",
          "T1021.001",
          "T1021.002",
          "T1021.004"
        ],
        "scope": [
          "prod-db",
          "backup-01"
        ],
        "efficacy": 0.9
      },
      {
        "id": "ctrl-edr",
        "name": "Host Endpoint Detection and Response",
        "cost": 2000,
        "blocks": [
          "edr",
          "cred_dump",
          "priv_esc_local",
          "T1003",
          "T1068"
        ],
        "scope": [
          "ws-dev",
          "ws-hr",
          "ci-runner"
        ],
        "efficacy": 0.85
      },
      {
        "id": "ctrl-credguard",
        "name": "Windows Credential Guard & LSA Isolation",
        "cost": 1000,
        "blocks": [
          "credential_guard",
          "cred_dump",
          "T1003"
        ],
        "scope": [
          "ws-dev",
          "jump-01"
        ],
        "efficacy": 0.9
      }
    ],
    "parent_id": null
  }
};
