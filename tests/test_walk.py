"""Tests for Phase 4: Plan-Then-Execute Agent Walk / Simulation (Algorithm B)."""

import ast
import math
from pathlib import Path
from unittest.mock import patch
import pytest

from backend.core.models import Agent, Asset, Identity, Edge, ServiceFlow, Twin
from backend.core.twin import CyberDigitalTwin, compute_twin_hash
from backend.rules.compile import CompiledEdge, CompiledTwin, compile_twin
from backend.core.search import AttackPath, Inventory, search
from backend.core.walk import (
    EvaluatedRoute,
    Result,
    SimulationResult,
    TrialRecord,
    compute_modelled_effort_score,
    compute_p_edge_eff,
    compute_p_route,
    compute_route_noise,
    compute_route_utility,
    evaluate_routes,
    execute_trial,
    simulate,
)


@pytest.fixture
def golden_twin() -> Twin:
    path = Path("backend/data/scenarios/golden.json")
    return Twin.model_validate_json(path.read_text(encoding="utf-8"))


@pytest.fixture
def privileged_agent() -> Agent:
    return Agent(
        id="adv-admin",
        name="Privileged Adversary",
        start_zones=("corp",),
        capabilities=frozenset(["creds:id-user-admin"]),
        objective="specific_target",
        noise_budget=1.0,
        skill=0.8,
    )


def make_dummy_path(
    path_id: str,
    edges: tuple[CompiledEdge, ...],
) -> AttackPath:
    nodes = (edges[0].src,) + tuple(e.dst for e in edges)
    return AttackPath(
        id=path_id,
        nodes=nodes,
        edges=edges,
        capabilities=frozenset(),
        depth=len(edges),
    )


# =====================================================================
# 1. Route Probability Calculation & Primitives (Items 1-3)
# =====================================================================

def test_p_edge_eff_formula():
    """Item 2: p_edge_eff = 1 - (1 - p)^3."""
    # Boundary tests
    assert compute_p_edge_eff(0.0) == 0.0
    assert compute_p_edge_eff(1.0) == 1.0

    # Intermediate known values
    # p = 0.5 -> 1 - (0.5)^3 = 1 - 0.125 = 0.875
    assert compute_p_edge_eff(0.5) == 0.875

    # p = 0.9 -> 1 - (0.1)^3 = 1 - 0.001 = 0.999
    assert compute_p_edge_eff(0.9) == pytest.approx(0.999)

    # p = 0.2 -> 1 - (0.8)^3 = 1 - 0.512 = 0.488
    assert compute_p_edge_eff(0.2) == pytest.approx(0.488)


def test_p_route_product():
    """Item 3: p_route is the product of effective edge probabilities."""
    assert compute_p_route([]) == 1.0
    assert compute_p_route([0.85]) == 0.85
    assert compute_p_route([0.5, 0.5, 0.5]) == 0.125
    assert compute_p_route([0.9, 0.0, 0.8]) == 0.0
    assert compute_p_route([0.999, 0.992]) == pytest.approx(0.999 * 0.992)


def test_route_probability_calculation():
    """Item 1: Complete route probability calculation from edge p_success."""
    e1 = CompiledEdge(
        src="A", dst="B", technique="t1",
        p_success=0.9, cost=1.0, noise=0.1,
    )
    e2 = CompiledEdge(
        src="B", dst="C", technique="t2",
        p_success=0.8, cost=2.0, noise=0.2,
    )
    eff1 = compute_p_edge_eff(e1.p_success)
    eff2 = compute_p_edge_eff(e2.p_success)
    assert eff1 == pytest.approx(0.999)
    assert eff2 == pytest.approx(0.992)

    p_route = compute_p_route([eff1, eff2])
    assert p_route == pytest.approx(0.999 * 0.992)


# =====================================================================
# 2. Modelled Attacker-Effort & Noise (Items 4-6)
# =====================================================================

def test_modelled_attacker_effort_score():
    """Item 4: Modelled attacker-effort score is sum(cost_i / p_i)."""
    edges = (
        CompiledEdge(src="A", dst="B", technique="t1", p_success=0.5, cost=2.0, noise=0.1),
        CompiledEdge(src="B", dst="C", technique="t2", p_success=0.75, cost=3.0, noise=0.2),
    )
    # 2.0 / 0.5 = 4.0 ; 3.0 / 0.75 = 4.0 -> sum = 8.0
    effort_score = compute_modelled_effort_score(edges)
    assert effort_score == pytest.approx(8.0)

    # Check documentation and docstring explicitly reference "modelled attacker-effort score"
    assert "modelled attacker-effort score" in compute_modelled_effort_score.__doc__.lower()


