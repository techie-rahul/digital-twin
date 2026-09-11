# Digital Twin Scenarios, Benchmarks & Dependency Catalog

This document provides complete documentation of all benchmark datasets available for testing and demonstrating the **FinBank Cyber Digital Twin** platform and web application.

---

## 1. Scenario Catalog Overview

The platform supports four standardized scenarios spanning different complexity tiers:

| Scenario Tier | Scenario ID | File Path | Assets | Edges | Flows | Controls | Crown Jewels |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Easy** | `twin-cloudapp-easy` | `backend/data/scenarios/easy.json` | 5 | 7 | 2 | 2 | `customer-db` |
| **Medium** | `twin-neobank-medium` | `backend/data/scenarios/medium.json` | 10 | 14 | 5 | 4 | `core-ledger-db`, `s3-archive` |
| **Golden (Baseline)** | `twin-finbank-golden` | `backend/data/scenarios/golden.json` | 10 | 16 | 6 | 4 | `prod-db`, `backup-01` |
| **Hard (Enterprise)** | `twin-globalbank-hard` | `backend/data/scenarios/hard.json` | 18 | 27 | 8 | 6 | `core-ledger-db`, `hsm-vault`, `activedir-dc`, `dr-backup-site`, `swift-gateway` |

All four scenarios are automatically loaded on backend startup and accessible via the API:
* List loaded twins: `GET /twins` or `GET /api/twins`
* Fetch twin topology: `GET /twin/{twin_id}` or `GET /api/twin/{twin_id}`
* Default golden twin: `GET /twin` or `GET /api/twin`

---

## 2. Detailed Dataset Specifications

### Tier 1: Easy — CloudApp MicroSaaS (`twin-cloudapp-easy`)
* **Context:** A modern, lightweight cloud startup running a single monolithic web server, Redis cache, and a managed PostgreSQL customer database.
* **Topological Footprint:**
  * **DMZ Zone (1):** `cdn-gw` (Cloud CDN Ingress)
  * **Corp Zone (2):** `app-server` (Node.js backend), `dev-laptop` (Developer workstation)
  * **Prod Zone (2):** `cache-redis` (Session cache), `customer-db` (Crown Jewel 👑, Crit 4)
* **Identities (2):**
  * `id-user-dev` (Developer, Tier-2)
  * `id-admin-cloud` (Cloud Admin, Tier-0)
* **Operational Dependencies / Service Flows:**
  * **F1:** Public Storefront Ingress (`cdn-gw` $\rightarrow$ `app-server`, Crit 3)
  * **F2:** Customer Orders & Payment Ledger Sync (`app-server` $\rightarrow$ `customer-db`, Crit 4 — **Mission-Critical**)
* **Available Controls:**
  * `ctrl-waf-easy` ($800, blocks `exploit_public_app`, efficacy: 85%)
  * `ctrl-db-auth-easy` ($1,200, blocks `db_login`, efficacy: 90%)

---

### Tier 2: Medium — Neobank Payments Core (`twin-neobank-medium`)
* **Context:** A growing fintech neobank featuring decoupled OIDC authentication, asynchronous Kafka/Redis event buses, hardened Teleport bastions, and automated CI/CD runners.
* **Topological Footprint:**
  * **DMZ Zone (2):** `internet` (Ingress), `api-gateway` (Kong Gateway)
  * **Corp Zone (3):** `auth-idp` (Keycloak OIDC), `ws-engineer` (SRE Workstation), `ci-pipeline` (ArgoCD / Actions Runner)
  * **Mgmt Zone (2):** `bastion-mgmt` (Teleport Bastion), `s3-archive` (Compliance Vault 👑, Crit 4)
  * **Prod Zone (3):** `ledger-service` (Settlement API), `redis-queue` (Event Bus), `core-ledger-db` (Double-Entry Ledger 👑, Crit 5)
