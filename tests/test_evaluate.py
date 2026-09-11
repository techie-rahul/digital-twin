"""Tests for Phase 6: Control Evaluation and ChangeVerdict Decision Engine (v2.1).

Covers:
- Broken flow detection against twin ServiceFlow dependencies
- Exact v2.1 MFA diagnostic message for service identities:
  'this interactive MFA policy is incompatible with these non-interactive service identities'
- Non-disruptive controls (EDR, Credential Guard) producing zero broken flows
- Verdict decision logic:
  - BLOCK when broken flow has criticality >= 4
  - REVIEW when broken flow has criticality < 4, low confidence, or negligible gain
  - DEPLOY when zero broken flows and significant security reduction
- Statistical confidence score and categorical levels (HIGH, MEDIUM, LOW)
- Decision explainability: reasons, assumptions, unknowns, and alternatives
- Determinism and reproducibility
- Integration with FinBank golden scenario
- Edge cases: empty controls, zero walks, agent string resolution, serialization
"""

from pathlib import Path
import json
import pytest

from backend.core.models import Agent, Asset, Control, Edge, Identity, ServiceFlow, Twin
from backend.core.twin import clone
from backend.rules.compile import ControlImpact, ControlSelector
from backend.rules.evaluate import (
    ChangeVerdict,
    Confidence,
    FlowBreakageDetail,
    detect_broken_flows,
    compute_confidence,
    evaluate_change,
    EXACT_MFA_SERVICE_IDENTITY_MSG,
    EVIDENCE_WEIGHTS,
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
# 1. Broken Flow Detection Tests
# =====================================================================

def test_network_segmentation_breaks_critical_flows(golden_twin: Twin):
    """Verify that coarse network segmentation on prod-db breaks critical payment flow F3."""
    seg_ctrl = next(c for c in golden_twin.controls if c.id == "ctrl-network-seg")
    broken_flows, details = detect_broken_flows(golden_twin, [seg_ctrl])

    broken_ids = {f.id for f in broken_flows}
    assert "F3" in broken_ids  # Payroll Transaction Ledger Commits (crit 5)
    assert "F6" in broken_ids  # Disaster Recovery Backup Sync (crit 4)

    # Check detail diagnostics
    f3_detail = next(d for d in details if d.flow_id == "F3")
    assert f3_detail.criticality == 5
    assert "segmentation" in f3_detail.reason.lower() or "blocked" in f3_detail.reason.lower()


def test_mfa_diagnostic_exact_service_identity_wording(golden_twin: Twin):
    """Verify exact v2.1 wording when interactive MFA impacts non-interactive service identities."""
    mfa_ctrl = next(c for c in golden_twin.controls if c.id == "ctrl-mfa")
    broken_flows, details = detect_broken_flows(golden_twin, [mfa_ctrl])

    broken_ids = {f.id for f in broken_flows}
    assert "F2" in broken_ids  # Web Portal API Integration to payroll-api (crit 4)

    # Verify exact required phrasing
    f2_detail = next(d for d in details if d.flow_id == "F2")
    assert f2_detail.reason == EXACT_MFA_SERVICE_IDENTITY_MSG
    assert f2_detail.reason == "this interactive MFA policy is incompatible with these non-interactive service identities"


def test_edr_and_credguard_produce_zero_broken_flows(golden_twin: Twin):
    """Verify that host-level EDR and Credential Guard do not sever business flows."""
    edr_ctrl = next(c for c in golden_twin.controls if c.id == "ctrl-edr")
    credguard_ctrl = next(c for c in golden_twin.controls if c.id == "ctrl-credguard")

    broken_edr, details_edr = detect_broken_flows(golden_twin, [edr_ctrl])
    assert len(broken_edr) == 0
    assert len(details_edr) == 0

    broken_cg, details_cg = detect_broken_flows(golden_twin, [credguard_ctrl])
    assert len(broken_cg) == 0
    assert len(details_cg) == 0


# =====================================================================
# 2. Verdict Decision Logic Tests (BLOCK / REVIEW / DEPLOY)
# =====================================================================

def test_verdict_block_on_critical_flow_breakage(golden_twin: Twin, privileged_agent: Agent):
    """Verify that evaluate_change returns BLOCK when a flow with criticality >= 4 is broken."""
    verdict = evaluate_change(
        twin=golden_twin,
        controls=["ctrl-network-seg"],
        agents=privileged_agent,
        n_walks=100,
        seed=42,
    )

    assert isinstance(verdict, ChangeVerdict)
    assert verdict.verdict == "BLOCK"
    assert verdict.recommendation in ("BLOCK", "blocked")
    assert any(f.criticality >= 4 for f in verdict.broken_flows)
    assert len(verdict.reasons) > 0
    assert any("CRITICAL" in r for r in verdict.reasons)
    assert len(verdict.alternatives) > 0


def test_verdict_block_on_mfa_service_identity_breakage(golden_twin: Twin, privileged_agent: Agent):
    """Verify that evaluate_change returns BLOCK and explains interactive MFA incompatibility."""
    verdict = evaluate_change(
        twin=golden_twin,
        controls=["ctrl-mfa"],
        agents=privileged_agent,
        n_walks=100,
        seed=42,
    )

    assert verdict.verdict == "BLOCK"
    assert any(EXACT_MFA_SERVICE_IDENTITY_MSG in d.reason for d in verdict.broken_flow_details)
    assert any("certificate-based" in alt.lower() or "managed service identities" in alt.lower() for alt in verdict.alternatives)


def test_verdict_deploy_on_safe_effective_control(golden_twin: Twin, privileged_agent: Agent):
    """Verify that evaluate_change returns DEPLOY when zero flows are broken and security improves."""
    verdict = evaluate_change(
        twin=golden_twin,
        controls=["ctrl-edr"],
        agents=privileged_agent,
        n_walks=100,
        seed=42,
    )

    assert isinstance(verdict, ChangeVerdict)
    assert len(verdict.broken_flows) == 0
    assert verdict.verdict in ("DEPLOY", "REVIEW")
    assert verdict.total_cost == 2000
    assert verdict.cost == 2000


def test_verdict_review_on_low_criticality_flow_breakage(golden_twin: Twin, privileged_agent: Agent):
    """Verify that evaluate_change returns REVIEW when only low-criticality flows (< 4) are severed."""
    custom_ctrl = Control(
        id="ctrl-block-ssh-ci",
        name="Block CI SSH Traffic",
        cost=500,
        blocks=("ssh_lateral", "T1021.004"),
        scope=("ci-runner",),
        efficacy=0.90,
    )

    verdict = evaluate_change(
        twin=golden_twin,
        controls=[custom_ctrl],
        agents=privileged_agent,
        n_walks=100,
        seed=42,
    )

    assert verdict.verdict == "REVIEW"
    assert len(verdict.broken_flows) > 0
    assert all(f.criticality < 4 for f in verdict.broken_flows)
    assert any("CAB sign-off" in r or "non-critical" in r for r in verdict.reasons)


def test_mixed_criticality_precedence(golden_twin: Twin, privileged_agent: Agent):
    """Verify BLOCK takes precedence if both high and low criticality flows are broken."""
    low_ctrl = Control(
        id="ctrl-low",
        name="Low Control",
        cost=100,
        blocks=("ssh_lateral",),
        scope=("ci-runner",),
        efficacy=0.9,
    )
    high_ctrl = next(c for c in golden_twin.controls if c.id == "ctrl-network-seg")

    verdict = evaluate_change(
        twin=golden_twin,
        controls=[low_ctrl, high_ctrl],
        agents=privileged_agent,
        n_walks=50,
        seed=42,
    )
    assert verdict.verdict == "BLOCK"
    assert any(f.criticality >= 4 for f in verdict.broken_flows)
    assert any(f.criticality < 4 for f in verdict.broken_flows)


# =====================================================================
# 3. Statistical Confidence & Determinism Tests
# =====================================================================

def test_confidence_calculation_and_levels(golden_twin: Twin, privileged_agent: Agent):
    """Verify confidence score computation and categorical level assignment."""
    v_high = evaluate_change(
        twin=golden_twin,
        controls=["ctrl-edr"],
        agents=privileged_agent,
        n_walks=500,
        seed=42,
    )
    assert 0.0 <= v_high.confidence <= 1.0
    assert v_high.confidence_level in ("HIGH", "MEDIUM")
    assert v_high.confidence_score == v_high.confidence

    v_low = evaluate_change(
        twin=golden_twin,
        controls=["ctrl-edr"],
        agents=privileged_agent,
        n_walks=5,
        seed=42,
    )
    assert 0.0 <= v_low.confidence <= 1.0


def test_evaluate_change_deterministic_reproducibility(golden_twin: Twin, privileged_agent: Agent):
    """Verify that identical inputs and seeds produce bit-identical ChangeVerdict outputs."""
    v1 = evaluate_change(
        twin=golden_twin,
        controls=["ctrl-network-seg"],
        agents=privileged_agent,
        n_walks=100,
        seed=1337,
    )
    v2 = evaluate_change(
        twin=golden_twin,
        controls=["ctrl-network-seg"],
        agents=privileged_agent,
        n_walks=100,
        seed=1337,
    )

    assert v1.verdict == v2.verdict
    assert v1.total_cost == v2.total_cost
    assert v1.confidence == v2.confidence
    assert v1.security_delta.p_success_delta == v2.security_delta.p_success_delta
    assert v1.security_delta.naive_path_reduction_pct == v2.security_delta.naive_path_reduction_pct
    assert len(v1.broken_flows) == len(v2.broken_flows)
    assert v1.reasons == v2.reasons


# =====================================================================
# 4. Context & Explainability Field Validations
# =====================================================================

def test_change_verdict_complete_contract(golden_twin: Twin, privileged_agent: Agent):
    """Verify that ChangeVerdict provides all required CAB payload fields."""
    verdict = evaluate_change(
        twin=golden_twin,
        controls=["ctrl-network-seg", "ctrl-mfa"],
        agents=privileged_agent,
        n_walks=50,
        seed=42,
    )

    assert verdict.twin_id == golden_twin.id
    assert len(verdict.controls_applied) == 2
    assert verdict.total_cost == 4000
    assert verdict.before_path_count > 0
    assert verdict.after_path_count >= 0
    assert isinstance(verdict.assumptions, tuple)
    assert len(verdict.assumptions) >= 3
    assert isinstance(verdict.unknowns, tuple)
    assert len(verdict.unknowns) >= 3
    assert isinstance(verdict.alternatives, tuple)
    assert len(verdict.alternatives) >= 1
    assert verdict.delta == verdict.security_delta
    assert verdict.cost == verdict.total_cost
    assert verdict.confidence_score == verdict.confidence


# =====================================================================
# 5. Robustness, Edge Cases & Serialization
# =====================================================================

def test_empty_controls_evaluation(golden_twin: Twin, privileged_agent: Agent):
    """Verify evaluating with empty controls operates safely."""
    verdict = evaluate_change(
        twin=golden_twin,
        controls=[],
        agents=privileged_agent,
        n_walks=50,
        seed=42,
    )
    assert verdict.total_cost == 0
    assert len(verdict.controls_applied) == 0
    assert len(verdict.broken_flows) == 0
    assert verdict.verdict in ("DEPLOY", "REVIEW")


def test_zero_simulation_walks_safety(golden_twin: Twin, privileged_agent: Agent):
    """Verify evaluation with n_walks=0 safely returns LOW confidence and zero probability."""
    verdict = evaluate_change(
        twin=golden_twin,
        controls=["ctrl-edr"],
        agents=privileged_agent,
        n_walks=0,
        seed=42,
    )
    assert verdict.confidence == 0.0
    assert verdict.confidence_level == "LOW"
    assert verdict.verdict == "REVIEW"


def test_agent_string_resolution(golden_twin: Twin):
    """Verify passing agent as string or default agent handles resolution."""
    verdict = evaluate_change(
        twin=golden_twin,
        controls=["ctrl-edr"],
        agents="adv-external",
        n_walks=50,
        seed=42,
    )
    assert isinstance(verdict, ChangeVerdict)
    assert verdict.twin_id == golden_twin.id


def test_unknown_control_ids_handled(golden_twin: Twin, privileged_agent: Agent):
    """Verify unknown control IDs generate safe placeholder controls."""
    verdict = evaluate_change(
        twin=golden_twin,
        controls=["ctrl-unknown-placeholder"],
        agents=privileged_agent,
        n_walks=50,
        seed=42,
    )
    assert len(verdict.controls_applied) == 1
    assert verdict.controls_applied[0].id == "ctrl-unknown-placeholder"


def test_change_verdict_pydantic_serialization(golden_twin: Twin, privileged_agent: Agent):
    """Verify ChangeVerdict can be serialized to dict and JSON without errors (FastAPI / Frontend ready)."""
    verdict = evaluate_change(
        twin=golden_twin,
        controls=["ctrl-network-seg"],
        agents=privileged_agent,
        n_walks=50,
        seed=42,
    )

    data_dict = verdict.model_dump()
    assert isinstance(data_dict, dict)
    assert data_dict["verdict"] == "BLOCK"
    assert data_dict["recommendation"] == "BLOCK"
    assert "broken_flows" in data_dict
    assert "security_delta" in data_dict

    json_str = verdict.model_dump_json()
    assert isinstance(json_str, str)
    parsed = json.loads(json_str)
    assert parsed["verdict"] == "BLOCK"
    assert parsed["total_cost"] == 2500


# =====================================================================
# 6. Audit Requirement Validations (v2.1 Contracts & Thresholds)
# =====================================================================

def test_canonical_evaluate_change_kwargs(golden_twin: Twin, privileged_agent: Agent):
    """Verify evaluate_change works with canonical parameter names: control_ids, agent_ids, seed, n."""
    verdict = evaluate_change(
        golden_twin,
        control_ids=("ctrl-edr",),
        agent_ids=(privileged_agent.id,),
        seed=1,
        n=50,
    )
    assert isinstance(verdict, ChangeVerdict)
    assert isinstance(verdict.confidence, Confidence)
    assert verdict.cost == 2000
    assert verdict.verdict in ("DEPLOY", "REVIEW")


def test_canonical_n_parameter_controls_walk_count(golden_twin: Twin):
    """Verify canonical n parameter controls simulation trials count."""
    verdict = evaluate_change(
        twin=golden_twin,
        control_ids=(),
        agent_ids=(),
        seed=1,
        n=77,
    )
    assert verdict.before_result.n == 77
    assert verdict.after_result.n == 77


def test_change_verdict_confidence_model_and_undetermined(golden_twin: Twin, privileged_agent: Agent):
    """Verify ChangeVerdict exposes frozen Confidence model and undetermined field matching v2.1 contract."""
    verdict = evaluate_change(
        golden_twin,
        control_ids=("ctrl-edr",),
        agent_ids=(privileged_agent.id,),
        seed=1,
        n=50,
    )
    assert isinstance(verdict.confidence, Confidence)
    assert verdict.confidence.level in ("High", "Medium", "Low")
    assert isinstance(verdict.confidence.score, float)
    assert isinstance(verdict.confidence.unknowns, tuple)
    assert isinstance(verdict.confidence.undetermined, bool)
    assert verdict.undetermined == verdict.confidence.undetermined

    # Exact contract check
    assert hasattr(verdict, "delta")
    assert hasattr(verdict, "broken_flows")
    assert hasattr(verdict, "cost")
    assert hasattr(verdict, "confidence")
    assert hasattr(verdict, "unknowns")
    assert hasattr(verdict, "undetermined")
    assert hasattr(verdict, "recommendation")
    assert hasattr(verdict, "reasons")
    assert hasattr(verdict, "alternatives")


def test_review_at_p_success_delta_greater_than_minus_0_02(golden_twin: Twin, privileged_agent: Agent, monkeypatch):
    """Verify negligible-gain condition triggers REVIEW when effort_increase_pct < 5 and p_success_delta > -0.02."""
    from backend.core.results import Delta
    import backend.rules.evaluate as eval_module

    fake_delta = Delta(
        naive_path_reduction_pct=10.0,
        effort_increase_pct=2.0,  # < 5%
        route_eliminated=(),
        p_success_delta=-0.01,    # > -0.02 -> Negligible gain triggers REVIEW
        substituted_paths=(),
    )
    monkeypatch.setattr(eval_module, "_compute_diff", lambda *args, **kwargs: fake_delta)

    verdict = evaluate_change(
        golden_twin,
        control_ids=("ctrl-edr",),
        agent_ids=(privileged_agent.id,),
        seed=1,
        n=20,
    )
    assert verdict.recommendation == "REVIEW"
    assert any("negligible security improvement" in r for r in verdict.reasons)


def test_no_review_merely_because_p_success_delta_greater_than_minus_0_05(golden_twin: Twin, privileged_agent: Agent, monkeypatch):
    """Verify negligible-gain condition does NOT trigger REVIEW merely because p_success_delta > -0.05 when <= -0.02."""
    from backend.core.results import Delta
    import backend.rules.evaluate as eval_module

    fake_delta = Delta(
        naive_path_reduction_pct=10.0,
        effort_increase_pct=2.0,  # < 5%
        route_eliminated=(),
        p_success_delta=-0.03,    # > -0.05, but <= -0.02: MUST NOT trigger REVIEW
        substituted_paths=(),
    )
    monkeypatch.setattr(eval_module, "_compute_diff", lambda *args, **kwargs: fake_delta)

    verdict = evaluate_change(
        golden_twin,
        control_ids=("ctrl-edr",),
        agent_ids=(privileged_agent.id,),
        seed=1,
        n=20,
    )
    # Zero broken flows and not negligible gain -> DEPLOY
    assert verdict.recommendation == "DEPLOY"
    assert not any("negligible security improvement" in r for r in verdict.reasons)


def test_confidence_evidence_weights_and_thresholds():
    """Verify decisive evidence weights (observed=1.0, inventory=0.9, inferred=0.5, assumed=0.0) and thresholds."""
    assert EVIDENCE_WEIGHTS["observed"] == 1.0
    assert EVIDENCE_WEIGHTS["inventory"] == 0.9
    assert EVIDENCE_WEIGHTS["inferred"] == 0.5
    assert EVIDENCE_WEIGHTS["assumed"] == 0.0

    # High >= 0.85 (e.g. inventory elements at 0.90)
    flow_inv = ServiceFlow(id="F_inv", name="Inv Flow", src="a", dst="b", technique="db_login", criticality=1)
    conf_high = compute_confidence(broken_flows=[flow_inv], evidence_map={"F_inv": "inventory"})
    assert conf_high.score == 0.9
    assert conf_high.score >= 0.85
    assert conf_high.level == "High"
    assert conf_high.undetermined is False

    # Observed >= 0.85
    flow_obs = ServiceFlow(id="F_obs", name="Obs Flow", src="a", dst="b", technique="db_login", criticality=1)
    conf_obs = compute_confidence(broken_flows=[flow_obs], evidence_map={"F_obs": "observed"})
    assert conf_obs.score == 1.0
    assert conf_obs.level == "High"

    # Medium >= 0.60 (e.g. 1 inventory at 0.9 and 1 inferred at 0.5 -> average 0.70)
    flow_inf = ServiceFlow(id="F_inf", name="Inf Flow", src="c", dst="d", technique="db_login", criticality=1)
    conf_med = compute_confidence(broken_flows=[flow_inv, flow_inf], evidence_map={"F_inv": "inventory", "F_inf": "inferred"})
    assert conf_med.score == 0.70
    assert 0.60 <= conf_med.score < 0.85
    assert conf_med.level == "Medium"
    assert conf_med.undetermined is False

    # Low < 0.60 (e.g. inferred at 0.5)
    conf_low = compute_confidence(broken_flows=[flow_inf], evidence_map={"F_inf": "inferred"})
    assert conf_low.score == 0.50
    assert conf_low.score < 0.60
    assert conf_low.level == "Low"
    assert conf_low.undetermined is False


def test_assumed_decisive_evidence_triggers_undetermined_and_review(golden_twin: Twin, privileged_agent: Agent):
    """Verify that ANY decisive element with evidence == 'assumed' sets undetermined=True and recommendation=REVIEW."""
    verdict = evaluate_change(
        golden_twin,
        control_ids=("ctrl-edr",),
        agent_ids=(privileged_agent.id,),
        seed=1,
        n=50,
        evidence_map={"jump-01": "assumed"},  # Decisive top route traverses jump-01
    )
    assert verdict.confidence.undetermined is True
    assert verdict.undetermined is True
    assert verdict.recommendation == "REVIEW"
    assert any("assumed" in u.lower() for u in verdict.confidence.unknowns)
    assert any("assumed" in u.lower() for u in verdict.unknowns)
    assert any("undetermined" in r.lower() for r in verdict.reasons)


def test_unknown_evidence_exposure_identifies_decisive_element():
    """Verify assumed decisive evidence is explicitly identified in confidence unknowns."""
    flow_assumed = ServiceFlow(id="F_crit", name="Critical Financial Flow", src="app", dst="db", technique="db_login", criticality=5)
    conf = compute_confidence(broken_flows=[flow_assumed], evidence_map={"F_crit": "assumed"})
    assert conf.undetermined is True
    assert len(conf.unknowns) >= 1
    assert any("F_crit" in u for u in conf.unknowns)
    assert any("assumed" in u for u in conf.unknowns)


def test_scoped_segmentation_exception_preserving_f6_and_breaking_f1():
    """Verify FinBank scoped production DB segmentation breaks F1 while preserving F6 via ControlImpact.exceptions."""
    twin = Twin(
        id="twin-finbank-scoped-seg",
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
            ServiceFlow(id="F1", name="Payroll DB Commits", src="payroll-api", dst="prod-db", technique="db_login", criticality=5),
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

    broken_flows, details = detect_broken_flows(twin, [scoped_seg])
    broken_ids = [f.id for f in broken_flows]

    # F1 must be BLOCKED
    assert "F1" in broken_ids
    # F6 must remain ALLOWED (NOT reported as broken)
    assert "F6" not in broken_ids

    f1_detail = next(d for d in details if d.flow_id == "F1")
    assert f1_detail.src == "payroll-api"
    assert f1_detail.dst == "prod-db"


def test_scoped_segmentation_exception_in_evaluate_change():
    """Verify ControlImpact exceptions are fully respected inside evaluate_change."""
    twin = Twin(
        id="twin-scoped-eval",
        assets=(
            Asset(id="backup-01", name="Backup Vault", kind="server", zone="mgmt", criticality=4),
            Asset(id="prod-db", name="Production DB", kind="database", zone="prod", criticality=5, crown_jewel=True),
        ),
        identities=(
            Identity(id="svc.backup", name="Backup Service", kind="service_account", tier=1),
        ),
        edges=(
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

    verdict = evaluate_change(
        twin,
        control_ids=[scoped_seg],
        seed=1,
        n=20,
    )
    # F6 is excepted, so 0 broken flows
    assert len(verdict.broken_flows) == 0