import { Asset, Edge, ServiceFlow, Control } from '../types/api';

export const GOLDEN_ASSETS: Asset[] = [
  // 1. DMZ Zone (Public Ingress)
  {
    id: 'internet',
    name: 'External Internet Gateway',
    kind: 'server',
    zone: 'dmz',
    criticality: 1,
    crown_jewel: false,
  },
  {
    id: 'web-dmz',
    name: 'Online Banking Web DMZ',
    kind: 'server',
    zone: 'dmz',
    criticality: 3,
    crown_jewel: false,
  },
  {
    id: 'api-gw',
    name: 'Core Banking API Gateway',
    kind: 'server',
    zone: 'dmz',
    criticality: 3,
    crown_jewel: false,
  },

  // 2. Corporate LAN Zone (Workstations & CI)
  {
    id: 'ws-dev',
    name: 'Developer Workstation',
    kind: 'workstation',
    zone: 'corp',
    criticality: 2,
    crown_jewel: false,
  },
  {
    id: 'ws-hr',
    name: 'HR Operations Workstation',
    kind: 'workstation',
    zone: 'corp',
    criticality: 2,
    crown_jewel: false,
  },
  {
    id: 'fileshare',
    name: 'Corporate File Share',
    kind: 'share',
    zone: 'corp',
    criticality: 3,
    crown_jewel: false,
  },
  {
    id: 'ci-runner',
    name: 'CI/CD Build & Deployment Runner',
    kind: 'server',
    zone: 'corp',
    criticality: 3,
    crown_jewel: false,
  },
  {
    id: 'ws-contractor',
    name: 'Contractor Workstation (Third-Party)',
    kind: 'workstation',
    zone: 'corp',
    criticality: 2,
    crown_jewel: false,
  },

  // 3. Management Bastion Zone (Tier-0 Gateway & Identity)
  {
    id: 'jump-01',
    name: 'Privileged Admin Jump Host',
    kind: 'server',
    zone: 'mgmt',
    criticality: 4,
    crown_jewel: false,
  },
  {
    id: 'iam-auth',
    name: 'Active Directory & IAM Domain Controller',
    kind: 'server',
    zone: 'mgmt',
    criticality: 4,
    crown_jewel: false,
  },
  {
    id: 'backup-01',
    name: 'Disaster Recovery Backup Vault',
    kind: 'server',
    zone: 'mgmt',
    criticality: 4,
    crown_jewel: true,
  },
  {
    id: 'siem-soc',
    name: 'Central SIEM & SOC Collector',
    kind: 'server',
    zone: 'mgmt',
    criticality: 3,
    crown_jewel: false,
  },

  // 4. Production Zone (Crown Jewels & Clearing)
  {
    id: 'payroll-api',
    name: 'Payroll & Payment Processing API',
    kind: 'server',
    zone: 'prod',
    criticality: 4,
    crown_jewel: false,
  },
  {
    id: 'swift-gw',
    name: 'SWIFT / ACH Payment Clearing Service',
    kind: 'server',
    zone: 'prod',
    criticality: 4,
    crown_jewel: false,
  },
  {
    id: 'prod-db',
    name: 'Core Production Database',
    kind: 'database',
    zone: 'prod',
    criticality: 5,
    crown_jewel: true,
  },
];

export const GOLDEN_EDGES: Edge[] = [
  // DMZ Ingress
  { src: 'internet', dst: 'web-dmz', technique: 'exploit_public_app' },
  { src: 'internet', dst: 'api-gw', technique: 'api_abuse' },
  { src: 'web-dmz', dst: 'api-gw', technique: 'service_call' },
  { src: 'web-dmz', dst: 'payroll-api', technique: 'db_login' },
  { src: 'web-dmz', dst: 'jump-01', technique: 'ssh_lateral' },

  // Route D automated machine pivot (web-dmz ➔ ci-runner ➔ backup-01 ➔ prod-db)
  { src: 'web-dmz', dst: 'ci-runner', technique: 'webhook_dispatch' },
  { src: 'ci-runner', dst: 'backup-01', technique: 'deploy_key' },
  { src: 'backup-01', dst: 'prod-db', technique: 'dr_restore' },

  // Corporate LAN lateral movement
  { src: 'ws-dev', dst: 'fileshare', technique: 'smb_lateral' },
  { src: 'ws-dev', dst: 'ci-runner', technique: 'ssh_lateral' },
  { src: 'ws-dev', dst: 'jump-01', technique: 'rdp_lateral' },
  { src: 'ws-hr', dst: 'fileshare', technique: 'smb_lateral' },
  { src: 'fileshare', dst: 'ws-dev', technique: 'smb_lateral' },
  { src: 'ci-runner', dst: 'jump-01', technique: 'ssh_lateral' },

  // Sync Drift: Contractor Admin Grant (Preset 5)
  { src: 'ws-contractor', dst: 'jump-01', technique: 'cloud_admin_grant' },
  { src: 'ws-contractor', dst: 'iam-auth', technique: 'cloud_admin_grant' },

  // Management Bastion to Production & Backup
  { src: 'jump-01', dst: 'prod-db', technique: 'rdp_lateral' },
  { src: 'jump-01', dst: 'backup-01', technique: 'rdp_lateral' },
  { src: 'jump-01', dst: 'iam-auth', technique: 'domain_admin_dump' },
  { src: 'iam-auth', dst: 'prod-db', technique: 'kerberos_ticket' },

  // Production service dependencies
  { src: 'payroll-api', dst: 'prod-db', technique: 'db_login' },
  { src: 'swift-gw', dst: 'prod-db', technique: 'db_login' },
  { src: 'api-gw', dst: 'swift-gw', technique: 'iso20022_clearing' },
];