def test_noise_calculation():
    """Item 5: Noise calculation is sum(edge.noise)."""
    edges = (
        CompiledEdge(src="A", dst="B", technique="t1", p_success=0.9, cost=1.0, noise=0.15),
        CompiledEdge(src="B", dst="C", technique="t2", p_success=0.9, cost=1.0, noise=0.25),
        CompiledEdge(src="C", dst="D", technique="t3", p_success=0.9, cost=1.0, noise=0.35),
    )
    assert compute_route_noise(edges) == pytest.approx(0.75)


def test_routes_exceeding_noise_budget_removed():
    """Item 6: Routes exceeding noise budget are removed."""
    e_low = CompiledEdge(src="A", dst="B", technique="t1", p_success=0.9, cost=1.0, noise=0.3)
    e_high = CompiledEdge(src="A", dst="C", technique="t2", p_success=0.9, cost=1.0, noise=0.8)

    path_quiet = make_dummy_path("path-quiet", (e_low,))
    path_loud = make_dummy_path("path-loud", (e_high,))

    inventory = Inventory(paths=(path_quiet, path_loud), naive_path_count=2)
    agent = Agent(
        id="adv", name="Stealthy Adversary",
        start_zones=("A",), capabilities=frozenset(),
        objective="specific_target", noise_budget=0.5, skill=0.5,
    )

    evaluated = evaluate_routes(inventory, agent)
    # Loud route (noise 0.8 > 0.5) must be discarded
    assert len(evaluated) == 1
    assert evaluated[0].route_id == "path-quiet"

    # If noise budget is 0.2, both routes exceed and empty tuple is returned
    strict_agent = agent.model_copy(update={"noise_budget": 0.2})
    assert evaluate_routes(inventory, strict_agent) == ()


# =====================================================================
# 3. Top-K & Utility & Skill Selection (Items 7-11)
# =====================================================================

def test_route_utility_calculation():
    """Item 9: Utility calculation u = p_route / effort_score."""
    assert compute_route_utility(0.8, 4.0) == pytest.approx(0.2)
    assert compute_route_utility(0.0, 4.0) == 0.0
    assert compute_route_utility(0.8, 0.0) == 0.0


def test_top_k_routes_kept():
    """Item 7: Top-K = 5 routes are kept by utility."""
    # Create 8 paths with decreasing utility
    paths = []
    for i in range(8):
        cost = float(i + 1)
        edge = CompiledEdge(
            src="A", dst=f"node-{i}", technique=f"tech-{i}",
            p_success=0.9, cost=cost, noise=0.1,
        )
        paths.append(make_dummy_path(f"path-{i}", (edge,)))

    inventory = Inventory(paths=tuple(paths), naive_path_count=8)
    agent = Agent(
        id="adv", name="Adv", start_zones=("A",), capabilities=frozenset(),
        objective="specific_target", noise_budget=1.0, skill=0.5,
    )

    evaluated = evaluate_routes(inventory, agent, k=5)
    assert len(evaluated) == 5
    # Since cost increases from 1 to 8, utility decreases from path-0 to path-7
    # Top 5 must be path-0 through path-4
    kept_ids = [r.route_id for r in evaluated]
    assert kept_ids == ["path-0", "path-1", "path-2", "path-3", "path-4"]


def test_fewer_than_k_routes_handled():
    """Item 8: Fewer than 5 routes handled gracefully."""
    e = CompiledEdge(src="A", dst="B", technique="t", p_success=0.9, cost=1.0, noise=0.1)
    paths = [make_dummy_path("p1", (e,)), make_dummy_path("p2", (e,))]
    inventory = Inventory(paths=tuple(paths), naive_path_count=2)
    agent = Agent(
        id="adv", name="Adv", start_zones=("A",), capabilities=frozenset(),
        objective="specific_target", noise_budget=1.0, skill=0.5,
    )

    evaluated = evaluate_routes(inventory, agent, k=5)
    assert len(evaluated) == 2


