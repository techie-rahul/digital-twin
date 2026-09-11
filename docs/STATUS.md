# Status — FinBank Cyber Digital Twin API

**Branch**: `feat/api-integration`  
**Owner**: Person 4 (API / Integration / Demo Lead)  
**Tests**: 157 passing (0 failures)

---

## Phase Delivery Status

| Phase | Owner | Status | Notes |
|-------|-------|--------|-------|
| Phase 0 — Models | Core | ✅ Done | `backend/core/models.py` — all 7 frozen Pydantic models |
| Phase 1 — Twin | Core | ✅ Done | `CyberDigitalTwin`, graph, blast_radius, hash, clone |
| Phase 2 — Rule loader/compiler | Rules | ✅ Done | `compile_twin`, `CompiledEdge`, `CompiledTwin` |
| Phase 3 — Stateful search | Core | ✅ Done | Algorithm A: stateful DFS, `Inventory`, `AttackPath` |
| Phase 4 — Agent walk | Core | ✅ Done | Algorithm B: plan-then-execute, `simulate`, `Result` |
| Phase 5 — Results & Metrics | Person 1 | 🔄 In Progress | `backend/core/results.py` (not yet delivered) |
| Phase 6 — Control Evaluation | Person 2 | 🔄 In Progress | `backend/rules/evaluate.py` (not yet delivered) |
| Phase 7 — Optimiser | Person 4 + 2 | ⏳ Pending | After Phase 6 |
| **Phase 8 — API** | **Person 4** | **✅ Done** | All 8 endpoints live |
| Phase 9 — Dashboard | Person 3 | 🔄 In Progress | Vite + React (frontend/) |

---

## What's Live (Real, Not Stubbed)

| Endpoint | Real | Notes |
|----------|------|-------|
| `GET /` | ✅ | Health check |
| `GET /twin/{id}` | ✅ | Full twin serialization |
| `POST /twin/{id}/clone` | ✅ | Control mutations + registry |
| `POST /simulate` | ✅ | Real engine (search + walk) |
| `GET /blast-radius/{asset_id}` | ✅ | `nx.descendants` on twin graph |
| `GET /lineage/{twin_id}` | ✅ | parent_id chain traversal |
| `POST /evaluate-change` | 🟡 Stubbed | Awaiting Person 2 `evaluate.py` |
| `POST /optimize` | 🟡 Stubbed | Awaiting Phase 7 |
| `GET /matrix/{twin_id}` | 🟡 Stubbed | Awaiting Phase 7 |

---

## Stub Integration Plan

When Person 2 delivers `backend/rules/evaluate.py`:

1. In [`routes.py`](../backend/api/routes.py), find `evaluate_change()` handler
2. Replace:
   ```python
   return stub_evaluate_change(...)
   ```
   With:
   ```python
   from backend.rules.evaluate import evaluate_change as _evaluate
   return _evaluate(dt.twin, body.control_ids, body.agent_ids, seed=body.seed)
   ```
3. Run `pytest tests/test_api.py` — the `_stub: true` assertion in `test_evaluate_change_stub_returns_schema` will need updating

The **external API contract does not change** when the stub is replaced.

---

## Files Owned by Person 4

```
backend/api/
  __init__.py      — package init
  cache.py         — LRU result cache (twin_hash, agent_id, seed, n)
  main.py          — FastAPI app factory + lifespan + agent registry
  routes.py        — all 8 route handlers
  schemas.py       — Pydantic request/response schemas
  stubs.py         — evaluate-change / optimize / matrix stubs

docs/
  INTERFACES.md    — full API contract (all 8 endpoints)
  DEMO_SCRIPT.md   — hackathon demo script (4 acts, exact curl commands)
  STATUS.md        — this file

tests/
  test_api.py      — 26 integration tests
```

---

## How to Run

```bash
# Start server
python -m uvicorn backend.api.main:app --reload --port 8000

# Run API tests only
pytest tests/test_api.py -v

# Run all tests
pytest -v

# Swagger UI
open http://localhost:8000/docs
```

---

## Known Limitations

1. **In-memory registry only** — cloned twins are lost on server restart. Acceptable for hackathon demo.
2. **Stubs on 3 endpoints** — `evaluate-change`, `optimize`, `matrix` return realistic but fabricated data until Person 2 delivers.
3. `httpx` deprecation warning — harmless, caused by FastAPI test client. Upgrade to `httpx2` when stable.
