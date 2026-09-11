# Demo Script — FinBank Cyber Digital Twin v2.1

**Scenario**: Compromised Employee Laptop → VPN → Payroll API → Production DB

---

## Pre-flight

```bash
# Start the backend (from digital-twin/)
python -m uvicorn backend.api.main:app --reload --port 8000

# Verify it's alive
curl http://localhost:8000/
# Expected: {"status":"ok","golden_twin_id":"twin-finbank-golden",...}
```

---

## Act 1 — Show the Threat Landscape

### 1a. Load the FinBank Digital Twin
```bash
curl http://localhost:8000/twin/twin-finbank-golden | python -m json.tool
```
**Tell the judges**: 10 assets across DMZ / Corp / Mgmt / Prod zones. 16 attack edges. 4 security controls already deployed. 1 crown jewel: `prod-db` (Core Production Database, criticality 5).

### 1b. Blast Radius of the Payroll API
```bash
curl "http://localhost:8000/blast-radius/payroll-api?twin_id=twin-finbank-golden"
```
**Expected output**:
```json
{
  "asset_id": "payroll-api",
  "reachable": ["prod-db"],
  "crown_jewels_reachable": ["prod-db"]
}
```
**Tell the judges**: If an attacker reaches the Payroll API, they have a direct path to the crown jewel (Production DB). One hop to catastrophe.

### 1c. Run the Attacker Simulation
```bash
curl -X POST http://localhost:8000/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "twin_id": "twin-finbank-golden",
    "agent_id": "agent-external",
    "n": 100,
    "seed": 42,
    "target": "prod-db"
  }'
```
**Tell the judges**: The external threat actor succeeds in reaching prod-db in ~62% of trials. Show the candidate routes — 4 distinct attack paths discovered by the stateful DFS.

---

## Act 2 — Propose a Control (Evaluate Change)

### 2a. Propose MFA on jump-01 + payroll-api
```bash
curl -X POST http://localhost:8000/evaluate-change \
  -H "Content-Type: application/json" \
  -d '{
    "twin_id": "twin-finbank-golden",
    "control_ids": ["ctrl-mfa"],
    "agent_ids": ["agent-external"],
    "seed": 42
  }'
```
**Expected verdict**: `REVIEW`

**Tell the judges**:
- MFA cuts naive attack paths by ~58%
- BUT: it breaks Flow F2 (Web Portal API Integration) because this interactive MFA policy is incompatible with these non-interactive service identities
- Verdict is `REVIEW` — not `DEPLOY` — because of the broken service flow on the Payroll Settlement Service Account
- The system recommends scoping MFA to jump-01 only first

### 2b. Propose Network Segmentation instead
```bash
curl -X POST http://localhost:8000/evaluate-change \
  -H "Content-Type: application/json" \
  -d '{
    "twin_id": "twin-finbank-golden",
    "control_ids": ["ctrl-network-seg"],
    "agent_ids": ["agent-external"]
  }'
```
**Tell the judges**: Network segmentation gets a `DEPLOY` verdict — no broken flows, 67% path reduction.

---

## Act 3 — Clone + Compare (Before vs After)

### 3a. Clone with the recommended control
```bash
curl -X POST http://localhost:8000/twin/twin-finbank-golden/clone \
  -H "Content-Type: application/json" \
  -d '{"control_ids_to_add": ["ctrl-network-seg"], "new_id": "twin-hardened"}'
```

### 3b. Re-simulate on the hardened twin
```bash
curl -X POST http://localhost:8000/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "twin_id": "twin-hardened",
    "agent_id": "agent-external",
    "n": 100,
    "seed": 42,
    "target": "prod-db"
  }'
```
**Tell the judges**: Compare `p_success` before and after. Show the effort_increase_pct — the modelled attacker cost went up by 210%, meaning the attacker has to work much harder for a lower probability payoff.

### 3c. View lineage
```bash
curl http://localhost:8000/lineage/twin-hardened
```
**Tell the judges**: Full audit trail. The hardened twin traces back to the golden baseline. Every change is versioned.

---

## Act 4 — Optimise Under Budget (Bonus)
```bash
curl -X POST http://localhost:8000/optimize \
  -H "Content-Type: application/json" \
  -d '{"twin_id": "twin-finbank-golden", "budget": 5000, "agent_ids": ["agent-external"]}'
```
**Tell the judges**: Given a £5,000 budget, the optimizer recommends `ctrl-network-seg` + `ctrl-mfa` for 83% path reduction. This is the centrepiece decision-intelligence feature.

---

## Key Numbers for Judges

| Metric | Value |
|--------|-------|
| Attack paths discovered (golden) | Multiple (search runs once) |
| Attacker success rate — no controls | ~62% (agent-external, prod-db) |
| Path reduction — network-seg | ~67% |
| Effort increase — network-seg | ~210% |
| Crown jewels protected | prod-db, backup-01 |
| Tests passing | 157 (131 Phase 0-4 + 26 API) |
| API endpoints | 8 |

---

## Fallback if Live Server Fails

All tests run in-process. Run:
```bash
pytest tests/test_api.py -v
```
All 26 tests pass, demonstrating full end-to-end API behaviour without needing a live server.