export const GOLDEN_FLOWS: ServiceFlow[] = [
  {
    id: 'F1',
    name: 'Customer Web Banking Traffic',
    src: 'internet',
    dst: 'web-dmz',
    technique: 'exploit_public_app',
    criticality: 3,
  },
  {
    id: 'F2',
    name: 'Web Portal API Integration',
    src: 'web-dmz',
    dst: 'api-gw',
    technique: 'service_call',
    criticality: 4,
  },
  {
    id: 'F3',
    name: 'Payroll Transaction Ledger Commits',
    src: 'payroll-api',
    dst: 'prod-db',
    technique: 'db_login',
    criticality: 5,
  },
  {
    id: 'F4',
    name: 'Developer CI/CD Build Pipelines',
    src: 'ws-dev',
    dst: 'ci-runner',
    technique: 'ssh_lateral',
    criticality: 3,
  },
  {
    id: 'F5',
    name: 'Corporate File Sync & Archival',
    src: 'ws-hr',
    dst: 'fileshare',
    technique: 'smb_lateral',
    criticality: 3,
  },
  {
    id: 'F6',
    name: 'Disaster Recovery Backup Synchronization',
    src: 'jump-01',
    dst: 'backup-01',
    technique: 'rdp_lateral',
    criticality: 4,
  },
  {
    id: 'F7',
    name: 'SWIFT Interbank Clearing Settlement',
    src: 'swift-gw',
    dst: 'prod-db',
    technique: 'db_login',
    criticality: 4,
  },
  {
    id: 'F8',
    name: 'SOC Security Telemetry Collection',
    src: 'siem-soc',
    dst: 'jump-01',
    technique: 'telemetry_forward',
    criticality: 3,
  },
];

export const GOLDEN_CONTROLS: Control[] = [
  {
    id: 'ctrl-network-seg',
    name: 'Full Core Banking Subnet Segmentation',
    cost: 2500,
    blocks: ['network_segmentation', 'db_login', 'ssh_lateral', 'rdp_lateral', 'smb_lateral', 'exploit_public_app'],
    scope: ['prod-db', 'backup-01'],
    efficacy: 0.95,
  },
  {
    id: 'ctrl-scoped-seg',
    name: 'Scoped Application-Aware Segmentation',
    cost: 2800,
    blocks: ['network_segmentation', 'ssh_lateral', 'rdp_lateral', 'smb_lateral'],
    scope: ['prod-db'],
    efficacy: 0.92,
  },
  {
    id: 'ctrl-mfa',
    name: 'Privileged Access Multi-Factor Authentication',
    cost: 1500,
    blocks: ['mfa', 'ssh_lateral', 'rdp_lateral'],
    scope: ['jump-01', 'ws-dev'],
    efficacy: 0.90,
  },
  {
    id: 'ctrl-edr',
    name: 'Host Endpoint Detection and Response',
    cost: 2000,
    blocks: ['edr', 'exploit_public_app', 'cred_dump'],
    scope: ['ws-dev', 'ws-hr', 'ci-runner'],
    efficacy: 0.85,
  },
  {
    id: 'ctrl-credguard',
    name: 'Windows Credential Guard Protection',
    cost: 1000,
    blocks: ['credential_guard', 'cred_dump'],
    scope: ['ws-dev', 'jump-01'],
    efficacy: 0.90,
  },
];
