import pytest
from fastapi.testclient import TestClient
from server.app import app

client = TestClient(app)


def test_health_check():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"


def test_get_twin():
    res = client.get("/api/twin")
    assert res.status_code == 200
    data = res.json()
    assert "assets" in data
    assert len(data["assets"]) >= 9
    assert "flows" in data
    assert len(data["flows"]) >= 6


def test_simulate_endpoint():
    res = client.post(
        "/api/simulate",
        json={"twin_id": "twin-finbank-golden", "seed": 42, "n_walks": 50},
    )
    assert res.status_code == 200
    data = res.json()
    assert "p_success" in data
    assert "compromised_nodes" in data
    assert "attack_trajectory" in data


def test_evaluate_change_endpoint():
    # Network segmentation should produce BLOCK due to breaking F3
    res = client.post(
        "/api/evaluate-change",
        json={"control_ids": ["ctrl-network-seg"], "seed": 42, "n_walks": 50},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["recommendation"] == "BLOCK"
    assert len(data["broken_flows"]) > 0


def test_optimize_endpoint():
    res = client.post(
        "/api/optimize",
        json={"budget": 5000, "max_broken_criticality": 3, "seed": 42, "n_walks": 50},
    )
    assert res.status_code == 200
    data = res.json()
    assert "constrained_portfolio" in data or "selected_control_ids" in data


def test_blast_radius_endpoint():
    res = client.get("/api/blast-radius/jump-01")
    assert res.status_code == 200
    data = res.json()
    assert data["source_asset_id"] == "jump-01"
    assert "reachable_asset_ids" in data
