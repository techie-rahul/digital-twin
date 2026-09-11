from pathlib import Path
import pytest

from backend.core.models import Agent, Twin
from backend.rules.optimize import optimize_controls, OptimizationResult


@pytest.fixture
def golden_twin() -> Twin:
    path = Path("backend/data/scenarios/golden.json")
    return Twin.model_validate_json(path.read_text(encoding="utf-8"))


@pytest.fixture
def adversary_admin() -> Agent:
    return Agent(
        id="adv-admin",
        name="Privileged Adversary",
        start_zones=("corp",),
        capabilities=frozenset(["creds:id-user-admin"]),
        objective="specific_target",
        noise_budget=1.0,
        skill=0.8,
    )


def test_optimize_controls_basic(golden_twin: Twin, adversary_admin: Agent):
    res = optimize_controls(
        twin=golden_twin,
        budget=5000,
        max_broken_criticality=3,
        agents=adversary_admin,
        seed=42,
        n=100,
    )

    assert isinstance(res, OptimizationResult)
    assert res.budget == 5000
    assert res.constrained_portfolio.total_cost <= 5000
    assert res.constrained_portfolio.is_safe is True
    # Constrained portfolio must not break F3 (crit 5) or F6 (crit 4)
    assert not any(f.criticality > 3 for f in res.constrained_portfolio.broken_flows)


def test_optimize_controls_contrast_with_naive(golden_twin: Twin, adversary_admin: Agent):
    res = optimize_controls(
        twin=golden_twin,
        budget=4000,
        max_broken_criticality=3,
        agents=adversary_admin,
        seed=42,
        n=100,
    )

    # Naive portfolio contains segmentation or high efficacy control that breaks critical flows
    # While constrained portfolio remains safe
    assert res.constrained_portfolio.is_safe is True
    assert res.constrained_portfolio.total_cost <= 4000
    assert len(res.contrast_summary) > 0


def test_optimize_low_budget_empty_selection(golden_twin: Twin, adversary_admin: Agent):
    res = optimize_controls(
        twin=golden_twin,
        budget=500,  # Below cheapest control ($1000)
        agents=adversary_admin,
        seed=42,
        n=50,
    )

    assert res.constrained_portfolio.total_cost == 0
    assert len(res.constrained_portfolio.control_ids) == 0
