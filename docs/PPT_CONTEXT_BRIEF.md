# Security Change Sandbox — Full Project Context Brief

*Self-contained context for generating a pitch deck / presentation. Everything below is drawn from the actual codebase, docs and a live run of the system as of 12 Sep 2026.*

---

## 1. One-liner

**A cyber digital twin that tells a change board, for any proposed security control, both what it stops the attacker doing AND what it breaks in the business — before you deploy it.**

Event: **MUJ HackX 4.0** (36-hour hackathon, team of four).
Track: CyberSecurity & Defence Systems.
Problem statement: **PS #13 — Security Digital Twin for Threat Vector Assessment.**
Product name used in the UI: **FinBank Digital Twin / Security Change Sandbox.**

---

## 2. The problem (why this exists)

Security teams buy and deploy controls (MFA, network segmentation, EDR…) on gut feel. Two families of tools exist today, and each answers only half the question:

| Tool family | Tells you… | Does NOT tell you… |
|---|---|---|
| Attack-path tools (BloodHound Enterprise, XM Cyber, Microsoft Security Exposure Management, Wiz, Picus) | "This control removes N attack paths." | Whether it breaks payroll, backups, or a partner integration. Needs live estate telemetry. |
| Cloud policy analyzers (Azure VNM rule impact analyzer, Microsoft Conditional Access report-only, AWS IAM Policy Simulator) | "This rule will block this traffic." | Any security benefit, attack path or risk score. One cloud, one control type. |
| Research simulators (MAL / securiCAD, MAL Simulator (KTH), CAGE Challenges, CybORG, CyberBattleSim) | Probabilistic attacker/defender simulation, adaptive agents. | No business-flow model. Research gyms, not procurement decision support. |
| Threat-modelling tools (IriusRisk, MS TMT, Threat Dragon) | Design-time checklists. | Qualitative only, no simulation. |

**The decision a Change Advisory Board (CAB) actually makes** is: *"Can I deploy this safely, within budget, and how sure are we?"* Nobody joins security benefit and business breakage on the same model for a single proposed change.

### Approved positioning claim (use this wording verbatim, it is defensible)
> "Adaptive attacker modelling exists in research — MAL Simulator, the CAGE challenges. Control impact simulation exists in cloud platforms — Azure's rule impact analyzer. To our knowledge no product joins security benefit and business breakage on one model for a single proposed change, which is the decision a change board actually makes."

### Claims that must NOT appear on any slide (falsifiable by one informed judge)
- "Nobody models attacker adaptation" — MAL Simulator and CAGE do.
- "First to simulate control impact before deployment" — Azure does.
- "We invented attack paths / choke points / blast radius" — all commodity.

Attacker re-planning is a **mechanism we use**, not the novelty we claim.

---

## 3. Product thesis

> Attack-path tools tell you a control helps. Cloud policy analyzers tell you a control breaks something. Neither tells you both about the same change. **Propose a control and see the attacker's new route, the business flows you would sever, the cost, and how confident we are — before you deploy.**

The key modelling primitive that makes this possible is the **`ServiceFlow`** — a *legitimate* dependency (e.g. `payroll-api → prod-db`, criticality 5) that must keep working. Every security control is evaluated against both the attack graph AND the service-flow registry.

---

## 4. How the PS #13 requirements are satisfied (map each to a feature)

| PS #13 requirement (verbatim) | How we satisfy it |
|---|---|
| **Environment modelling** — assets, network reachability, identities, privileges and existing controls as a queryable model | Frozen Pydantic v2 twin model (`Asset`, `Identity`, `Edge`, `ServiceFlow`, `Control`, `Agent`, `Twin`) loaded from JSON, held in NetworkX, content-hashed (SHA-256) for lineage. `GET /twin/{id}`. |
| **Attack path discovery** — chains by which an initial foothold escalates to a critical asset | Algorithm A: **stateful DFS** over `(node, frozenset(capabilities))` — an edge is only traversable once the credentials collected earlier are held. Caps: `max_depth=8`, `max_states=5000`. Produces the complete path inventory ("N critical paths"). |
| **Agent-based simulation** — adversary agents with defined capabilities run against the twin | Algorithm B: **sampled Monte Carlo agent walk**. At each hop the agent enumerates only edges admissible from where it stands with what it holds, scores them, picks probabilistically. Local knowledge, not omniscient — so adaptation is *emergent*: block an edge and the agent never enumerates it. Three agent profiles (external, insider, privileged). Seeded RNG → deterministic. |
| **Control effectiveness testing** — quantify how much a proposed control reduces reachable paths *before it is purchased* | `POST /evaluate-change` — the centrepiece. Clones the twin with the control, re-runs both algorithms, diffs before/after. |
| **Prioritisation** — rank remediation by the number of critical paths it eliminates, not raw vulnerability count | Choke-point ranking via edge frequency across walks; Chess Piece Auditor's "Prioritized Chokepoint Remediation Portfolio (cut-set)"; constrained portfolio optimizer (`POST /optimize`). |
| **Continuous synchronisation** — update the twin as the environment changes | JSON re-import (`POST /twin/import`), cloning with mutations (`POST /twin/{id}/clone`), SHA-256 lineage chain (`GET /lineage/{id}`), and demo preset 5 "Sync Drift" showing a contractor admin grant regressing risk. |
| **Bonus — blast radius** — for any asset, what an attacker reaches next if it falls | `GET /blast-radius/{asset_id}` (`nx.descendants` + crown-jewel detection), plus in-graph interactive blast-radius highlighting. |

