# FinBank Digital Twin: Security Change Sandbox
## The Pitch Deck Built to Win MUJ HackX 4.0
**Track:** CyberSecurity & Defence Systems  
**Problem Statement:** PS #13 — Security Digital Twin for Threat Vector Assessment  
**Format:** 14 Slides | 4-Minute Stage Presentation + 2-Minute Demo Q&A  

---

### Executive Cheat Sheet (For Speakers on Stage)
- **The Core Thesis:** Attack-path tools tell you what a control stops. Cloud policy analyzers tell you what a control breaks. **Nobody joins security benefit and business breakage on the same model for a single proposed change.** That is the decision a Change Advisory Board (CAB) actually makes.
- **Approved Positioning Claim (Say verbatim):**  
  > *"Adaptive attacker modelling exists in research — MAL Simulator, the CAGE challenges. Control impact simulation exists in cloud platforms — Azure's rule impact analyzer. To our knowledge no product joins security benefit and business breakage on one model for a single proposed change, which is the decision a change board actually makes."*
- **The Golden Trap We Expose:** Naive path reduction vs. honest adaptive attacker cost increase. (Path reduction assumes a passive attacker; real attackers re-plan).

---

## Slide 1: Title & Hook
### Headline: What If You Could Break the Attacker Without Breaking the Bank?
**Subhead:** FinBank Digital Twin: A Pre-Deployment Security Change Sandbox for the Change Advisory Board.

#### Slide Visuals
- **Hero Mockup:** FinBank Digital Twin Decision Card showing Verdict: `BLOCK` vs `DEPLOY`.
- **Top Badge:** MUJ HackX 4.0 | PS #13: Security Digital Twin for Threat Vector Assessment.
- **Team Credits:** Team of 4 | CyberSecurity & Defence Systems Track.

#### Speaker Script (0:00 - 0:25)
> *"Every Tuesday morning, Change Advisory Boards in banks and critical infrastructure sit in a room and make multi-million dollar decisions on pure gut feel. The CISO wants to deploy zero-trust network segmentation to block lateral movement. But the Head of Infrastructure votes NO, because nobody can prove it won't take down payroll, ACH clearing, or partner APIs.  
> Today, security teams have tools that show attacker paths, and cloud consoles that simulate packet drops. But **nobody joins security benefit and business breakage on one unified model before deployment**.  
> We built the **Security Change Sandbox** — a deterministic cyber digital twin that tells you both what a control stops the attacker doing AND what it breaks in the business, before you ever push to production."*

---

## Slide 2: The Two Half-Answers
### Headline: The Security Decision Dilemma: Two Halves of the Truth

#### Slide Visuals (Comparison Matrix)
| Capability Dimension | Attack-Path Tools *(BloodHound, Wiz, Picus)* | Cloud Policy Analyzers *(Azure VNM, AWS IAM)* | **FinBank Security Change Sandbox** |
|---|---|---|---|
| **What it tells you** | "Removes 14 attack paths." | "Blocks TCP port 5432." | **Both: Attacker effort Δ AND severed business flows** |
| **Business Flow Awareness** | ❌ Blind to payroll, DB sync, SWIFT | ❌ No business context (only raw CIDR/port) | **✅ Native ServiceFlow registry with criticality weighting (1-5)** |
| **Attacker Behavior** | ❌ Assumes passive attacker (fixed paths) | ❌ No threat actor concept | **✅ Emergent re-planning via sampled Monte Carlo walks** |
| **Decision Output** | Abstract graph metrics | Raw allow/deny telemetry | **Clear CAB Action: DEPLOY / REVIEW / BLOCK + Safe Alternative** |

#### Speaker Script (0:25 - 0:55)
> *"Why does this problem exist? Because the market offers two half-answers.  
> On the left, attack-path management tools like BloodHound or Wiz tell you: 'Deploy this rule, you eliminate 60% of attack paths.' But they have zero awareness of whether that rule severs your database replication or payroll integration.  
> On the right, cloud policy analyzers tell you what network packets get blocked, but have zero concept of MITRE ATT&CK techniques or crown-jewel risk.  
> The CAB doesn't need another graph of 10,000 vulnerabilities. They need one answer: **Can I deploy this safely, within budget, and how confident are we?**"*