def test_skill_affects_route_selection_weighting():
    """Item 10: Skill affects route selection weighting u^(1 + 4*skill)."""
    # Route 1: high utility (cost 1.0, p=0.9 -> utility high)
    # Route 2: low utility (cost 4.0, p=0.9 -> utility low)
    e1 = CompiledEdge(src="A", dst="B", technique="t1", p_success=0.9, cost=1.0, noise=0.1)
    e2 = CompiledEdge(src="A", dst="C", technique="t2", p_success=0.9, cost=4.0, noise=0.1)
    inventory = Inventory(paths=(make_dummy_path("p-high", (e1,)), make_dummy_path("p-low", (e2,))))

    agent_novice = Agent(
        id="adv-novice", name="Novice", start_zones=("A",), capabilities=frozenset(),
        objective="specific_target", noise_budget=1.0, skill=0.0,
    )
    agent_expert = Agent(
        id="adv-expert", name="Expert", start_zones=("A",), capabilities=frozenset(),
        objective="specific_target", noise_budget=1.0, skill=1.0,
    )

    eval_novice = evaluate_routes(inventory, agent_novice)
    eval_expert = evaluate_routes(inventory, agent_expert)

    # For expert (exponent = 5), probability of selecting high-utility route must be much higher than for novice (exponent = 1)
    p_high_novice = next(r.selection_prob for r in eval_novice if r.route_id == "p-high")
    p_high_expert = next(r.selection_prob for r in eval_expert if r.route_id == "p-high")

    assert p_high_expert > p_high_novice
    assert p_high_expert > 0.95  # Expert heavily exploits the better route


def test_selection_probabilities_normalize_to_one():
    """Item 11: Selection probabilities normalize to 1."""
    edges = [
        CompiledEdge(src="A", dst=f"B{i}", technique=f"t{i}", p_success=0.8, cost=float(i + 1), noise=0.1)
        for i in range(4)
    ]
    inventory = Inventory(paths=tuple(make_dummy_path(f"p{i}", (edges[i],)) for i in range(4)))

    for skill in [0.0, 0.25, 0.5, 0.75, 1.0]:
        agent = Agent(
            id="adv", name="Adv", start_zones=("A",), capabilities=frozenset(),
            objective="specific_target", noise_budget=1.0, skill=skill,
        )
        evaluated = evaluate_routes(inventory, agent)
        total_prob = sum(r.selection_prob for r in evaluated)
        assert total_prob == pytest.approx(1.0, rel=1e-5)


# =====================================================================
# 4. Determinism & Seeded Execution (Items 12-13)
# =====================================================================

def test_same_seed_gives_identical_results(golden_twin, privileged_agent):
    """Item 12: Same seed gives identical results."""
    res1 = simulate(golden_twin, privileged_agent, n=100, seed=42)
    res2 = simulate(golden_twin, privileged_agent, n=100, seed=42)

    assert res1.p_success == res2.p_success
    assert res1.mean_effort == res2.mean_effort
    assert res1.mean_noise == res2.mean_noise
    assert res1.detection_rate == res2.detection_rate
    assert len(res1.trials) == len(res2.trials) == 100

    for t1, t2 in zip(res1.trials, res2.trials):
        assert t1.route_id == t2.route_id
        assert t1.success == t2.success
        assert t1.realized_effort == t2.realized_effort
        assert t1.realized_noise == t2.realized_noise
        assert t1.detected == t2.detected
        assert t1.attempts_by_edge == t2.attempts_by_edge


def test_different_seeds_produce_different_results(golden_twin, privileged_agent):
    """Item 13: Different seeds can produce different results."""
    res1 = simulate(golden_twin, privileged_agent, n=200, seed=42)
    res2 = simulate(golden_twin, privileged_agent, n=200, seed=99999)

    # Across 200 trials with p_success < 1.0, random roll sequences differ
    trial_efforts_1 = [t.realized_effort for t in res1.trials]
    trial_efforts_2 = [t.realized_effort for t in res2.trials]
    assert trial_efforts_1 != trial_efforts_2


# =====================================================================
# 5. Trial Execution & Edge Attempts (Items 14-19)
# =====================================================================

def test_max_three_attempts_per_edge():
    """Item 14: Maximum 3 attempts per edge."""
    # p_success = 0.0 guarantees failure on every attempt
    edge = CompiledEdge(src="A", dst="B", technique="t", p_success=0.0, cost=2.0, noise=0.1)
    path = make_dummy_path("p-fail", (edge,))
    inventory = Inventory(paths=(path,))
    agent = Agent(
        id="adv", name="Adv", start_zones=("A",), capabilities=frozenset(),
        objective="specific_target", noise_budget=1.0, skill=0.5,
    )

    res = simulate(inventory, agent, n=1, seed=42)
    trial = res.trials[0]
    assert trial.attempts_by_edge == (3,)
    assert trial.total_attempts == 3


