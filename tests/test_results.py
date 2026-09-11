"""Tests for Phase 5: Results and Metrics (v2.1).

Covers:
- Zero trials safety
- Separation of successful and failed trials in effort metrics
- Deterministic Wilson confidence intervals
- Effort statistics and nearest-rank p90 calculation
- Effort distribution histogram bins
- Choke-point edge frequencies
- Route statistics (p_select vs observed frequency)
- Target-criticality weighted risk calculation
- Delta calculations and path reductions
- Fewer-than-20-successes behavior (effort_increase_pct is None)
- Route elimination and substituted paths
- Determinism and reproducibility
- FinBank scenario end-to-end integration
"""

import math
from pathlib import Path
import pytest

from backend.core.models import Agent, Asset, Edge, Identity, ServiceFlow, Twin
from backend.core.search import AttackPath, Inventory
from backend.core.twin import CyberDigitalTwin, clone
from backend.core.walk import (
    EvaluatedRoute,
    Result as WalkResult,
    SimulationResult,
    TrialRecord,
    simulate,
)
from backend.rules.compile import CompiledEdge, CompiledTwin, compile_twin
from backend.core.results import (
    Delta,
    Result,
    RouteStat,
    TopRouteStats,
    compute_edge_frequencies,
    compute_effort_distribution,
    compute_p90,
    compute_results,
    compute_weighted_risk,
    compute_wilson_ci,
    diff,
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


def make_dummy_edge(src: str, dst: str, technique: str = "t1", cost: float = 1.0, noise: float = 0.1, p_success: float = 0.9) -> CompiledEdge:
    return CompiledEdge(
        src=src,
        dst=dst,
        technique=technique,
        cost=cost,
        noise=noise,
        p_success=p_success,
    )


def make_dummy_path(path_id: str, edges: tuple[CompiledEdge, ...]) -> AttackPath:
    nodes = (edges[0].src,) + tuple(e.dst for e in edges)
    return AttackPath(
        id=path_id,
        nodes=nodes,
        edges=edges,
        capabilities=frozenset(),
        depth=len(edges),
    )


# =====================================================================
# 1. Zero Trials Safety
# =====================================================================

def test_zero_trials_safety():
    """Verify that zero trials produce safe defaults without ZeroDivisionError."""
    empty_walk = WalkResult(
        twin_id="twin-zero",
        agent_id="agent-zero",
        target="prod-db",
        n=0,
        seed=42,
        candidate_routes=(),
        trials=(),
    )
    res = compute_results(empty_walk)

    assert res.p_success == 0.0
    assert res.wilson_ci == (0.0, 0.0)
    assert res.wilson_confidence == (0.0, 0.0)
    assert res.mean_effort == 0.0
    assert res.p90_effort == 0.0
    assert res.effort_distribution == {}
    assert res.edge_frequency == {}
    assert res.top_routes == ()
    assert res.weighted_risk == 0.0
    assert res.success_count == 0
    assert res.failure_count == 0


def test_wilson_ci_zero_trials():
    """Verify compute_wilson_ci handles n <= 0 safely."""
    assert compute_wilson_ci(0, 0) == (0.0, 0.0)
    assert compute_wilson_ci(5, -1) == (0.0, 0.0)


# =====================================================================
# 2. Effort Metrics Over Successful Trials Only
# =====================================================================

def test_successful_failed_trials_effort_separation():
    """Verify that mean_effort and p90_effort ONLY aggregate successful trials."""
    edge1 = make_dummy_edge("A", "B", cost=10.0)
    trials = (
        # 4 Successful trials with efforts: 10.0, 20.0, 30.0, 40.0
        TrialRecord(trial_id=1, route_id="r1", success=True, realized_effort=10.0, realized_noise=0.1, detected=False, edges_executed=(edge1,)),
        TrialRecord(trial_id=2, route_id="r1", success=True, realized_effort=20.0, realized_noise=0.1, detected=False, edges_executed=(edge1,)),
        TrialRecord(trial_id=3, route_id="r1", success=True, realized_effort=30.0, realized_noise=0.1, detected=False, edges_executed=(edge1,)),
        TrialRecord(trial_id=4, route_id="r1", success=True, realized_effort=40.0, realized_noise=0.1, detected=False, edges_executed=(edge1,)),
        # 3 Failed trials with huge efforts: 500.0, 1000.0, 2000.0
        TrialRecord(trial_id=5, route_id="r1", success=False, realized_effort=500.0, realized_noise=0.9, detected=True, edges_executed=(edge1,)),
        TrialRecord(trial_id=6, route_id="r1", success=False, realized_effort=1000.0, realized_noise=0.9, detected=True, edges_executed=(edge1,)),
        TrialRecord(trial_id=7, route_id="r1", success=False, realized_effort=2000.0, realized_noise=0.9, detected=True, edges_executed=(edge1,)),
    )

    walk_res = WalkResult(
        twin_id="test-twin",
        agent_id="test-agent",
        target="B",
        n=7,
        seed=1,
        trials=trials,
    )
    res = compute_results(walk_res)

    assert res.success_count == 4
    assert res.failure_count == 3
    # Mean of successful trials: (10 + 20 + 30 + 40) / 4 = 25.0
    assert res.mean_effort == 25.0
    # Failed trials must NOT pollute mean effort
    assert res.mean_effort < 100.0

    # Nearest rank p90 of [10.0, 20.0, 30.0, 40.0]:
    # ceil(0.90 * 4) - 1 = ceil(3.6) - 1 = 4 - 1 = 3 -> values[3] = 40.0
    assert res.p90_effort == 40.0


def test_all_failed_trials_effort():
    """Verify that when all trials fail, effort metrics default cleanly to 0.0."""
    trials = (
        TrialRecord(trial_id=1, route_id="r1", success=False, realized_effort=50.0, realized_noise=0.5, detected=True),
        TrialRecord(trial_id=2, route_id="r1", success=False, realized_effort=60.0, realized_noise=0.6, detected=True),
    )
    walk_res = WalkResult(twin_id="t", agent_id="a", n=2, trials=trials)
    res = compute_results(walk_res)

    assert res.success_count == 0
    assert res.failure_count == 2
    assert res.p_success == 0.0
    assert res.mean_effort == 0.0
    assert res.p90_effort == 0.0
    assert res.effort_distribution == {}


# =====================================================================
# 3. Wilson Confidence Interval
# =====================================================================

def test_wilson_ci_bounds_and_properties():
    """Verify Wilson confidence interval calculation correctness and bounding."""
    # 50 successes out of 100 trials (p = 0.50)
    lower, upper = compute_wilson_ci(50, 100, z=1.96)
    assert 0.40 <= lower <= 0.41
    assert 0.59 <= upper <= 0.60
    assert lower < 0.50 < upper

    # 0 successes out of 10 trials
    lower0, upper0 = compute_wilson_ci(0, 10, z=1.96)
    assert lower0 == 0.0
    assert 0.0 < upper0 <= 0.30

    # 10 successes out of 10 trials
    lower1, upper1 = compute_wilson_ci(10, 10, z=1.96)
    assert 0.70 <= lower1 < 1.0
    assert upper1 == 1.0

    # Clamping guarantee: bounds must always be in [0.0, 1.0]
    for s in [0, 1, 5, 9, 10]:
        l, u = compute_wilson_ci(s, 10)
        assert 0.0 <= l <= u <= 1.0


# =====================================================================
# 4. Effort Statistics & P90
# =====================================================================

def test_compute_p90_nearest_rank():
    """Verify nearest-rank calculation for p90."""
    assert compute_p90([]) == 0.0
    assert compute_p90([42.0]) == 42.0

    # 10 elements: 1.0, 2.0, ..., 10.0
    # ceil(0.90 * 10) - 1 = 9 - 1 = 8 -> index 8 is 9.0
    vals_10 = [float(i) for i in range(1, 11)]
    assert compute_p90(vals_10) == 9.0

    # 20 elements: 1.0 .. 20.0
    # ceil(0.90 * 20) - 1 = 18 - 1 = 17 -> index 17 is 18.0
    vals_20 = [float(i) for i in range(1, 21)]
    assert compute_p90(vals_20) == 18.0


def test_effort_distribution_bins():
    """Verify effort distribution histogram bin creation and counting."""
    assert compute_effort_distribution([]) == {}

    # All identical values: single bin
    single_bin_dist = compute_effort_distribution([10.0, 10.0, 10.0], bins=5)
    assert len(single_bin_dist) == 1
    assert list(single_bin_dist.values())[0] == 3

    # Varied values across range 0.0 to 100.0 with 10 bins
    values = [5.0, 15.0, 25.0, 35.0, 45.0, 55.0, 65.0, 75.0, 85.0, 95.0]
    dist = compute_effort_distribution(values, bins=10)
    assert len(dist) == 10
    # Total count in histogram bins must equal len(values)
    assert sum(dist.values()) == len(values)
    for count in dist.values():
        assert count == 1


# =====================================================================
# 5. Choke-Point Edge Frequencies
# =====================================================================

def test_edge_frequencies_calculation():
    """Verify edge frequencies reflect the proportion of trials executing each edge."""
    e1 = make_dummy_edge("A", "B", "t1")
    e2 = make_dummy_edge("B", "C", "t2")
    e3 = make_dummy_edge("B", "D", "t3")

    trials = (
        TrialRecord(trial_id=1, route_id="r1", success=True, realized_effort=1.0, realized_noise=0.1, detected=False, edges_executed=(e1, e2)),
        TrialRecord(trial_id=2, route_id="r2", success=True, realized_effort=1.0, realized_noise=0.1, detected=False, edges_executed=(e1, e3)),
        TrialRecord(trial_id=3, route_id="r1", success=True, realized_effort=1.0, realized_noise=0.1, detected=False, edges_executed=(e1, e2)),
        TrialRecord(trial_id=4, route_id="r2", success=False, realized_effort=1.0, realized_noise=0.1, detected=False, edges_executed=(e1,)),
    )

    freqs = compute_edge_frequencies(trials, n=4)

    # A->B executed in all 4 trials -> frequency 1.0
    assert freqs["A->B"] == 1.0
    # B->C executed in 2 trials -> frequency 2/4 = 0.5
    assert freqs["B->C"] == 0.5
    # B->D executed in 1 trial -> frequency 1/4 = 0.25
    assert freqs["B->D"] == 0.25


# =====================================================================
# 6. Route Statistics & Observed Frequency
# =====================================================================

def test_route_statistics_and_observed_frequencies():
    """Verify each top-K route exposes p_select, observed frequency, and route properties."""
    e1 = make_dummy_edge("A", "B", "t1")
    p1 = make_dummy_path("route_alpha", (e1,))
    p2 = make_dummy_path("route_beta", (e1,))

    r1 = EvaluatedRoute(
        route_id="route_alpha",
        path=p1,
        p_edge_eff=(0.9,),
        p_route=0.9,
        effort_score=5.0,
        noise=0.2,
        utility=0.18,
        selection_weight=3.0,
        selection_prob=0.75,
    )
    r2 = EvaluatedRoute(
        route_id="route_beta",
        path=p2,
        p_edge_eff=(0.5,),
        p_route=0.5,
        effort_score=10.0,
        noise=0.4,
        utility=0.05,
        selection_weight=1.0,
        selection_prob=0.25,
    )

    # 4 trials: route_alpha selected 3 times, route_beta selected 1 time
    trials = (
        TrialRecord(trial_id=1, route_id="route_alpha", success=True, realized_effort=5.0, realized_noise=0.2, detected=False),
        TrialRecord(trial_id=2, route_id="route_alpha", success=True, realized_effort=5.0, realized_noise=0.2, detected=False),
        TrialRecord(trial_id=3, route_id="route_alpha", success=False, realized_effort=5.0, realized_noise=0.2, detected=False),
        TrialRecord(trial_id=4, route_id="route_beta", success=True, realized_effort=10.0, realized_noise=0.4, detected=False),
    )

    walk_res = WalkResult(
        twin_id="twin-test",
        agent_id="agent-test",
        target="B",
        n=4,
        seed=1,
        candidate_routes=(r1, r2),
        trials=trials,
    )
    res = compute_results(walk_res)

    assert len(res.top_routes) == 2
    stat_alpha = next(r for r in res.top_routes if r.route_id == "route_alpha")
    stat_beta = next(r for r in res.top_routes if r.route_id == "route_beta")

    # p_select preservation
    assert stat_alpha.p_select == 0.75
    assert stat_alpha.selection_prob == 0.75
    assert stat_beta.p_select == 0.25
    assert stat_beta.selection_prob == 0.25

    # Observed frequencies: 3/4 = 0.75 and 1/4 = 0.25
    assert stat_alpha.observed_frequency == 0.75
    assert stat_alpha.observed_freq == 0.75
    assert stat_beta.observed_frequency == 0.25
    assert stat_beta.observed_freq == 0.25

    # Trial and success counts
    assert stat_alpha.trial_count == 3
    assert stat_alpha.success_count == 2
    assert stat_beta.trial_count == 1
    assert stat_beta.success_count == 1

    # Aliases
    assert res.candidate_routes == res.top_routes
    assert res.top_k_routes == res.top_routes
    assert res.exemplar_paths == res.top_routes


# =====================================================================
# 7. Weighted Risk Calculation
# =====================================================================

def test_weighted_risk_formula():
    """Verify weighted_risk = target_criticality * sum(p_select * p_route)."""
    e1 = make_dummy_edge("A", "B", "t1")
    p1 = make_dummy_path("r1", (e1,))
    p2 = make_dummy_path("r2", (e1,))

    r1 = RouteStat(route_id="r1", p_select=0.6, observed_frequency=0.6, p_route=0.8, effort_score=2.0)
    r2 = RouteStat(route_id="r2", p_select=0.4, observed_frequency=0.4, p_route=0.5, effort_score=4.0)

    # sum(p_select * p_route) = 0.6 * 0.8 + 0.4 * 0.5 = 0.48 + 0.20 = 0.68
    # target_criticality = 5 -> 5 * 0.68 = 3.40
    risk = compute_weighted_risk((r1, r2), target_criticality=5)
    assert abs(risk - 3.40) < 1e-5


def test_weighted_risk_from_twin():
    """Verify target_criticality is extracted from Twin target asset if available."""
    twin = Twin(
        id="t1",
        assets=(
            Asset(id="web", name="Web", kind="server", zone="dmz", criticality=2),
            Asset(id="db", name="DB", kind="database", zone="prod", criticality=5, crown_jewel=True),
        ),
        identities=(),
        edges=(),
        flows=(),
        controls=(),
    )
    e1 = make_dummy_edge("web", "db", "t1")
    p1 = make_dummy_path("r1", (e1,))
    r1 = EvaluatedRoute(
        route_id="r1", path=p1, p_edge_eff=(0.8,), p_route=0.8, effort_score=2.0, noise=0.1, utility=0.4, selection_weight=1.0, selection_prob=1.0
    )
    walk_res = WalkResult(twin_id="t1", agent_id="a1", target="db", n=1, candidate_routes=(r1,), trials=())
    res = compute_results(walk_res, twin=twin)

    # target is 'db' with criticality 5 -> 5 * (1.0 * 0.8) = 4.0
    assert abs(res.weighted_risk - 4.0) < 1e-5


# =====================================================================
# 8. Delta Calculations & Less Than 20 Successes Behavior
# =====================================================================

def test_delta_calculations():
    """Verify diff produces correct Delta metrics."""
    # Before: 10 paths, mean effort 20.0, 50 successes, p_success 0.8
    before = Result(
        twin_id="t_before",
        n=100,
        p_success=0.8,
        mean_effort=20.0,
        success_count=50,
        top_routes=(
            RouteStat(route_id="r_old", p_select=0.5, observed_frequency=0.5),
            RouteStat(route_id="r_shared", p_select=0.5, observed_frequency=0.5),
        ),
        naive_path_count=10,
    )

    # After: 2 paths, mean effort 30.0, 30 successes, p_success 0.4
    after = Result(
        twin_id="t_after",
        n=100,
        p_success=0.4,
        mean_effort=30.0,
        success_count=30,
        top_routes=(
            RouteStat(route_id="r_shared", p_select=0.5, observed_frequency=0.5),
            RouteStat(route_id="r_new", p_select=0.5, observed_frequency=0.5),
        ),
        naive_path_count=2,
    )

    d = diff(before, after)

    # Naive path reduction: (10 - 2) / 10 * 100 = 80.0%
    assert d.naive_path_reduction_pct == 80.0

    # Effort increase: (30 - 20) / 20 * 100 = 50.0%
    assert d.effort_increase_pct == 50.0

    # Route elimination and substitution
    assert d.route_eliminated == ("r_old",)
    assert d.routes_eliminated == ("r_old",)
    assert d.substituted_paths == ("r_new",)

    # p_success delta: 0.4 - 0.8 = -0.4
    assert abs(d.p_success_delta - (-0.4)) < 1e-5
    assert abs(d.p_success_reduction - 0.4) < 1e-5


def test_fewer_than_20_successes_returns_none():
    """Verify effort_increase_pct is None when either before or after has < 20 successes."""
    # Case A: after has only 15 successes (< 20)
    res_before_50 = Result(mean_effort=10.0, success_count=50)
    res_after_15 = Result(mean_effort=20.0, success_count=15)
    delta_a = diff(res_before_50, res_after_15)
    assert delta_a.effort_increase_pct is None

    # Case B: before has only 10 successes (< 20)
    res_before_10 = Result(mean_effort=10.0, success_count=10)
    res_after_50 = Result(mean_effort=20.0, success_count=50)
    delta_b = diff(res_before_10, res_after_50)
    assert delta_b.effort_increase_pct is None

    # Case C: both have >= 20 successes (e.g. 20 and 20)
    res_before_20 = Result(mean_effort=10.0, success_count=20)
    res_after_20 = Result(mean_effort=25.0, success_count=20)
    delta_c = diff(res_before_20, res_after_20)
    assert delta_c.effort_increase_pct == 150.0


# =====================================================================
# 9. Determinism and Reproducibility
# =====================================================================

def test_results_and_diff_determinism():
    """Verify exact bit-for-bit reproducibility of Result and Delta calculations."""
    e1 = make_dummy_edge("A", "B", "t1")
    trials = tuple(
        TrialRecord(trial_id=i, route_id="r1", success=(i % 2 == 0), realized_effort=float(i * 5), realized_noise=0.1, detected=False, edges_executed=(e1,))
        for i in range(1, 21)
    )
    walk_res = WalkResult(twin_id="det-twin", agent_id="det-agent", n=20, trials=trials)

    res1 = compute_results(walk_res)
    res2 = compute_results(walk_res)

    assert res1 == res2
    assert res1.wilson_ci == res2.wilson_ci
    assert res1.mean_effort == res2.mean_effort
    assert res1.p90_effort == res2.p90_effort
    assert res1.effort_distribution == res2.effort_distribution

    d1 = diff(res1, res2)
    d2 = diff(res1, res2)
    assert d1 == d2


# =====================================================================
# 10. FinBank Scenario Integration
# =====================================================================

def test_finbank_golden_scenario_analytics(golden_twin: Twin, privileged_agent: Agent):
    """Verify complete Phase 5 analytics pipeline against the official FinBank golden scenario."""
    # 1. Run simulation using Phase 4 simulate
    walk_res = simulate(golden_twin, privileged_agent, n=50, seed=42)
    assert walk_res.n == 50
    assert len(walk_res.trials) == 50

    # 2. Compute Phase 5 results
    res = compute_results(walk_res, twin=golden_twin)

    # 3. Assert statistical metrics
    assert 0.0 <= res.p_success <= 1.0
    lower, upper = res.wilson_ci
    assert 0.0 <= lower <= res.p_success <= upper <= 1.0

    if res.success_count > 0:
        assert res.mean_effort > 0.0
        assert res.p90_effort >= res.mean_effort or len(res.effort_distribution) > 0
        assert sum(res.effort_distribution.values()) == res.success_count

    assert len(res.top_routes) > 0
    for r in res.top_routes:
        assert 0.0 <= r.p_select <= 1.0
        assert 0.0 <= r.observed_frequency <= 1.0

    # Criticality of prod-db in FinBank is 5 -> weighted_risk must be positive
    assert res.weighted_risk > 0.0

    # Edge frequencies must contain edges in the attack path to prod-db
    assert len(res.edge_frequency) > 0

    # 4. Clone twin with an added control and test diff
    blocked_edge = golden_twin.edges[0]  # internet -> web-dmz
    twin_modified = clone(golden_twin, remove_edges=(blocked_edge,))
    walk_mod = simulate(twin_modified, privileged_agent, n=50, seed=42)
    res_mod = compute_results(walk_mod, twin=twin_modified)

    delta = diff(res, res_mod)
    assert isinstance(delta, Delta)
    assert delta.p_success_delta <= 0.0  # Removing an edge cannot increase attacker success