---

## Slide 3: Our Core Architectural Primitive: The `ServiceFlow`
### Headline: Joining Threat Vectors and Business Operations in One Graph

#### Slide Visuals
- Diagram showing two layers evaluated concurrently on the exact same topology:
  1. **Attacker Path Layer (Red/Amber):** `ws-dev` → `ci-runner` → `jump-01` → `prod-db` (T1021.001 Lateral Movement)
  2. **Service Flow Layer (Cyan/Green):** `payroll-api` → `prod-db` (Flow F3: Payroll Transaction Ledger, Crit 5)
- **The Rule:** Any proposed control that severs a flow with Criticality $\ge 4$ triggers an immediate, un-overridable **BLOCK**.

#### Speaker Script (0:55 - 1:20)
> *"The secret to solving this is our core modeling primitive: the **`ServiceFlow`**.  
> In our digital twin, an asset doesn't just hold vulnerabilities; it participates in legitimate, mission-critical operational flows. Every service flow has a declared dependency, protocol, identity context, and business criticality from 1 to 5.  
> When you propose a control—say, database isolation—our engine doesn't just calculate how many attack paths are cut. It simultaneously runs the control against the ServiceFlow registry. If a control breaks Flow F3—our payroll ledger with Criticality 5—the verdict is an instant, unambiguous **BLOCK**, regardless of how good the security score looks."*

---

## Slide 4: Dual-Engine Architecture & MITRE ATT&CK Grounding
### Headline: Two Decoupled Algorithms: Search Once, Walk Adaptive

#### Slide Visuals
- Architecture Pipeline:
  - `JSON Scenario` → `Pydantic v2 Frozen Twin` → `NetworkX DiGraph`
  - **Algorithm A:** Stateful DFS over `(node, frozenset(capabilities))` — creates complete path inventory ($O(V+E)$ with caps).
  - **Algorithm B:** Seeded Monte Carlo Agent Walks — emergent local decision-making and re-planning.
  - **Rules Grounding:** `techniques.yaml` mapping real ATT&CK IDs (T1566, T1190, T1003, T1068, T1552, T1021, T1078, T1041). Editable live on stage!

#### Speaker Script (1:20 - 1:50)
> *"Under the hood, we never guess. Our architecture strictly separates two algorithms:  
> **Algorithm A** is a stateful depth-first search that discovers the full path inventory. An edge is only traversable if the agent collected the necessary cryptographic keys or privilege tokens on prior hops.  
> **Algorithm B** is our agent walk simulator. The threat actor is not omniscient; they operate with local vision. When a control blocks their preferred corridor, the agent dynamically enumerates alternative admissible hops and re-plans around the barrier.  
> And every technique in our engine is grounded in real MITRE ATT&CK techniques defined in decoupled YAML, not hardcoded logic. You can tweak success probabilities or noise live on stage."*

---

## Slide 5: The Deceptive Metric vs. The Honest Metric
### Headline: Why "Paths Eliminated" Lies — And What We Measure Instead

#### Slide Visuals (Side-by-Side Metric Card)
- **Industry Metric (Naive):** `naive_path_reduction_pct` = **65% Paths Eliminated**  
  *Assumption: Attacker gives up when the primary path is blocked.*
- **Honest Adaptive Metric (Ours):** `honest_cost_increase_pct` = **Attacker Cost +340%, Residual Breach Risk 12%**  
  *Reality: Threat actor re-plans via automated CI/CD machine identity.*
- **Confidence Calibration:** Wilson Score 95% Confidence Interval based on evidence weighting (Observed 1.0, Inventory 0.9, Inferred 0.5, Assumed 0.0).

#### Speaker Script (1:50 - 2:20)
> *"Problem Statement #13 asks us to prioritize controls by the number of attack paths eliminated. **We do that. But on stage, we will prove why that industry-standard metric is dangerously misleading.**  
> If you put MFA on your admin jump host, naive tools tell you: '65% of attack paths eliminated, mission accomplished!'  
> But a real attacker doesn't give up. They adapt. In our engine, when the human bastion is locked with MFA, the adversary pivots to **Route D**—an unmonitored CI/CD pipeline token that still reaches the database!  
> That's why we ship BOTH metrics: the brief's path reduction percentage, and our honest adaptive cost increase with a 95% Wilson confidence score. We show the CAB what actually happens when an adversary re-plans."*