---

## 5. Two metrics — ship BOTH, labelled (this is a pitch line)

1. **`naive_path_reduction_pct`** — path-count reduction. Required by the brief. Labelled "industry-standard metric".
2. **`honest_cost_increase_pct`** (shown as "Attacker cost increase (adaptive)") — how much harder the *re-planning* attacker has to work.

Pitch: *"The brief asks us to rank by paths eliminated. We do — and here's why that number is misleading, and what we propose instead."* Path count assumes a passive attacker; ours re-plans.

Third headline number: **`p_success_delta`** — change in probability of reaching the crown jewel, with a **Wilson score 95% confidence interval**.

---

## 6. The verdict engine (`evaluate_change`)

Inputs: twin, proposed control ids, adversary agent ids, seed, n walks.
Outputs a `ChangeVerdict`:

- `recommendation`: **DEPLOY / REVIEW / BLOCK**
- `delta`: `naive_path_reduction_pct`, `effort_increase_pct`, `p_success_delta`, `route_eliminated[]`, **`substituted_paths[]`** (the attacker's *new* route after the control — the single most compelling output; rendered animated on the graph)
- `broken_flows[]`: every ServiceFlow the control severs, with criticality. **Any flow with criticality ≥ 4 → BLOCK.**
- `confidence`: level (High/Medium/Low), score, unknowns, Wilson CI
- `reasons[]`: explainable rationale ("Flow 'Web Portal API Integration' broken: this interactive MFA policy is incompatible with these non-interactive service identities")
- `alternatives[]`: actionable remediation ("Deploy certificate-based authentication, managed service identities, or conditional access service exclusions instead of interactive MFA on service paths.")
- `cost`

Evidence weighting for confidence: Observed 1.0 / Inventory 0.9 / Inferred 0.5 / Assumed 0.0.

**Portfolio optimiser is constrained**: maximise risk reduction subject to budget AND never breaking a ServiceFlow with criticality ≥ 4. The UI contrasts a naive "unconstrained" portfolio (breaks flows) with the constrained safe one.

---

## 7. The MITRE ATT&CK grounding

Techniques live in **YAML, not code** (`backend/rules/techniques.yaml`) — editable live on stage. 10-technique catalogue, every one tagged with a real ATT&CK ID:

| id | ATT&CK | Meaning |
|---|---|---|
| phish | T1566 | Phishing → foothold + user creds |
| exploit_public_app | T1190 | Exploit public-facing app |
| cred_dump | T1003 | OS credential dumping |
| priv_esc_local | T1068 | Local privilege escalation |
| creds_in_files | T1552.001 | Credentials in files |
| rdp_lateral | T1021.001 | RDP lateral movement |
| ssh_lateral | T1021.004 | SSH lateral movement |
| smb_lateral | T1021.002 | SMB/admin shares |
| db_login | T1078 | Valid accounts (DB) |
| exfil_c2 | T1041 | Exfil over C2 channel |

Each technique has `requires` / `grants` capability lists, `base_success`, `cost`, `noise`, and `blocked_by` control types. This is the answer to "where did your model come from?"

---

## 8. Architecture & stack

```
scenario JSON  →  Pydantic v2 frozen models  →  NetworkX graph (authoring, blast radius)
                                              ↓ flatten to dicts
                Algorithm A: stateful DFS (once per twin, cached, path inventory)
                Algorithm B: seeded Monte Carlo agent walk (all statistics)
                                              ↓
                evaluate_change → ChangeVerdict        optimize → constrained portfolio
                                              ↓
                FastAPI (LRU cache keyed on twin_hash+agent+seed+n)
                                              ↓
                React 18 + TypeScript + Vite + Tailwind dashboard (hand-rolled SVG graph)
```

- **Backend:** Python 3.11, FastAPI, Pydantic v2, NetworkX, pytest. No database — JSON files + in-memory registry keyed by twin hash. Deterministic: seed is part of the cache key; rehearsed numbers equal stage numbers.
- **Frontend:** React 18, TypeScript, Vite 5, Tailwind 3.4, lucide-react. Light theme, brand orange `#FF5500`, fonts Plus Jakarta Sans + JetBrains Mono. Runs on localhost; falls back to embedded mock fixtures if the backend is down (demo never dies).
- **Tests:** **278 passing** (`pytest -q`, 3 s). Includes: hand-built 6-node fixture with a path reachable *only* after collecting a credential two hops earlier (written before the pathfinder existed); invariants (adding a control never increases attacker success; clone never mutates input; same seed → identical output); API integration; evaluation; optimizer; audit.
- **Design rule (from CLAUDE.md):** the two algorithms are never merged — never run the state-space search inside the Monte Carlo loop (correctness bug + performance blowup).

### API (mounted at `/` and `/api`)
```
GET  /health                      GET  /twin  · GET /twin/{id} · GET /twins
POST /twin/import                 GET  /twin/template
POST /twin/{id}/clone             POST /simulate
POST /evaluate-change  <- centrepiece
POST /optimize                    GET  /matrix/{twin_id}   (controls × agents)
GET  /blast-radius/{asset_id}     GET  /lineage/{twin_id}
POST /crawl-audit                 (hop-by-hop chess-piece auditor)
```

### Adversary agents
- `agent-external` — External Threat Actor, starts DMZ/public, skill 0.6
- `agent-insider` — Malicious Insider (Corp), starts corp/internal, skill 0.8
- `adv-admin` — Privileged Threat Actor, starts dmz/corp, skill 0.8

---

## 9. The FinBank golden scenario (what's on screen)

Fictional bank estate across **4 zones**: DMZ → Corporate LAN → Management Bastion → Production Data Zone.

**Assets (dashboard view, 15):** internet, web-dmz (Online Banking Web DMZ), api-gw, ws-dev, ws-hr, fileshare, ci-runner (CI/CD runner), ws-contractor, jump-01 (Privileged Admin Jump Host, Tier-0 gateway), iam-auth (AD/IAM DC), backup-01 (DR Backup Vault, **crown jewel**), siem-soc, payroll-api, swift-gw (SWIFT/ACH clearing), **prod-db (Core Production Database, crown jewel, criticality 5)**.

**Service flows (8):**
F1 Customer Web Banking Traffic (crit 3) · F2 Web Portal API Integration (crit 4) · **F3 Payroll Transaction Ledger Commits, payroll-api → prod-db (crit 5)** · F4 Developer CI/CD Build Pipelines (3) · F5 Corporate File Sync (3) · F6 DR Backup Synchronization, jump-01 → backup-01 (4) · F7 SWIFT Interbank Clearing Settlement, swift-gw → prod-db (4) · F8 SOC Telemetry Collection (3).

**Controls (catalogue):** ctrl-mfa Privileged Access MFA ($1,500, 95% efficacy) · ctrl-network-seg Core Banking Network Segmentation ($2,500, 90%) · ctrl-edr Host EDR ($2,000, 85%) · ctrl-credguard Windows Credential Guard ($1,000, 90%) · ctrl-scoped-seg (scoped bastion segmentation, used by the demo presets).

**Other bundled twins:** Healthcare Hospital (Epic EHR, PACS, infusion pumps), AWS Cloud SaaS e-commerce (API Gateway, Fargate, Cognito, Aurora), DoE critical grid. Plus custom JSON import with a downloadable template.

---

## 10. The 4-minute demo story (5 keyboard-driven presets, keys 1–5)

| # | Preset | What the judge sees | Verdict |
|---|---|---|---|
| 1 | **Baseline** | 4 viable attacker paths to crown jewels, risk 82%. Primary vector: ws-dev → ci-runner → jump-01 → prod-db (7.2 mean attacker effort). All flows healthy. | STANDBY |
| 2 | **Full Database Segmentation** | Every edge into prod-db locks down — great for security — but **severs F3 Payroll (crit 5) and F7 SWIFT (crit 4)**. "P1 OUTAGE" banner. This is the moment: a control that an attack-path tool would call a win, and we call a **BLOCK**. | **BLOCK** |
| 3 | **MFA for Humans** | Human routes via ws-dev/jump-01 blocked (−65% paths) — but the **attacker re-plans**: pivots down "Route D", the automated CI/CD machine path (web-dmz → ci-runner → backup-01 → prod-db). Animated on the graph. Zero broken flows, but the crown jewel still falls. | REVIEW |
| 4 | **Scoped Segmentation + MFA (Safe Option)** | Blocked cleanly before the bastion; Route D closed; zero broken flows. The recommended alternative — one click "Apply" from any other preset. | **DEPLOY** |
| 5 | **Sync Drift (Contractor Admin Grant)** | Continuous-sync demo: environment changes, a contractor workstation gets an unapproved admin role, risk spikes 12% → 68% via ws-contractor → jump-01 → prod-db. Drift detected, remediation suggested. | REVIEW: regression |

Every preset shows the same **Decision Card**: proposed change → verdict badge → three tiles (Security impact / Business impact / Confidence) → suggested alternative with residual route → **Apply**.

### Key numbers for the deck (from docs/DEMO_SCRIPT.md)
- Attacker success rate, no controls (external agent → prod-db): **~62%**
- Path reduction, network segmentation: **~67%**
- Attacker effort increase, network segmentation: **~210%**
- MFA alone: cuts naive paths ~58% but breaks flow F2 → REVIEW, not DEPLOY
- Optimizer at $5,000 budget: recommends seg + MFA, ~83% path reduction
- Crown jewels protected: prod-db, backup-01
- Tests passing: 278 · API endpoints: 13

---

## 11. Dashboard features (judge-facing "lean" UI, default at `/`; the full classic UI remains at `/?ui=classic`)

**Header:** Decision Story · Chess Auditor · Lineage · dataset switcher · backend status pill (Live / Mock) · Reset.

**Decision Story page**
1. Compact preset row (keys 1–5).
2. Decision card (see §10).
3. Three tabs:
   - **Graph** — 4-zone directed topology with SVG edge overlay (attack vectors, service flows in cyan, severed flows in red, Route D in purple, drift edges in orange), filter All / Attack vectors / Service flows, **Run breach simulation** (step-by-step "falling nodes" cascade with COMPROMISED / CONTAINED-BLOCKED / RE-PLAN PIVOT badges, cumulative cost & noise), per-node **Blast Radius** (in-graph highlight + modal with reachable assets, downstream criticality, Tier-0 targets exposed), compact service-flow registry (active / severed).
   - **Sandbox** — toggle any control combination live; verdict banner; the three metrics (naive path reduction, adaptive attacker cost increase, breach probability Δ); severed dependencies; decision rationale; recommended remediation; adversary pivot routes.
   - **Optimizer** — budget slider ($1k–$8k) + max disruption criticality (1–4) → constrained safe portfolio vs unconstrained, with broken-flow evidence.
4. **Chess Piece Auditor** — pick start/target/max hops, crawl candidate paths hop by hop on a "chessboard" of the topology, auto-walk, per-node exposure score, candidate moves with technique + crown-jewel distance, **chokepoint interception** (cheapest fix, cost, paths severed, CAB-safe?), node findings with MITRE IDs, and a **prioritized chokepoint remediation portfolio (cut-set)**.
5. **Twin Lineage** — SHA-256 hash chain: root golden state → cloned what-if twins, parent links, copyable hashes ("immutable provenance").
6. **Datasets modal** — switch between bundled enterprise twins or paste/upload custom JSON with real-time validation and one-click registration.

**Debug aid (kept for the team, hidden from judges):** clicking the status pill opens a drawer of recent API calls (method, path, status, latency, whether the client fell back to mock data).

---

## 12. Engineering discipline worth a slide

- Four parallel workstreams on GitHub branches with strict directory ownership (`docs/GOVERNANCE.md`).
- Frozen contracts: `backend/core/models.py` (all collections are tuples/frozensets — everything hashable, content-addressed caching) and `techniques.yaml`.
- Tests written **before** the pathfinder existed, because a wrong pathfinder fails silently with plausible output.
- Determinism mandatory: seeded RNG, seed in the cache key, scenario test asserts the exact demo numbers.
- Deliberately NOT built: real scanning/exploits, auto-discovery, CRUD forms, auth, LLM-driven adversary (rule-driven Monte Carlo is faster and reproducible).

---

## 13. Suggested deck outline

1. Title — Security Change Sandbox: a digital twin for the change board
2. The problem — two half-answers (attack-path tools vs policy analyzers), the CAB question
3. PS #13 requirements → feature map (table from §4)
4. Product thesis + the ServiceFlow primitive
5. How it works — twin model, two algorithms, MITRE-grounded YAML rules
6. Two metrics, labelled — why path count is misleading
7. The verdict engine — DEPLOY / REVIEW / BLOCK with reasons, alternatives, substituted routes, confidence
8. Live demo storyboard — presets 1→5 (screens: BLOCK on full seg, attacker re-plans on MFA, DEPLOY on scoped seg, drift)
9. Prioritisation & optimizer — chokepoints, constrained portfolio
10. Continuous sync & lineage — import, clone, hash chain, drift
11. Blast radius (bonus)
12. Architecture & stack; 278 tests; determinism
13. Prior art & honest positioning (approved claim)
14. What we'd do next — replay a publicly documented breach as a twin to show the engine rediscovers the real attacker's path; more adversary profiles; broader technique catalogue
15. Team & roles
