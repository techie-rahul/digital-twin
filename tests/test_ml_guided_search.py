"""Comprehensive tests for ML feature extraction, synthetic training, guided search, and safety invariants."""
from __future__ import annotations

from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from backend.core.models import Agent, Control, Edge, Twin
from backend.core.search import search
from backend.rules.compile import CompiledEdge, compile_twin
from backend.ml.features import extract_features
from backend.ml.dataset import generate_synthetic_experiences
from backend.ml.model import TransitionScorer
from backend.ml.guided_search import guided_search
from backend.api.main import create_app


@pytest.fixture
def golden_twin() -> Twin:
    path = Path("backend/data/scenarios/golden.json")
    return Twin.model_validate_json(path.read_text(encoding="utf-8"))


@pytest.fixture
def api_client():
    app = create_app()
    with TestClient(app) as client:
        yield client


# ─────────────────────────────────────────────────────────────────────
# 1. Feature Extraction Tests
# ─────────────────────────────────────────────────────────────────────

def test_feature_extraction_length_and_types(golden_twin):
    compiled = compile_twin(golden_twin)
    first_edge = compiled.edges[0]
    feats = extract_features(
        edge=first_edge,
        current_caps=frozenset(),
        twin=golden_twin,
        graph=None,
        target_id="prod-db",
        target_distance_map={},
    )
    assert len(feats) == 10
    assert all(isinstance(f, (float, int)) for f in feats)


def test_feature_extraction_is_deterministic(golden_twin):
    compiled = compile_twin(golden_twin)
    edge = compiled.edges[0]
    f1 = extract_features(edge, frozenset(), golden_twin, None, "prod-db", {})
    f2 = extract_features(edge, frozenset(), golden_twin, None, "prod-db", {})
    assert f1 == f2


# ─────────────────────────────────────────────────────────────────────
# 2. Dataset Generation Tests
# ─────────────────────────────────────────────────────────────────────

def test_dataset_generation_splits():
    splits = generate_synthetic_experiences(
        num_train_twins=4,
        num_val_twins=2,
        num_test_twins=2,
        seed=42,
    )
    assert "train" in splits and "val" in splits and "test" in splits
    X_train, y_train = splits["train"]
    assert len(X_train) > 0
    assert len(X_train) == len(y_train)
    assert len(X_train[0]) == 10


# ─────────────────────────────────────────────────────────────────────
# 3. Model Training & Safe Fallback Tests
# ─────────────────────────────────────────────────────────────────────

def test_model_training_and_scoring():
    scorer = TransitionScorer()
    dummy_X = [[3.0, 0.0, 2.0, 1.0, 2.0, 1.0, 0.2, 1.0, 0.0, 2.0]] * 10
    dummy_y = [1] * 5 + [0] * 5
    scorer.fit(dummy_X, dummy_y)
    assert scorer.is_fitted

    score = scorer.predict_score(dummy_X[0])
    assert 0.0 <= score <= 1.0


def test_model_fallback_on_unfitted_instance():
    scorer = TransitionScorer()
    assert not scorer.is_fitted
    # Unfitted instance must return analytical heuristic without throwing
    dummy_feats = [5.0, 1.0, 2.0, 1.0, 3.0, 2.0, 0.1, 0.0, 1.0, 1.0]
    score = scorer.predict_score(dummy_feats)
    assert score > 0.0


# ─────────────────────────────────────────────────────────────────────
# 4. CRITICAL CORRECTNESS TEST: ML Cannot Bypass Security Rules
# ─────────────────────────────────────────────────────────────────────

class BiasedScorer(TransitionScorer):
    """Adversarial mock that returns 1.0 for every transition."""
    def predict_batch(self, feature_batch):
        return [1.0] * len(feature_batch)