---

## Slide 6: The 5-Act Live Demo Storyboard
### Headline: 4 Minutes, 5 Presets, One Seamless Change Board Story

#### Slide Visuals (Demo Roadmap Table)
| Preset | Action | Security Impact | Business Impact | CAB Verdict |
|---|---|---|---|---|
| **1. Baseline** | Current bank estate | 4 critical paths active | All flows healthy | `STANDBY` |
| **2. Full DB Segmentation** | Block all DB ingress | 100% attack paths cut | **Severs F3 Payroll & F7 SWIFT** | `BLOCK (P1 Outage)` |
| **3. MFA for Humans** | MFA on jump hosts | -65% human paths | Zero broken flows | `REVIEW (Route D Pivot)`|
| **4. Scoped Seg + MFA** | Scoped micro-seg | -75% paths, +340% effort | Zero broken flows | `DEPLOY (Safe Option)` |
| **5. Continuous Sync Drift**| Contractor gets Admin | Risk spikes 12% → 68% | Privilege boundary drift | `REVIEW: Regression` |

#### Speaker Script (2:20 - 2:45)
> *"Let's switch to the live system. We built a keyboard-driven judge experience with five presets that tell a complete decision story in under four minutes.  
> Preset 1 is our baseline: 4 viable paths to our crown jewels.  
> Preset 2 simulates heavy-handed segmentation: zero attack paths remain, but it severs our critical payroll flow. The system throws a P1 OUTAGE alert and issues a BLOCK verdict.  
> Preset 3 tests MFA: human routes vanish, but the attacker pivots via Route D. Verdict: REVIEW.  
> Preset 4 is the sweet spot: Scoped Segmentation with MFA. Threat contained, zero flow disruption, verdict: DEPLOY.  
> And Preset 5 demonstrates continuous synchronisation: an unapproved contractor admin grant drifts into production, and our twin flags an instant risk regression."*

---

## Slide 7: Live Screen 1 — The P1 Outage (Preset 2: BLOCK)
### Headline: When Security Breaks the Business: The Moment of Truth

#### Slide Visuals
- Embedded screenshot of Preset 2 showing:
  - Red `BLOCK` Badge
  - Security Impact: `-80% paths (No viable direct route)`
  - Business Impact: `BLOCKS Payroll API -> Core Database [P1 Operational Outage]`
  - Highlighted red dashed line severing Flow F3 on the 4-zone graph.
  - Recommended Safe Alternative displayed right on the card with one-click `[Apply]`.

#### Speaker Script (2:45 - 3:10)
> *"Notice what happened the moment we toggled Full Database Segmentation. An attack-path tool would celebrate this change: all attacker routes to the database are dead.  
> But look at our business impact tile: **BLOCKS Payroll API -> Core Database**. Flow F3 is severed. That's a Severity-1 outage on day one.  
> Our verdict engine immediately flags **BLOCK**, explains exactly which non-interactive service accounts were disrupted, and generates an automated safe alternative with one-click deployment."*

---

## Slide 8: Live Screen 2 — The Attacker Re-Plans (Preset 3: REVIEW)
### Headline: Emergent Adversary Adaptation: The CI/CD "Route D" Bypass

#### Slide Visuals
- Embedded screenshot of Preset 3 showing:
  - Amber `REVIEW` Badge
  - Security Impact: `-65% paths. Human-led routes neutralized; Route D automated pivot remains viable (1 / 4 paths)`
  - Graph animation highlighting the purple bypass trajectory: `web-dmz` → `ci-runner` → `backup-01` → `prod-db`
  - Breach simulation cascade showing `COMPROMISED` and `RE-PLAN PIVOT` states.

#### Speaker Script (3:10 - 3:35)
> *"Next, the CISO says: 'Let's just mandate MFA on all human jump hosts.'  
> Look at the screen. The business is safe—zero broken flows. But the verdict is **REVIEW**, not Deploy. Why?  
> Because the digital twin shows the attacker's re-planning trajectory in real-time. Blocked at the jump host, the adversary discovers that the automated CI/CD runner holds cached deployment credentials. They pivot through backup storage directly into the database.  
> We don't just tell the CAB 'risk remains'—we show the exact residual route on the graph."*

