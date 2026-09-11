# Status — FinBank Cyber Digital Twin API

**Branch**: `feat/api-integration`  
**Owner**: Person 4 (API / Integration / Demo Lead)  
**Tests**: 198 passing (0 failures)

---

## Phase Delivery Status

| Phase | Owner | Status | Notes |
|-------|-------|--------|-------|
| Phase 0 — Models | Core | ✅ Done | `backend/core/models.py` — all 7 frozen Pydantic models |
| Phase 1 — Twin | Core | ✅ Done | `CyberDigitalTwin`, graph, blast_radius, hash, clone |
| Phase 2 — Rule loader/compiler | Rules | ✅ Done | `compile_twin`, `CompiledEdge`, `CompiledTwin` |
| Phase 3 — Stateful search | Core | ✅ Done | Algorithm A: stateful DFS, `Inventory`, `AttackPath` |
| Phase 4 — Agent walk | Core | ✅ Done | Algorithm B: plan-then-execute, `simulate`, `Result` |
| Phase 5 — Results & Metrics | Person 1 | ✅ Merged & Wired | `backend/core/results.py` merged from main; `/simulate` enriched with `compute_results` |
| Phase 6 — Control Evaluation | Person 2 | ✅ Merged & Wired | `backend/rules/evaluate.py` merged from main; `/evaluate-change` LIVE |
| Phase 7 — Optimiser | Person 4 + 2 | ⏳ Pending / Stubbed | `/optimize` and `/matrix` currently stubbed with schema-correct mocks |
| **Phase 8 — API** | **Person 4** | **✅ Done** | All 8 endpoints live & functional |
| Phase 9 — Dashboard | Person 3 | 🔄 In Progress | Vite + React frontend |

---

## What's Live (Real, Not Stubbed)

| Endpoint | Real | Notes |
|----------|------|-------|
| `GET /` | ✅ Real | Health check + loaded golden twin status |
| `GET /twin/{id}` | ✅ Real | Full twin serialization |
| `POST /twin/{id}/clone` | ✅ Real | Control mutations + registry |
| `POST /simulate` | ✅ Real | Real engine (search + walk) + Phase 5 `compute_results` statistical enrichment |
| `POST /evaluate-change` | ✅ Real | **LIVE** — Calls Person 2's `backend.rules.evaluate.evaluate_change()`, returning full `ChangeVerdict` |
| `GET /blast-radius/{asset_id}` | ✅ Real | `nx.descendants` on twin graph with crown jewel detection |
| `GET /lineage/{twin_id}` | ✅ Real | parent_id chain traversal |
| `POST /optimize` | 🟡 Stubbed | Schema-correct stub awaiting Phase 7 optimizer engine |
| `GET /matrix/{twin_id}` | 🟡 Stubbed | Schema-correct stub awaiting Phase 7 matrix engine |

---

## Files Owned by Person 4

```
backend/api/
  __init__.py      — package init
  cache.py         — LRU result cache (twin_hash, agent_id, seed, n)
  main.py          — FastAPI app factory + lifespan + agent registry
  routes.py        — all 8 route handlers (including wired evaluate_change + compute_results)
  schemas.py       — Pydantic request/response schemas
  stubs.py         — optimize / matrix stubs

docs/
  INTERFACES.md    — full API contract (all 8 endpoints)
  DEMO_SCRIPT.md   — hackathon demo script (4 acts, exact curl commands)
  STATUS.md        — this file

tests/
  test_api.py      — 26 integration tests (all passing)
```

---

## How to Run

```bash
# Start server
python -m uvicorn backend.api.main:app --reload --port 8000

# Run API tests only
pytest tests/test_api.py -v

# Run all tests (198 tests across Phases 0-6 + API)
pytest -v

# Swagger UI
open http://localhost:8000/docs
```

---

## Current Platform State

1. **Phase 5 (Results & Metrics)**: Merged into branch, fully tested (`tests/test_results.py` passing).
2. **Phase 6 (Control Evaluation & Verdicts)**: Merged into branch, fully tested (`tests/test_evaluate.py` passing). Wired directly into `POST /evaluate-change`.
3. **Phase 8 (API & Integration)**: All endpoints functioning, LRU cache operational, 198 tests passing across the entire project.
