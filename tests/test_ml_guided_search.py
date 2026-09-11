"""Tests for ML feature extraction, synthetic training, and guided search."""
import pytest
from pathlib import Path

from backend.core.models import Agent, Twin
from backend.core.search import search
from backend.rules.compile import compile_twin
from backend.ml.features import extract_features
from backend.ml.model import TransitionScorer
from backend.ml.dataset import generate_synthetic_experiences
from backend.ml.guided_search import guided_search


@pytest.fixture
def golden_twin() -> Twin:
    path = Path("backend/data/scenarios/golden.json")
    return Twin.model_validate_json(path.read_text(encoding="utf-8"))


def test_feature_extraction_length_and_types(golden_twin):
    compiled = compile_twin(golden_twin)
    first_edge = compiled.edges[0]
    feats = extract_features(
        edge=first_edge,
        current_caps=frozenset(),
        twin=golden_twin,
        graph=golden_twin.graph if hasattr(golden_twin, "graph") else None,
        target_id="prod-db",
        target_distance_map={},
    )
    assert len(feats) == 8
    assert all(isinstance(f, float) for f in feats)


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
    guided_inv, states_eval = guided_search(ct, agent_admin, target="prod-db", assets=golden_twin)
    assert guided_inv.naive_path_count >= 1
    assert states_eval > 0
    
    # Both methods must discover paths reaching prod-db
    assert any("prod-db" in p.nodes for p in guided_inv.paths)