---

## Slide 9: Prioritization & The Chess Piece Security Auditor
### Headline: Beyond Vulnerability Lists: Hop-by-Hop Chokepoint Cut-Sets

#### Slide Visuals
- Chess Piece Auditor UI showing:
  - Interactive "Topology Chessboard" with current adversary position (`internet`).
  - Move evaluations with MITRE ATT&CK technique tags and hops from Crown Jewel.
  - Prioritized Chokepoint Remediation Portfolio (Cut-Set Table):
    - `$1,500` on `jump-01` (cuts 2 paths, breaks F2)
    - `$2,500` on `prod-db` (cuts 2 paths, safe alternative)
  - Weakest Link Asset identification: `prod-db`.

#### Speaker Script (3:35 - 4:00)
> *"PS #13 asks how we prioritize remediation. Traditional scanners give you 500 CVEs sorted by CVSS. That's useless to an engineering lead.  
> We built the **Chess Piece Security Auditor**. It treats the enterprise topology like a grandmaster chessboard. At each hop, it calculates the adversary's legal moves, their distance to the crown jewels, and the minimum cut-set of chokepoints required to intercept them.  
> It ranks remediation by **threat path elimination per dollar spent**, while cross-checking CAB continuity so you never invest in a chokepoint that breaks your business."*

---

## Slide 10: Constrained Portfolio Optimizer
### Headline: Knapsack Optimization Subject to Business Continuity

#### Slide Visuals
- Optimizer Interface:
  - Budget Ceiling slider (`$1,000` to `$8,000`)
  - Max Disruption Criticality slider (`Crit ≤ 3`)
  - Side-by-Side comparison:
    - **Naive Unconstrained Portfolio:** Selects high-potency controls that break payroll.
    - **Constrained Safe Portfolio:** Delivers optimal path elimination without ever severing a Criticality $\ge 4$ flow.

#### Speaker Script (4:00 - 4:20)
> *"What if you have a fixed security budget of $5,000?  
> Our built-in **Portfolio Optimizer** runs a constrained knapsack optimization. Instead of naively picking controls that cut the most paths regardless of damage, it enforces a hard boundary: zero disruption to business flows above your chosen criticality ceiling.  
> At $5,000, it selects Scoped Segmentation and EDR—achieving 83% path reduction with 100% operational uptime."*

---

## Slide 11: Continuous Sync & Cryptographic Twin Lineage
### Headline: Living Digital Twins: Immutable Provenance via SHA-256

#### Slide Visuals
- Lineage Explorer UI showing:
  - Root Golden State (`twin-finbank-golden`) with `#sha256:182090a5...`
  - Cloned what-if branches with parent-child cryptographic links.
  - Multi-dataset switcher: FinBank, AWS Cloud SaaS, Healthcare Hospital, and DoE Critical Grid.
  - Live JSON import engine with schema validation.

#### Speaker Script (4:20 - 4:40)
> *"In production, infrastructure drifts. A digital twin is useless if it's a stale screenshot from last quarter.  
> In FinBank Digital Twin, every twin mutation is content-addressed with SHA-256 hashes. When a change board approves a change, the what-if twin is cryptographically committed with immutable lineage.  
> And with our JSON import engine, evaluators can upload any infrastructure topology—we bundle banking, healthcare with Epic EHRs, AWS cloud microservices, and power grids out of the box."*

---

## Slide 12: Engineering Rigor & Production Discipline
### Headline: Built Like Mission-Critical Software (Not a Hackathon Prototype)

#### Slide Visuals
- 4 Key Engineering Pillars:
  1. **278 Automated Tests Passing (2.8s runtime):** Invariants tested, including tests written *before* the pathfinder existed to prevent silent algorithmic drift.
  2. **Frozen Pydantic v2 Contracts:** Immutable data models (`frozenset`, tuples); 100% hashable for LRU content-addressed caching.
  3. **Strict Determinism:** Seeded RNG ensures identical stage rehearsal numbers match live evaluation.
  4. **Zero AI Hallucination:** Deterministic graph algorithms; rule-based Monte Carlo walks. No LLMs in the critical security loop.

