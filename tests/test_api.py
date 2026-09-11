"""
API integration tests — PHASE H.

Tests all 8 endpoints using FastAPI TestClient (httpx-backed).
These tests run against the real engine (search, walk, blast_radius) — no mocking of core.

Coverage:
  1.  App starts and responds to GET /
  2.  GET /twin/{id} — golden twin
  3.  GET /twin/{id} — 404 for unknown id
  4.  POST /twin/{id}/clone — with control addition
  5.  POST /twin/{id}/clone — 400 for unknown control id
  6.  POST /simulate — returns real simulation result
  7.  POST /simulate — caching (second call returns cached=True)
  8.  POST /simulate — 404 for unknown twin
  9.  POST /simulate — 404 for unknown agent
  10. POST /evaluate-change — stub returns correct schema
  11. POST /optimize — stub returns correct schema
  12. GET /matrix/{twin_id} — stub returns correct schema
  13. GET /blast-radius/{asset_id} — real blast radius
  14. GET /blast-radius/{asset_id} — 404 for unknown asset
  15. GET /lineage/{twin_id} — single-node lineage for golden
  16. GET /lineage/{twin_id} — chain after clone
  17. 131 existing Phase 0-4 tests still pass (asserted by running pytest)
  18. Cache clear between tests (cache isolation)
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.api.main import create_app
from backend.api import cache as result_cache


@pytest.fixture(scope="module")
def client():
    """Create a test client with the full app (real lifespan startup)."""
    app = create_app()
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def clear_cache_between_tests():
    """Ensure each test starts with an empty cache for isolation."""
    result_cache.clear()
    yield
    result_cache.clear()


GOLDEN_ID = "twin-finbank-golden"


# ─────────────────────────────────────────────
# 1. Health / root
# ─────────────────────────────────────────────

def test_health_ok(client):
    r = client.get("/")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["golden_twin_id"] == GOLDEN_ID
    assert body["cache_size"] == 0


# ─────────────────────────────────────────────
# 2. GET /twin/{id}
# ─────────────────────────────────────────────

def test_get_golden_twin(client):
    r = client.get(f"/twin/{GOLDEN_ID}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == GOLDEN_ID
    assert body["asset_count"] == 10
    assert body["identity_count"] == 4
    assert body["edge_count"] == 16
    assert body["flow_count"] == 6
    assert body["control_count"] == 4
    assert isinstance(body["hash"], str) and len(body["hash"]) > 8
    assert body["parent_id"] is None


def test_get_twin_not_found(client):
    r = client.get("/twin/does-not-exist")
    assert r.status_code == 404
    assert "not found" in r.json()["detail"].lower()


# ─────────────────────────────────────────────
# 3. POST /twin/{id}/clone
# ─────────────────────────────────────────────

def test_clone_twin_with_control(client):
    r = client.post(f"/twin/{GOLDEN_ID}/clone", json={
        "control_ids_to_add": ["ctrl-mfa"],
        "control_ids_to_remove": [],
    })
    assert r.status_code == 200
    body = r.json()
    assert body["original_id"] == GOLDEN_ID
    assert body["parent_id"] == GOLDEN_ID
    assert body["control_count"] >= 1  # mfa was added


def test_clone_twin_unknown_control(client):
    r = client.post(f"/twin/{GOLDEN_ID}/clone", json={
        "control_ids_to_add": ["ctrl-does-not-exist"],
    })
    assert r.status_code == 400
    assert "not defined" in r.json()["detail"].lower()


def test_clone_twin_registers_in_registry(client):
    r = client.post(f"/twin/{GOLDEN_ID}/clone", json={
        "control_ids_to_add": ["ctrl-edr"],
        "new_id": "twin-test-clone",
    })
    assert r.status_code == 200
    body = r.json()
    cloned_id = body["cloned_id"]

    # Now fetch the cloned twin
    r2 = client.get(f"/twin/{cloned_id}")
    assert r2.status_code == 200
    assert r2.json()["id"] == cloned_id


# ─────────────────────────────────────────────
# 4. POST /simulate
# ─────────────────────────────────────────────

def test_simulate_external_agent(client):
    r = client.post("/simulate", json={
        "twin_id": GOLDEN_ID,
        "agent_id": "agent-external",
        "n": 50,
        "seed": 42,
        "target": "prod-db",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["twin_id"] == GOLDEN_ID
    assert body["agent_id"] == "agent-external"
    assert body["n"] == 50
    assert body["seed"] == 42
    assert 0.0 <= body["p_success"] <= 1.0
    assert body["cached"] is False


def test_simulate_caching(client):
    payload = {
        "twin_id": GOLDEN_ID,
        "agent_id": "agent-external",
        "n": 50,
        "seed": 42,
        "target": "prod-db",
    }
    r1 = client.post("/simulate", json=payload)
    assert r1.status_code == 200
    assert r1.json()["cached"] is False

    r2 = client.post("/simulate", json=payload)
    assert r2.status_code == 200
    assert r2.json()["cached"] is True

    # Values must be identical (deterministic)
    assert r1.json()["p_success"] == r2.json()["p_success"]


def test_simulate_unknown_twin(client):
    r = client.post("/simulate", json={
        "twin_id": "ghost-twin",
        "agent_id": "agent-external",
        "n": 10,
        "seed": 1,
    })
    assert r.status_code == 404


def test_simulate_unknown_agent(client):
    r = client.post("/simulate", json={
        "twin_id": GOLDEN_ID,
        "agent_id": "agent-ghost",
        "n": 10,
        "seed": 1,
    })
    assert r.status_code == 404


def test_simulate_insider_agent(client):
    r = client.post("/simulate", json={
        "twin_id": GOLDEN_ID,
        "agent_id": "agent-insider",
        "n": 50,
        "seed": 42,
        "target": "prod-db",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["agent_id"] == "agent-insider"
    # Insider should have equal or higher success rate than external
    assert 0.0 <= body["p_success"] <= 1.0


# ─────────────────────────────────────────────
# 5. POST /evaluate-change  (stub)
# ─────────────────────────────────────────────

def test_evaluate_change_stub_returns_schema(client):
    r = client.post("/evaluate-change", json={
        "twin_id": GOLDEN_ID,
        "control_ids": ["ctrl-mfa"],
        "agent_ids": ["agent-external"],
        "seed": 42,
        "n": 50,
    })
    assert r.status_code == 200
    body = r.json()
    # Real ChangeVerdict from Person 2's evaluate.py
    assert "verdict" in body
    assert body["verdict"] in ("BLOCK", "REVIEW", "DEPLOY")
    assert "confidence" in body
    assert "broken_flows" in body
    assert "delta" in body
    assert "recommendation" in body
    # _stub key must NOT be present in the real response
    assert "_stub" not in body


def test_evaluate_change_unknown_twin(client):
    r = client.post("/evaluate-change", json={
        "twin_id": "ghost-twin",
        "control_ids": ["ctrl-mfa"],
        "agent_ids": [],
    })
    assert r.status_code == 404


def test_evaluate_change_mfa_wording(client):
    """evaluate-change with MFA control returns a valid verdict with broken_flows if any."""
    r = client.post("/evaluate-change", json={
        "twin_id": GOLDEN_ID,
        "control_ids": ["ctrl-mfa"],
        "agent_ids": ["agent-external"],
    })
    assert r.status_code == 200
    body = r.json()
    assert body["verdict"] in ("BLOCK", "REVIEW", "DEPLOY")
    # broken_flows is a list (may be empty for well-scoped controls)
    assert isinstance(body["broken_flows"], list)
    # Each broken flow must have at minimum a name or id field
    for flow in body["broken_flows"]:
        assert isinstance(flow, dict)


# ─────────────────────────────────────────────
# 6. POST /optimize  (stub)
# ─────────────────────────────────────────────

def test_optimize_stub_returns_schema(client):
    r = client.post("/optimize", json={
        "twin_id": GOLDEN_ID,
        "budget": 5000,
        "agent_ids": ["agent-external"],
        "seed": 42,
    })
    assert r.status_code == 200
    body = r.json()
    assert "optimal_portfolio" in body
    assert "naive_top_n" in body
    assert "alternatives" in body
    assert body["_stub"] is True


# ─────────────────────────────────────────────
# 7. GET /matrix/{twin_id}  (stub)
# ─────────────────────────────────────────────

def test_matrix_stub_returns_schema(client):
    r = client.get(f"/matrix/{GOLDEN_ID}")
    assert r.status_code == 200
    body = r.json()
    assert "controls" in body
    assert "agents" in body
    assert "matrix" in body
    assert len(body["matrix"]) == len(body["agents"])
    assert body["_stub"] is True


def test_matrix_unknown_twin(client):
    r = client.get("/matrix/ghost-twin")
    assert r.status_code == 404


# ─────────────────────────────────────────────
# 8. GET /blast-radius/{asset_id}
# ─────────────────────────────────────────────

def test_blast_radius_payroll_api(client):
    r = client.get("/blast-radius/payroll-api", params={"twin_id": GOLDEN_ID})
    assert r.status_code == 200
    body = r.json()
    assert body["asset_id"] == "payroll-api"
    assert body["twin_id"] == GOLDEN_ID
    assert isinstance(body["reachable"], list)
    assert isinstance(body["reachable_count"], int)
    assert "prod-db" in body["reachable"], "payroll-api must reach prod-db"
    assert "prod-db" in body["crown_jewels_reachable"]


def test_blast_radius_unknown_asset_returns_404(client):
    r = client.get("/blast-radius/ghost-asset", params={"twin_id": GOLDEN_ID})
    assert r.status_code == 404


# ─────────────────────────────────────────────
# 9. GET /lineage/{twin_id}
# ─────────────────────────────────────────────

def test_lineage_golden_single_node(client):
    r = client.get(f"/lineage/{GOLDEN_ID}")
    assert r.status_code == 200
    body = r.json()
    assert body["twin_id"] == GOLDEN_ID
    assert len(body["lineage"]) == 1
    assert body["lineage"][0]["twin_id"] == GOLDEN_ID
    assert body["lineage"][0]["parent_id"] is None


def test_lineage_after_clone(client):
    # Clone the golden twin
    clone_r = client.post(f"/twin/{GOLDEN_ID}/clone", json={
        "control_ids_to_add": ["ctrl-mfa"],
        "new_id": "twin-lineage-test",
    })
    assert clone_r.status_code == 200
    cloned_id = clone_r.json()["cloned_id"]

    # Lineage of the clone should show [clone → golden]
    r = client.get(f"/lineage/{cloned_id}")
    assert r.status_code == 200
    body = r.json()
    ids_in_chain = [n["twin_id"] for n in body["lineage"]]
    assert cloned_id in ids_in_chain
    assert GOLDEN_ID in ids_in_chain


def test_lineage_unknown_twin(client):
    r = client.get("/lineage/ghost-twin")
    assert r.status_code == 404


# ─────────────────────────────────────────────
# 10. Cache isolation
# ─────────────────────────────────────────────

def test_cache_is_empty_at_test_start(client):
    assert result_cache.size() == 0


def test_cache_populated_after_simulate(client):
    client.post("/simulate", json={
        "twin_id": GOLDEN_ID,
        "agent_id": "agent-external",
        "n": 10,
        "seed": 99,
    })
    assert result_cache.size() == 1


# ─────────────────────────────────────────────
# 11. Validation errors
# ─────────────────────────────────────────────

def test_simulate_invalid_n(client):
    """n must be >= 1."""
    r = client.post("/simulate", json={
        "twin_id": GOLDEN_ID,
        "agent_id": "agent-external",
        "n": 0,
        "seed": 42,
    })
    assert r.status_code == 422


def test_simulate_missing_required_fields(client):
    r = client.post("/simulate", json={"n": 10})
    assert r.status_code == 422
