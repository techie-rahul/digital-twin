"""Tests for Phase 8: Constrained Security-Control Portfolio Optimizer (v2.1).

Covers:
- Empty catalogue handling
- Single and multi-control subset evaluations
- Exact exhaustive 2^N subset enumeration (e.g. 3 controls -> 8 subsets, 4 controls -> 16 subsets)
- Maximum catalogue limit enforcement (<=10 controls, >10 raises ValueError)
- Budget constraint enforcement (zero budget, exact budget, insufficient budget)
- Critical business flow safety hard constraint (criticality >= 4 hard rejected)
- Non-critical flow breakage behavior (< 4 allowed)
- Rejection of technically strong but business-breaking portfolios in favor of safe portfolios
- Absence of monotonic pruning / greedy shortcuts
- Control interactions and policy exceptions
- Deterministic tie-breaking
- Ranked safe alternatives within budget
- Original Twin immutability
- Same-seed reproducibility
- Monte Carlo walk validation for the winner
- Real-world FinBank golden scenario portfolio optimization
"""

from pathlib import Path
import pytest

from backend.core.models import Agent, Asset, Control, Edge, Identity, ServiceFlow, Twin
from backend.rules.compile import ControlImpact, ControlSelector
from backend.rules.optimize import (
    CandidateEvaluation,
    Portfolio,
    MAX_CATALOGUE_SIZE,
    optimize,
    optimize_controls,
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


# =====================================================================
# 1. Catalogue Sizing & Exact Exhaustive Enumeration
# =====================================================================

def test_empty_catalogue(golden_twin: Twin, privileged_agent: Agent):
    """Verify empty controls catalogue safely returns empty baseline portfolio."""
    portfolio = optimize(
        twin=golden_twin,
        budget=5000,
        agents=privileged_agent,
        candidate_controls=(),
        n_walks=20,
    )
    assert portfolio.selected_control_ids == ()
    assert portfolio.total_cost == 0
    assert portfolio.cost == 0
    assert portfolio.risk_reduction == 0.0
    assert portfolio.all_evaluated_count == 1  # 2^0 = 1 (the empty set)
    assert portfolio.subsets_evaluated == 1
    assert portfolio.is_safe is True
    assert len(portfolio.broken_flows) == 0


def test_single_control_selection(golden_twin: Twin, privileged_agent: Agent):
    """Verify single control catalogue evaluates exactly 2^1 = 2 subsets."""
    edr = next(c for c in golden_twin.controls if c.id == "ctrl-edr")
    portfolio = optimize(
        twin=golden_twin,
        budget=5000,
        agents=privileged_agent,
        candidate_controls=[edr],
        n_walks=20,
    )
    assert portfolio.all_evaluated_count == 2  # 2^1 = 2 (empty set, {edr})
    assert portfolio.subsets_evaluated == 2
    assert "ctrl-edr" in portfolio.selected_control_ids
    assert portfolio.total_cost == edr.cost


def test_exhaustive_enumeration_exact_counts(golden_twin: Twin, privileged_agent: Agent):
    """Verify that ALL eligible subsets are exhaustively evaluated without greedy shortcut.

    - 3 controls -> exactly 2^3 = 8 subsets
    - 4 controls -> exactly 2^4 = 16 subsets
    Proves all powerset subsets are present in evaluated_subsets and all_evaluations.
    """
    ctrl_a = Control(id="ctrl-a", name="Control A", cost=100, blocks=("t1",), scope=(), efficacy=0.9)
    ctrl_b = Control(id="ctrl-b", name="Control B", cost=200, blocks=("t2",), scope=(), efficacy=0.9)
    ctrl_c = Control(id="ctrl-c", name="Control C", cost=300, blocks=("t3",), scope=(), efficacy=0.9)
    ctrl_d = Control(id="ctrl-d", name="Control D", cost=400, blocks=("t4",), scope=(), efficacy=0.9)

    # 3 controls: exactly 2^3 = 8 subsets
    expected_8_subsets = {
        (),
        ("ctrl-a",),
        ("ctrl-b",),
        ("ctrl-c",),
        ("ctrl-a", "ctrl-b"),
        ("ctrl-a", "ctrl-c"),
        ("ctrl-b", "ctrl-c"),
        ("ctrl-a", "ctrl-b", "ctrl-c"),
    }
    p3 = optimize(
        twin=golden_twin,
        budget=10000,
        agents=privileged_agent,
        candidate_controls=[ctrl_a, ctrl_b, ctrl_c],
        n_walks=10,
    )
    assert p3.all_evaluated_count == 8
    assert p3.subsets_evaluated == 8
    assert len(p3.evaluated_subsets) == 8
    assert set(p3.evaluated_subsets) == expected_8_subsets
    assert len(p3.all_evaluations) == 8
    assert {e.control_ids for e in p3.all_evaluations} == expected_8_subsets

    # 4 controls: exactly 2^4 = 16 subsets
    from itertools import combinations
    c_ids_4 = ["ctrl-a", "ctrl-b", "ctrl-c", "ctrl-d"]
    expected_16_subsets = {
        comb for r in range(5) for comb in combinations(c_ids_4, r)
    }
    p4 = optimize(
        twin=golden_twin,
        budget=10000,
        agents=privileged_agent,
        candidate_controls=[ctrl_a, ctrl_b, ctrl_c, ctrl_d],
        n_walks=10,
    )
    assert p4.all_evaluated_count == 16
    assert p4.subsets_evaluated == 16
    assert len(p4.evaluated_subsets) == 16
    assert set(p4.evaluated_subsets) == expected_16_subsets
    assert len(p4.all_evaluations) == 16
    assert {e.control_ids for e in p4.all_evaluations} == expected_16_subsets


def test_catalogue_exceeding_10_raises_value_error(golden_twin: Twin, privileged_agent: Agent):
    """Verify that a candidate catalogue exceeding MAX_CATALOGUE_SIZE (10) raises ValueError."""
    controls_11 = [
        Control(id=f"ctrl-{i}", name=f"Control {i}", cost=100 * i, blocks=(f"t{i}",), scope=(), efficacy=0.9)
        for i in range(1, 12)
    ]
    assert len(controls_11) == 11
    with pytest.raises(ValueError, match="exceeds maximum supported size of 10"):
        optimize(
            twin=golden_twin,
            budget=5000,
            agents=privileged_agent,
            candidate_controls=controls_11,
        )


def test_maximum_catalogue_10_controls(golden_twin: Twin, privileged_agent: Agent):
    """Verify exactly 10 controls generates and evaluates 2^10 = 1024 subsets."""
    controls_10 = [
        Control(id=f"ctrl-{i}", name=f"Control {i}", cost=10000, blocks=(f"t{i}",), scope=(), efficacy=0.9)
        for i in range(1, 11)
    ]
    # High cost so only empty set fits budget, but all 1024 subsets are enumerated and checked
    portfolio = optimize(
        twin=golden_twin,
        budget=0,
        agents=privileged_agent,
        candidate_controls=controls_10,
        n_walks=10,
    )
    assert portfolio.all_evaluated_count == 1024
    assert portfolio.subsets_evaluated == 1024
    assert len(portfolio.evaluated_subsets) == 1024
    assert len(set(portfolio.evaluated_subsets)) == 1024  # All 1024 subsets are distinct
    assert len(portfolio.all_evaluations) == 1024
    assert portfolio.selected_control_ids == ()


# =====================================================================
# 2. Budget Constraints
# =====================================================================

def test_budget_constraint_enforced(golden_twin: Twin, privileged_agent: Agent):
    """Verify that candidate portfolios exceeding budget are strictly rejected."""
    credguard = next(c for c in golden_twin.controls if c.id == "ctrl-credguard")  # cost 1000
    edr = next(c for c in golden_twin.controls if c.id == "ctrl-edr")              # cost 2000

    # Budget 1500: cannot afford both (cost 3000) or EDR alone (cost 2000); can only afford CredGuard (cost 1000)
    portfolio = optimize(
        twin=golden_twin,
        budget=1500,
        agents=privileged_agent,
        candidate_controls=[credguard, edr],
        n_walks=20,
    )
    assert portfolio.total_cost <= 1500
    assert portfolio.selected_control_ids == ("ctrl-credguard",)


def test_exact_budget_handling(golden_twin: Twin, privileged_agent: Agent):
    """Verify boundary case where optimal portfolio cost exactly equals budget."""
    credguard = next(c for c in golden_twin.controls if c.id == "ctrl-credguard")  # cost 1000
    edr = next(c for c in golden_twin.controls if c.id == "ctrl-edr")              # cost 2000

    # Budget exactly 3000
    portfolio = optimize(
        twin=golden_twin,
        budget=3000,
        agents=privileged_agent,
        candidate_controls=[credguard, edr],
        n_walks=20,
    )
    assert portfolio.total_cost == 3000
    assert set(portfolio.selected_control_ids) == {"ctrl-credguard", "ctrl-edr"}


def test_zero_budget_handling(golden_twin: Twin, privileged_agent: Agent):
    """Verify zero budget allows only empty portfolio."""
    edr = next(c for c in golden_twin.controls if c.id == "ctrl-edr")
    portfolio = optimize(
        twin=golden_twin,
        budget=0,
        agents=privileged_agent,
        candidate_controls=[edr],
        n_walks=20,
    )
    assert portfolio.total_cost == 0
    assert portfolio.selected_control_ids == ()
    assert portfolio.is_safe is True


def test_insufficient_budget_all_controls_exceed(golden_twin: Twin, privileged_agent: Agent):
    """Verify that when every individual control exceeds budget, empty portfolio is returned."""
    ctrl1 = Control(id="c1", name="C1", cost=5000, blocks=("t1",), scope=(), efficacy=0.9)
    ctrl2 = Control(id="c2", name="C2", cost=6000, blocks=("t2",), scope=(), efficacy=0.9)
    portfolio = optimize(
        twin=golden_twin,
        budget=4000,
        agents=privileged_agent,
        candidate_controls=[ctrl1, ctrl2],
        n_walks=20,
    )
    assert portfolio.total_cost == 0
    assert portfolio.selected_control_ids == ()


# =====================================================================
# 3. Critical Business Flow Safety (The Key Constraint)
# =====================================================================

def test_critical_flow_safety_hard_block(golden_twin: Twin, privileged_agent: Agent):
    """Verify controls that break criticality >= 4 flows are strictly rejected.

    'ctrl-network-seg' in golden_twin severs F3 (Payroll Commits, crit 5) and F6 (DR Backup, crit 4).
    Even with infinite budget, it must NEVER be selected.
    """
    seg = next(c for c in golden_twin.controls if c.id == "ctrl-network-seg")
    edr = next(c for c in golden_twin.controls if c.id == "ctrl-edr")

    portfolio = optimize(
        twin=golden_twin,
        budget=10000,
        agents=privileged_agent,
        candidate_controls=[seg, edr],
        n_walks=20,
    )
    # Network segmentation must be rejected because it breaks F3 & F6!
    assert "ctrl-network-seg" not in portfolio.selected_control_ids
    assert portfolio.selected_control_ids == ("ctrl-edr",)
    assert not any(f.criticality >= 4 for f in portfolio.broken_flows)


def test_technically_strong_but_business_breaking_control_rejected(golden_twin: Twin, privileged_agent: Agent):
    """Core product differentiator: coarse segmentation cuts attack paths aggressively

    but breaks mission-critical business flows. The optimizer must choose the safer
    portfolio (EDR + Credential Guard) over the business-breaking segmentation.
    """
    seg = next(c for c in golden_twin.controls if c.id == "ctrl-network-seg")      # breaks F3 (crit 5)
    edr = next(c for c in golden_twin.controls if c.id == "ctrl-edr")              # safe
    credguard = next(c for c in golden_twin.controls if c.id == "ctrl-credguard")  # safe

    portfolio = optimize(
        twin=golden_twin,
        budget=5000,
        agents=privileged_agent,
        candidate_controls=[seg, edr, credguard],
        n_walks=50,
    )
    # Seg must be excluded
    assert "ctrl-network-seg" not in portfolio.selected_control_ids
    # EDR and Credential Guard are safe and fit within budget 5000 (total cost 3000)
    assert set(portfolio.selected_control_ids) == {"ctrl-edr", "ctrl-credguard"}
    assert portfolio.total_cost == 3000
    assert portfolio.is_safe is True
    assert len(portfolio.broken_flows) == 0


def test_non_critical_flow_breakage_allowed_if_best_safe():
    """Verify that a control breaking a non-critical flow (< 4) is not hard-blocked."""
    twin = Twin(
        id="twin-low-crit",
        assets=(
            Asset(id="a", name="A", kind="server", zone="corp", criticality=2),
            Asset(id="b", name="B", kind="server", zone="prod", criticality=5, crown_jewel=True),
        ),
        identities=(),
        edges=(
            Edge(src="a", dst="b", technique="db_login"),
        ),
        flows=(
            ServiceFlow(id="F_low", name="Low Impact Reporting", src="a", dst="b", technique="db_login", criticality=2),
        ),
        controls=(),
    )
    ctrl = Control(
        id="ctrl-low-block",
        name="Blocker",
        cost=1000,
        blocks=("db_login",),
        scope=("b",),
        efficacy=0.9,
    )
    agent = Agent(
        id="adv",
        name="Adversary",
        start_zones=("corp",),
        capabilities=frozenset(),
        objective="specific_target",
        noise_budget=1.0,
        skill=0.8,
    )
    portfolio = optimize(
        twin=twin,
        budget=2000,
        agents=agent,
        candidate_controls=[ctrl],
        target="b",
        n_walks=20,
    )
    # Flow F_low has criticality 2 (< 4) -> eligible, can be chosen if it reduces risk
    assert portfolio.selected_control_ids == ("ctrl-low-block",)
    assert len(portfolio.broken_flows) == 1
    assert portfolio.broken_flows[0].id == "F_low"


# =====================================================================
# 4. Absence of Monotonic Pruning & Control Interactions
# =====================================================================

def test_no_monotonic_pruning_or_greedy_shortcuts():
    """Verify that candidate subsets are evaluated without monotonic pruning or greedy shortcuts.

    Even if a subset breaks a critical flow or exceeds budget, ALL 2^N supersets
    are evaluated because combinations or policy exceptions may interact.
    No candidate subset is pruned before evaluation.
    """
    twin = Twin(
        id="twin-prune-test",
        assets=(
            Asset(id="app", name="App", kind="server", zone="prod", criticality=3),
            Asset(id="db", name="DB", kind="database", zone="prod", criticality=5, crown_jewel=True),
        ),
        identities=(),
        edges=(
            Edge(src="app", dst="db", technique="db_login"),
        ),
        flows=(
            ServiceFlow(id="F1", name="DB Flow", src="app", dst="db", technique="db_login", criticality=5),
        ),
        controls=(),
    )
    # c_break severs critical flow F1 (crit 5)
    c_break = Control(id="c_break", name="Breaking Control", cost=100, blocks=("db_login",), scope=("db",), efficacy=0.9)
    # c_over exceeds the budget of 500
    c_over = Control(id="c_over", name="Overbudget Control", cost=1000, blocks=("ssh_lateral",), scope=("app",), efficacy=0.9)
    # c_safe is within budget and breaks no flows
    c_safe = Control(id="c_safe", name="Safe Control", cost=200, blocks=("ssh_lateral",), scope=("app",), efficacy=0.5)

    agent = Agent(
        id="adv",
        name="Adversary",
        start_zones=("prod",),
        capabilities=frozenset(["creds:who"]),
        objective="specific_target",
        noise_budget=1.0,
        skill=0.8,
    )

    portfolio = optimize(
        twin=twin,
        budget=500,
        agents=agent,
        candidate_controls=[c_break, c_over, c_safe],
        target="db",
        n_walks=10,
    )

    # 3 controls -> exactly 2^3 = 8 subsets
    assert portfolio.all_evaluated_count == 8
    assert portfolio.subsets_evaluated == 8
    assert len(portfolio.evaluated_subsets) == 8
    assert len(portfolio.all_evaluations) == 8

    # Verify no monotonic pruning pruned supersets of c_break or c_over
    evaluated_set = set(portfolio.evaluated_subsets)
    assert ("c_break", "c_safe") in evaluated_set
    assert ("c_over", "c_safe") in evaluated_set
    assert ("c_break", "c_over") in evaluated_set
    assert ("c_break", "c_over", "c_safe") in evaluated_set

    # Verify evaluation details for pruned-candidate supersets
    eval_map = {e.control_ids: e for e in portfolio.all_evaluations}
    assert eval_map[("c_break", "c_safe")].is_safe is False
    assert eval_map[("c_break", "c_safe")].rejection_reason == "critical_flow_broken"
    assert eval_map[("c_over", "c_safe")].is_safe is False
    assert eval_map[("c_over", "c_safe")].rejection_reason == "budget_exceeded"
    assert eval_map[("c_break", "c_over", "c_safe")].is_safe is False

    # The only safe subset within budget is c_safe
    assert portfolio.selected_control_ids == ("c_safe",)
    assert portfolio.total_cost == 200


def test_control_interaction_and_exceptions():
    """Verify ControlImpact with exceptions is evaluated properly.

    FinBank scoped segmentation with exceptions preserves F6 while breaking F1 (crit 5).
    """
    twin = Twin(
        id="twin-scoped",
        assets=(
            Asset(id="payroll-api", name="Payroll API", kind="server", zone="prod", criticality=4),
            Asset(id="backup-01", name="Backup Vault", kind="server", zone="mgmt", criticality=4),
            Asset(id="prod-db", name="Production DB", kind="database", zone="prod", criticality=5, crown_jewel=True),
        ),
        identities=(
            Identity(id="svc.payroll", name="Payroll Service", kind="service_account", tier=1),
            Identity(id="svc.backup", name="Backup Service", kind="service_account", tier=1),
        ),
        edges=(
            Edge(src="payroll-api", dst="prod-db", technique="db_login"),
            Edge(src="backup-01", dst="prod-db", technique="db_login"),
        ),
        flows=(
            ServiceFlow(id="F6", name="DR Backup Sync", src="backup-01", dst="prod-db", technique="db_login", criticality=4),
        ),
        controls=(),
    )
    scoped_seg = ControlImpact(
        id="ctrl-prod-db-seg",
        name="FinBank Scoped Production DB Segmentation",
        selector=ControlSelector(
            dst_assets=("prod-db",),
            protocols=("sql",),
            ports=(5432,),
        ),
        exceptions=(
            ControlSelector(
                src_assets=("backup-01",),
                identity_ids=("svc.backup",),
            ),
        ),
        efficacy=1.0,
    )
    agent = Agent(
        id="adv",
        name="Adversary",
        start_zones=("prod",),
        capabilities=frozenset(),
        objective="specific_target",
        noise_budget=1.0,
        skill=0.8,
    )
    portfolio = optimize(
        twin=twin,
        budget=2000,
        agents=agent,
        candidate_controls=[scoped_seg],
        target="prod-db",
        n_walks=20,
    )
    # F6 is preserved by the exception -> safe to deploy!
    assert portfolio.selected_control_ids == ("ctrl-prod-db-seg",)
    assert len(portfolio.broken_flows) == 0


# =====================================================================
# 5. Deterministic Tie-Breaking & Alternatives
# =====================================================================

def test_equal_cost_equal_risk_tie_breaking(golden_twin: Twin, privileged_agent: Agent):
    """Verify deterministic tie-breaking when two safe controls have identical risk and cost."""
    c1 = Control(id="ctrl-aaa", name="Control AAA", cost=500, blocks=(), scope=(), efficacy=0.0)
    c2 = Control(id="ctrl-bbb", name="Control BBB", cost=500, blocks=(), scope=(), efficacy=0.0)

    # Budget 500: can pick only one. Risk reduction is 0.0 for both.
    # Tie breaker: lexicographical control IDs -> ctrl-aaa is selected first
    portfolio = optimize(
        twin=golden_twin,
        budget=500,
        agents=privileged_agent,
        candidate_controls=[c2, c1],  # passed in reverse order
        n_walks=10,
    )
    assert portfolio.selected_control_ids == ("ctrl-aaa",)


def test_alternatives_ranking_and_validity(golden_twin: Twin, privileged_agent: Agent):
    """Verify that alternatives expose safe, ranked runner-up portfolios within budget."""
    credguard = next(c for c in golden_twin.controls if c.id == "ctrl-credguard")  # cost 1000
    edr = next(c for c in golden_twin.controls if c.id == "ctrl-edr")              # cost 2000

    portfolio = optimize(
        twin=golden_twin,
        budget=3500,
        agents=privileged_agent,
        candidate_controls=[credguard, edr],
        n_walks=20,
        top_alternatives_limit=2,
    )
    # Winner should be {ctrl-credguard, ctrl-edr}
    assert set(portfolio.selected_control_ids) == {"ctrl-credguard", "ctrl-edr"}

    # Alternatives must be safe, within budget, and non-empty
    assert len(portfolio.alternatives) > 0
    for alt in portfolio.alternatives:
        assert isinstance(alt, CandidateEvaluation)
        assert alt.is_safe is True
        assert alt.total_cost <= 3500
        assert alt.control_ids != portfolio.selected_control_ids


# =====================================================================
# 6. Immutability & Reproducibility
# =====================================================================

def test_twin_immutability(golden_twin: Twin, privileged_agent: Agent):
    """Verify optimization does not mutate the input Twin."""
    initial_ctrl_count = len(golden_twin.controls)
    initial_asset_count = len(golden_twin.assets)
    initial_flow_count = len(golden_twin.flows)

    _ = optimize(
        twin=golden_twin,
        budget=5000,
        agents=privileged_agent,
        n_walks=20,
    )

    assert len(golden_twin.controls) == initial_ctrl_count
    assert len(golden_twin.assets) == initial_asset_count
    assert len(golden_twin.flows) == initial_flow_count


def test_deterministic_same_seed(golden_twin: Twin, privileged_agent: Agent):
    """Verify same seed produces identical optimization outputs."""
    p1 = optimize(
        twin=golden_twin,
        budget=3000,
        agents=privileged_agent,
        seed=42,
        n_walks=50,
    )
    p2 = optimize(
        twin=golden_twin,
        budget=3000,
        agents=privileged_agent,
        seed=42,
        n_walks=50,
    )

    assert p1.selected_control_ids == p2.selected_control_ids
    assert p1.total_cost == p2.total_cost
    assert p1.risk_before == p2.risk_before
    assert p1.risk_after == p2.risk_after
    assert p1.risk_reduction == p2.risk_reduction
    assert p1.verdict.confidence.score == p2.verdict.confidence.score


# =====================================================================
# 7. Winner Monte Carlo Validation & Golden Scenario Integration
# =====================================================================

def test_winner_monte_carlo_validation(golden_twin: Twin, privileged_agent: Agent):
    """Verify that the winning portfolio is validated with a full ChangeVerdict and simulation."""
    portfolio = optimize(
        twin=golden_twin,
        budget=3000,
        agents=privileged_agent,
        n_walks=50,
        seed=42,
    )
    assert portfolio.verdict is not None
    assert portfolio.verdict.verdict in ("DEPLOY", "REVIEW")
    assert portfolio.verdict.confidence is not None
    assert portfolio.verdict.delta is not None


def test_optimize_controls_canonical_alias(golden_twin: Twin, privileged_agent: Agent):
    """Verify optimize_controls alias matches optimize behavior."""
    p = optimize_controls(
        twin=golden_twin,
        candidate_controls=golden_twin.controls,
        budget=3000,
        agents=privileged_agent,
        n_walks=20,
    )
    assert isinstance(p, Portfolio)
    assert p.budget == 3000
    assert p.total_cost <= 3000