#### Speaker Script (4:40 - 5:00)
> *"We treated this hackathon like production systems engineering.  
> We have **278 unit and integration tests passing in under 3 seconds**. We wrote verification fixtures before the pathfinder existed, because graph pathfinders fail silently with plausible-looking bugs.  
> All twin models are frozen Pydantic v2 records with content-hashed caching.  
> There are no LLM hallucinations in our decision engine. The numbers you see on screen are mathematically reproducible, deterministic, and verifiable down to the exact random seed."*

---

## Slide 13: Honest Competitive Positioning
### Headline: Clear Boundaries, Defensible Novelty

#### Slide Visuals (The Positioning Quadrant)
- **Academic Research (MAL, CAGE, CyberBattleSim):** Complex adaptive attacker simulations, but completely divorced from enterprise IT operations.
- **Enterprise SecOps (BloodHound, Wiz, Picus):** Great visibility into attack paths, zero understanding of service flows.
- **Cloud Infrastructure (Azure VNM, AWS IAM Sim):** Network rule simulation, no threat intelligence or ATT&CK mapping.
- **FinBank Digital Twin (Our Niche):** The only bridge connecting adversarial attack paths with enterprise business continuity for pre-deployment decision support.

#### Speaker Script (5:00 - 5:20)
> *"Let's be completely transparent about what is and isn't new.  
> We did not invent attack graphs, blast radius, or chokepoints. Research simulators like MAL and CAGE already model adaptive attackers. Cloud providers like Azure already simulate network ACLs.  
> **Our defensible novelty is unifying them.** We are the first tool designed specifically for the Change Advisory Board that joins security efficacy and operational breakage on the exact same digital twin model."*

---

## Slide 14: Conclusion & Roadmap
### Headline: Deploy with Confidence. Block with Proof.

#### Slide Visuals
- **Key Takeaways:**
  - PS #13 fully delivered + Blast Radius bonus + Cryptographic Lineage.
  - 5-minute decision turnaround for Change Advisory Boards.
  - Multi-sector support: Banking, Healthcare, Cloud SaaS, Energy.
- **Future Roadmap:** Replaying public breach post-mortems (e.g., SolarWinds, Capital One) inside the twin to demonstrate automated chokepoint discovery; bidirectional Terraform/OpenTofu rule generation.

#### Speaker Script (5:20 - 5:45)
> *"In summary, the Security Change Sandbox transforms security deployment from an argument between the CISO and the infrastructure team into an objective, data-driven decision.  
> You can deploy with confidence, block with mathematical proof, and protect crown jewels without breaking payroll.  
> Thank you, and we welcome your questions."*

---

## 🎯 Stage Q&A & Judge Objection Playbook

### Objection 1: "Where do you get the ServiceFlow data in real life?"
**Speaker Answer:**  
> *"In real enterprises, service flows already exist in three places: CMDBs like ServiceNow, network application dependency mappings (like AWS Application Discovery or Dynatrace/Datadog service maps), and Kubernetes ingress/service manifests. Our JSON schema is intentionally lightweight so an enterprise can ingest existing network telemetry with a simple transformation script."*

### Objection 2: "Why not use an LLM or Reinforcement Learning for the adversary?"
**Speaker Answer:**  
> *"Change boards require auditability and determinism. If an LLM gives a different verdict at 9 AM than at 10 AM for the same firewall change, the CAB cannot legally rely on it. Our seeded Monte Carlo engine is mathematically reproducible, finishes in milliseconds, and provides rigorous confidence intervals without hallucination risk."*

### Objection 3: "Isn't checking every path computationally expensive on large graphs?"
**Speaker Answer:**  
> *"That's why our design rule strictly decouples Algorithm A and Algorithm B. Algorithm A runs stateful DFS once with depth and state bounds (capped at depth 8, 5000 states), caching the path inventory. Algorithm B samples probabilistic walks over admissible edges. Even on our largest hospital and power grid twins, simulation completes in under 40 milliseconds."*

### Objection 4: "Why call 65% path reduction 'misleading'?"
**Speaker Answer:**  
> *"Because path count treats every path as equally likely and assumes an attacker who hits a closed door gives up. In reality, an attacker facing a blocked jump host pivots to an unsegmented build server. Measuring naive path reduction without measuring adaptive adversary effort gives organizations false confidence."*