* **Operational Dependencies / Service Flows:**
  * **F1:** Customer Mobile Payment Requests (`internet` $\rightarrow$ `api-gateway`, Crit 3)
  * **F2:** OIDC Token Authorization Verification (`api-gateway` $\rightarrow$ `auth-idp`, Crit 4 — **Mission-Critical**)
  * **F3:** Core Banking Ledger Transaction Commits (`ledger-service` $\rightarrow$ `core-ledger-db`, Crit 5 — **Mission-Critical**)
  * **F4:** DevOps Infrastructure Deployments (`ws-engineer` $\rightarrow$ `ci-pipeline`, Crit 3)
  * **F5:** Nightly Encrypted DR Snapshot (`bastion-mgmt` $\rightarrow$ `s3-archive`, Crit 4 — **Mission-Critical**)
* **Available Controls:**
  * `ctrl-mfa-bastion` ($1,500, blocks `rdp_lateral`, `ssh_lateral`, efficacy: 95%)
  * `ctrl-payment-seg` ($2,500, blocks `db_login`, `rdp_lateral`, `ssh_lateral`, efficacy: 90%)
  * `ctrl-host-edr` ($2,000, blocks `cred_dump`, `priv_esc_local`, efficacy: 85%)
  * `ctrl-credguard` ($1,000, blocks `cred_dump`, efficacy: 90%)

---

### Tier 3: Golden — FinBank Core Banking Benchmark (`twin-finbank-golden`)
* **Context:** Canonical 10-node benchmark scenario used across all core validation tests and the primary dashboard demo.
* **Topological Footprint:**
  * **DMZ (2):** `internet`, `web-dmz`
  * **Corp (4):** `ws-dev`, `ws-hr`, `fileshare`, `ci-runner`
  * **Mgmt (2):** `jump-01`, `backup-01` (Crown Jewel 👑, Crit 4)
  * **Prod (2):** `payroll-api`, `prod-db` (Crown Jewel 👑, Crit 5)
* **Operational Dependencies / Service Flows:**
  * **F1:** Customer Web Banking Traffic (`internet` $\rightarrow$ `web-dmz`, Crit 3)
  * **F2:** Web Portal API Integration (`web-dmz` $\rightarrow$ `payroll-api`, Crit 4)
  * **F3:** Payroll Transaction Ledger Commits (`payroll-api` $\rightarrow$ `prod-db`, Crit 5 — **Must Never Break**)
  * **F4:** Developer CI/CD Build Pipelines (`ws-dev` $\rightarrow$ `ci-runner`, Crit 3)
  * **F5:** Corporate File Sync & Archival (`ws-hr` $\rightarrow$ `fileshare`, Crit 3)
  * **F6:** DR Backup Synchronization (`jump-01` $\rightarrow$ `backup-01`, Crit 4 — **Protected Exception**)

---

### Tier 4: Hard — GlobalBank Tier-0 Enterprise Conglomerate (`twin-globalbank-hard`)
* **Context:** Massive enterprise architecture modeling a multinational tier-0 banking conglomerate with transatlantic WAF clusters, SWIFT Alliance clearing engines, Hardware Security Modules (HSM), CyberArk privileged vaults, and Kerberos Domain Controllers.
* **Topological Footprint (18 Assets):**
  * **DMZ (3):** `ext-waf-us`, `ext-waf-eu`, `portal-cluster`
  * **Corp (5):** `ws-trader`, `ws-analyst`, `ws-sysadmin`, `corp-fileshare`, `ci-cluster`
  * **Mgmt (5):** `activedir-dc` (Crown Jewel 👑, Crit 5), `cyberark-vault` (Crit 5), `jumpbox-mgmt`, `siem-collector`, `dr-backup-site` (Crown Jewel 👑, Crit 5)
  * **Prod (5):** `swift-gateway` (Crown Jewel 👑, Crit 5), `payment-api`, `settle-engine`, `core-ledger-db` (Crown Jewel 👑, Crit 5), `hsm-vault` (Crown Jewel 👑, Crit 5)