def test_failed_edge_after_three_attempts_fails_route():
    """Item 15: Failed edge after 3 attempts fails the route and halts."""
    e1 = CompiledEdge(src="A", dst="B", technique="t1", p_success=0.0, cost=2.0, noise=0.1)
    e2 = CompiledEdge(src="B", dst="C", technique="t2", p_success=1.0, cost=1.0, noise=0.1)
    path = make_dummy_path("p-multi", (e1, e2))
    inventory = Inventory(paths=(path,))
    agent = Agent(
        id="adv", name="Adv", start_zones=("A",), capabilities=frozenset(),
        objective="specific_target", noise_budget=1.0, skill=0.5,
    )

    res = simulate(inventory, agent, n=1, seed=42)
    trial = res.trials[0]
    assert trial.success is False
    assert "edge_failed" in trial.reason
    # Only e1 was executed (entered); e2 was never executed
    assert len(trial.edges_executed) == 1
    assert trial.edges_executed[0] == e1


def test_successful_route_executes_all_edges():
    """Item 16: Successful route executes all edges."""
    e1 = CompiledEdge(src="A", dst="B", technique="t1", p_success=1.0, cost=2.0, noise=0.1)
    e2 = CompiledEdge(src="B", dst="C", technique="t2", p_success=1.0, cost=3.0, noise=0.1)
    e3 = CompiledEdge(src="C", dst="D", technique="t3", p_success=1.0, cost=4.0, noise=0.1)
    path = make_dummy_path("p-success", (e1, e2, e3))
    inventory = Inventory(paths=(path,))
    agent = Agent(
        id="adv", name="Adv", start_zones=("A",), capabilities=frozenset(),
        objective="specific_target", noise_budget=1.0, skill=0.5,
    )

    res = simulate(inventory, agent, n=1, seed=42)
    trial = res.trials[0]
    assert trial.success is True
    assert trial.reason == "target_reached"
    assert trial.edges_executed == (e1, e2, e3)
    assert len(trial.edges_executed) == 3


def test_realized_effort_equals_sum_of_attempt_costs():
    """Item 17: Realized effort equals the sum of costs of actual attempts."""
    e1 = CompiledEdge(src="A", dst="B", technique="t1", p_success=0.0, cost=3.5, noise=0.1)
    path = make_dummy_path("p-cost", (e1,))
    inventory = Inventory(paths=(path,))
    agent = Agent(
        id="adv", name="Adv", start_zones=("A",), capabilities=frozenset(),
        objective="specific_target", noise_budget=1.0, skill=0.5,
    )

    res = simulate(inventory, agent, n=1, seed=42)
    trial = res.trials[0]
    # 3 attempts made, each costing 3.5 -> 3 * 3.5 = 10.5
    assert trial.attempts_by_edge[0] == 3
    assert trial.realized_effort == pytest.approx(10.5)


def test_realized_noise_equals_sum_of_attempt_noise():
    """Item 18: Realized noise equals the sum of noise of actual attempts."""
    e1 = CompiledEdge(src="A", dst="B", technique="t1", p_success=0.0, cost=1.0, noise=0.15)
    path = make_dummy_path("p-noise", (e1,))
    inventory = Inventory(paths=(path,))
    agent = Agent(
        id="adv", name="Adv", start_zones=("A",), capabilities=frozenset(),
        objective="specific_target", noise_budget=1.0, skill=0.5,
    )

    res = simulate(inventory, agent, n=1, seed=42)
    trial = res.trials[0]
    # 3 attempts * 0.15 noise = 0.45
    assert trial.realized_noise == pytest.approx(0.45)


