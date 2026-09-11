# FinBank & Acme Security Digital Twin Datasets Bundle

This folder contains all datasets, benchmarks, threat models, and telemetry databases generated for the Cyber Security Digital Twin platform.

## Contents Overview

### 1. `scenarios_and_benchmarks/`
Standardized cyber digital twin environments modeled for attack path simulation, Monte Carlo agent walks, and security control evaluation:
- **`easy.json` (`twin-cloudapp-easy`)**:
  - Context: CloudApp MicroSaaS
  - Assets: 5 (DMZ, Corp, Prod) | Crown Jewels: `customer-db`
  - Dependencies: 2 service flows | Controls: WAF, DB Authentication
- **`medium.json` (`twin-neobank-medium`)**:
  - Context: Neobank Payments Core
  - Assets: 10 (DMZ, Corp, Mgmt, Prod) | Crown Jewels: `core-ledger-db`, `s3-archive`
  - Dependencies: 5 service flows | Controls: MFA Bastion, Network Segregation, Host EDR, Credential Guard
- **`golden.json` (`twin-finbank-golden`)**:
  - Context: FinBank Core Banking Benchmark (Baseline scenario)
  - Assets: 10 | Edges: 16 | Dependencies: 6 service flows | Controls: 4
  - Crown Jewels: `prod-db`, `backup-01`
- **`hard.json` (`twin-globalbank-hard`)**:
  - Context: GlobalBank Tier-0 Multinational Enterprise Conglomerate
  - Assets: 18 | Edges: 27 | Dependencies: 8 service flows | Controls: 6
  - Crown Jewels: `activedir-dc`, `core-ledger-db`, `swift-gateway`, `hsm-vault`, `dr-backup-site`
- **`benchmarks.json`**:
  - Pre-computed baseline Monte Carlo metrics (1000 trials), attack path distributions, p_success, mean attacker effort, choke point centrality, and blast radius calculations for all scenarios.
- **`finbank_scenario.json` / `scenario.json`**:
  - Full production banking infrastructure topology with IP addresses, OS types, service ports, criticality tiers, and known vulnerabilities.
- **`techniques.yaml`**:
  - 15+ MITRE ATT&CK techniques with prerequisites, capabilities granted, noise levels, success probabilities, and blocking controls.

### 2. `database_tables_csv_json/`
Extracted relational database records from the Security Posture & Asset Discovery engine (`digital_twin.db`). Each table is exported in both **CSV** (for Excel/Spreadsheets) and **JSON** (for programmatic consumption):
- **`nodes`** (28 assets): Discovered hosts, databases, internet domains, API gateways, clusters, and data assets.
- **`edges`** (23 connections): Network connectivity, IAM role bindings, and service dependencies.
- **`findings`** (13 security findings): Critical and high vulnerabilities with risk scores, priority labels, business impacts, potential consequences, viable attack paths, blast radius levels, and step-by-step remediation procedures.
- **`evidences`** (13 telemetry records): Underlying telemetry observations and config snapshots backing each security finding.
- **`sbom_documents` & `sbom_components`**: Software Bill of Materials (CycloneDX 1.4) listing components (`lodash`, `jsonwebtoken`, `express`, `axios`) and associated CVEs (`CVE-2021-23337`, etc.).
- **`organizations`**: Organizational entity profile and posture metrics (`Acme Retail`).
- **`posture_snapshots`**: Longitudinal security posture score history across Identity, Infrastructure, Application, Dependencies, Cloud, and Third-Party categories.
- **`simulation_records`**: Security mechanism simulation results tracking before/after posture scores, viable attack path elimination, and crown-jewel blast radius changes.
- **`digital_twin.db`**: The raw SQLite database.