* **Identities (6):**
  * `id-user-retail` (Tier 3), `id-trader-fx` (Tier 2), `id-admin-domain` (Tier 0), `id-sec-ops` (Tier 1), `id-svc-swift` (Tier 1), `id-svc-ledger` (Tier 1)
* **Mission-Critical Service Flows:**
  * **F4:** SWIFT Interbank Settlement Protocol (Crit 5)
  * **F5:** Core Banking Master Ledger Commits (Crit 5)
  * **F6:** Hardware Security Module (HSM) Cryptographic Key Signing (Crit 5)
* **Available Controls:**
  * `ctrl-pam-cyberark` ($3,500), `ctrl-swift-seg` ($4,000), `ctrl-mfa-bastion` ($2,000), `ctrl-edr-corp` ($3,000), `ctrl-credguard-corp` ($1,500), `ctrl-waf-global` ($2,500)

---

## 3. Empirical Benchmark Matrix

Empirical simulation results (Monte Carlo $N=500$ trials, seed 42) across all tiers:

| Metric | Easy (`cloudapp`) | Medium (`neobank`) | Golden (`finbank`) | Hard (`globalbank`) |
| :--- | :---: | :---: | :---: | :---: |
| **Insider $P(\text{success})$ Baseline** | **$22.6\%$** | **$1.2\%$** | **$1.6\%$** | **$11.8\%$** |
| **Mean Attacker Effort (Cost)** | $2.49$ | $6.67$ | $3.88$ | $4.03$ |
| **P90 Attacker Effort** | $5.00$ | $8.00$ | $5.00$ | $5.00$ |
| **Feasible Attack Path Count** | 3 | 3 | 4 | 3 |
| **Shortest Path Distance (Hops)** | 1 | 2 | 2 | 3 |
| **Primary Choke Points** | `app-server -> customer-db` ($58\%$) | `ci-pipeline -> bastion-mgmt` ($66\%$) | `web-dmz -> payroll-api` ($91\%$) | `payment-api -> settle-engine` ($100\%$) |
| **Optimal Control Portfolio** | `ctrl-waf-easy` ($800) | `ctrl-credguard` ($1,000) | `ctrl-edr` ($2,000) | `ctrl-credguard-corp` ($1,500) |

---

## 4. How to Test the Website With These Datasets

### A. Launch the Backend API
From the project root:
```powershell
python -m uvicorn backend.api.main:app --host 127.0.0.1 --port 8000 --reload
```

### B. Launch the Frontend Dashboard
In a second terminal:
```powershell
cd dashboard
npm run dev
```
Open `http://localhost:5173`.

### C. Testing Different Datasets via API / curl

1. **Inspect Loaded Scenarios:**
   ```bash
   curl http://localhost:8000/twins
   ```
   *Response:* `["twin-cloudapp-easy", "twin-globalbank-hard", "twin-finbank-golden", "twin-neobank-medium"]`

2. **Simulate Adversary on Hard Scenario:**
   ```bash
   curl -X POST http://localhost:8000/simulate \
     -H "Content-Type: application/json" \
     -d '{"twin_id": "twin-globalbank-hard", "agent_id": "agent-insider", "n": 200, "seed": 42}'
   ```

3. **Run Crawl Auditor (Chess Piece) on Medium Scenario:**
   ```bash
   curl -X POST http://localhost:8000/crawl-audit \
     -H "Content-Type: application/json" \
     -d '{"start_node": "ws-engineer", "target_node": "core-ledger-db"}'
   ```

4. **Evaluate Change with CAB Safety Constraints on Easy Scenario:**
   ```bash
   curl -X POST http://localhost:8000/evaluate-change \
     -H "Content-Type: application/json" \
     -d '{"twin_id": "twin-cloudapp-easy", "control_ids": ["ctrl-waf-easy"], "agent_id": "agent-external"}'
   ```