def test_noise_budget_detection_terminates_execution():
    """Item 19: Noise budget detection terminates execution immediately."""
    # noise = 0.4, budget = 0.5
    # Attempt 1: cumulative noise = 0.4 <= 0.5 (ok)
    # Attempt 2: cumulative noise = 0.8 > 0.5 (exceeded -> detected and halted!)
    e1 = CompiledEdge(src="A", dst="B", technique="t1", p_success=0.0, cost=1.0, noise=0.4)
    path = make_dummy_path("p-detected", (e1,))
    inventory = Inventory(paths=(path,))
    agent = Agent(
        id="adv", name="Adv", start_zones=("A",), capabilities=frozenset(),
        objective="specific_target", noise_budget=0.5, skill=0.5,
    )

    res = simulate(inventory, agent, n=1, seed=42)
    trial = res.trials[0]
    assert trial.detected is True
    assert trial.success is False
    assert trial.reason == "noise_budget_exceeded"
    # Stopped on attempt 2, did NOT make attempt 3
    assert trial.attempts_by_edge[0] == 2
    assert trial.realized_noise == pytest.approx(0.8)


# =====================================================================
# 6. Search-Once & Immutability (Items 20-23)
# =====================================================================

def test_search_is_not_called_inside_every_simulation_trial(golden_twin, privileged_agent):
    """Item 20: Search is NOT called inside each simulation trial (N=1000 trials)."""
    with patch("backend.core.walk.search", wraps=search) as mock_search:
        res = simulate(golden_twin, privileged_agent, n=1000, seed=42)
        # Search must be called exactly once before trials begin
        assert mock_search.call_count == 1
        assert len(res.trials) == 1000

    # If inventory is provided, search must not be called at all
    compiled = compile_twin(golden_twin)
    inv = search(compiled, privileged_agent, target="prod-db", assets=golden_twin)
    with patch("backend.core.walk.search", wraps=search) as mock_search_precomputed:
        res_inv = simulate(inv, privileged_agent, n=500, seed=42)
        assert mock_search_precomputed.call_count == 0
        assert len(res_inv.trials) == 500


def test_simulation_does_not_mutate_twin(golden_twin, privileged_agent):
    """Item 21: Simulation does not mutate Twin."""
    hash_before = compute_twin_hash(golden_twin)
    json_before = golden_twin.model_dump_json()

    simulate(golden_twin, privileged_agent, n=100, seed=42)

    hash_after = compute_twin_hash(golden_twin)
    json_after = golden_twin.model_dump_json()

    assert hash_before == hash_after
    assert json_before == json_after


def test_simulation_does_not_mutate_agent(golden_twin, privileged_agent):
    """Item 22: Simulation does not mutate Agent."""
    agent_dump_before = privileged_agent.model_dump()

    simulate(golden_twin, privileged_agent, n=100, seed=42)

    agent_dump_after = privileged_agent.model_dump()
    assert agent_dump_before == agent_dump_after


def test_simulation_does_not_mutate_inventory_or_compiled_edges(golden_twin, privileged_agent):
    """Item 23: Simulation does not mutate Inventory or compiled edges."""
    compiled = compile_twin(golden_twin)
    inv = search(compiled, privileged_agent, target="prod-db", assets=golden_twin)
    inv_dump_before = inv.model_dump()

    simulate(inv, privileged_agent, n=100, seed=42)

    inv_dump_after = inv.model_dump()
    assert inv_dump_before == inv_dump_after


# =====================================================================
# 7. Golden Scenario & Engine Decoupling (Items 24-25)
# =====================================================================

def test_finbank_golden_scenario_integration(golden_twin, privileged_agent):
    """Item 24: FinBank golden scenario integrates correctly with simulator."""
    result = simulate(golden_twin, privileged_agent, n=100, seed=42)

    assert isinstance(result, Result)
    assert result.twin_id == golden_twin.id
    assert result.agent_id == privileged_agent.id
    assert result.n == 100
    assert len(result.trials) == 100
    assert len(result.candidate_routes) > 0

    # Check that candidate routes target prod-db
    assert any("prod-db" in r.path.nodes for r in result.candidate_routes)
    # Check that jump-01 is present in routes
    assert any("jump-01" in r.path.nodes for r in result.candidate_routes)

    # Basic statistical invariants
    assert 0.0 <= result.p_success <= 1.0
    assert result.mean_effort > 0.0
    assert result.mean_noise > 0.0
    assert 0.0 <= result.detection_rate <= 1.0
    assert result.success_count + result.failure_count == 100


def test_walk_does_not_import_legacy_engine():
    """Item 25: walk.py does not import legacy engine/."""
    walk_path = Path("backend/core/walk.py")
    tree = ast.parse(walk_path.read_text(encoding="utf-8"))

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                assert not alias.name.startswith("engine"), f"Forbidden import: {alias.name}"
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                assert not node.module.startswith("engine"), f"Forbidden import from: {node.module}"