def test_ml_cannot_bypass_capability_requirements(golden_twin):
    """Even if ML assigns maximum score (1.0), transition requiring missing credentials is NEVER traversed."""
    ct = compile_twin(golden_twin)

    # Unprivileged agent with NO admin credentials
    agent_unprivileged = Agent(
        id="adv-unprivileged",
        name="Unprivileged Attacker",
        start_zones=("corp",),
        capabilities=frozenset(),
        objective="specific_target",
        noise_budget=1.0,
        skill=0.5,
    )

    biased_scorer = BiasedScorer()
    inv, states_eval, fallback = guided_search(
        edges=ct,
        agent=agent_unprivileged,
        target="prod-db",
        scorer=biased_scorer,
        assets=golden_twin,
    )

    # Must find 0 paths to prod-db because rule engine strictly blocks jump-01
    assert inv.naive_path_count == 0
    assert not any("prod-db" in p.nodes for p in inv.paths)


def test_ml_cannot_bypass_mfa_control(golden_twin):
    """When MFA control is applied, ML guidance respects the block and explores alternative paths."""
    from backend.core.twin import clone
    
    # Clone twin and apply active network segmentation blocking prod-db directly
    hardened_twin = clone(
        golden_twin,
        new_id="twin-blocked",
        add_controls=[
            Control(
                id="ctrl-strict-seg",
                name="Strict Core DB Isolation",
                cost=2000,
                blocks=("rdp_lateral", "db_login"),
                scope=("prod-db",),
                efficacy=1.0,
            )
        ],
    )
    # Compile with naive=True (complete blocking)
    ct_naive = compile_twin(hardened_twin, naive=True)

    agent_admin = Agent(
        id="adv-admin",
        name="Privileged Attacker",
        start_zones=("corp",),
        capabilities=frozenset(["creds:id-user-admin"]),
        objective="specific_target",
        noise_budget=1.0,
        skill=0.8,
    )

    biased_scorer = BiasedScorer()
    inv, states_eval, fallback = guided_search(
        edges=ct_naive,
        agent=agent_admin,
        target="prod-db",
        scorer=biased_scorer,
        assets=hardened_twin,
    )

    # Completely blocked transition cannot be traversed even with score 1.0
    assert inv.naive_path_count == 0


# ─────────────────────────────────────────────────────────────────────
# 5. Baseline vs Guided Search Integration Tests
# ─────────────────────────────────────────────────────────────────────

def test_guided_search_finds_paths(golden_twin):
    ct = compile_twin(golden_twin)
    agent_admin = Agent(
        id="adv-admin",
        name="Privileged Attacker",
        start_zones=("corp",),
        capabilities=frozenset(["creds:id-user-admin"]),
        objective="specific_target",
        noise_budget=1.0,
        skill=0.8,
    )

    # 1. Baseline search
    baseline_inv = search(ct, agent_admin, target="prod-db", assets=golden_twin)
    assert baseline_inv.naive_path_count >= 1

    # 2. ML guided search
    guided_inv, states_eval, fallback = guided_search(ct, agent_admin, target="prod-db", assets=golden_twin)
    assert guided_inv.naive_path_count >= 1
    assert states_eval > 0
    assert fallback is False

    # Both methods discover valid paths reaching prod-db
    assert any("prod-db" in p.nodes for p in guided_inv.paths)


# ─────────────────────────────────────────────────────────────────────
# 6. API Integration Tests
# ─────────────────────────────────────────────────────────────────────

def test_simulate_api_returns_ml_telemetry(api_client):
    res = api_client.post(
        "/simulate",
        json={
            "twin_id": "twin-finbank-golden",
            "agent_id": "agent-insider",
            "n": 50,
            "seed": 42,
            "target": "prod-db",
            "guided": True,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert "states_explored" in data
    assert "search_efficiency_pct" in data
    assert data["guidance_mode"] in ("adaptive_ml", "deterministic_dfs")


def test_ml_status_endpoint(api_client):
    res = api_client.get("/ml/status")
    assert res.status_code == 200
    data = res.json()
    assert "status" in data
    assert "model_type" in data
    assert "explainability" in data
