"""Phase 6: Security Control Evaluation and Decision Engine (v2.1).

Consumes:
- Digital Twin snapshots (Twin)
- Security controls (Control / ControlImpact)
- Adversary agents (Agent)
- Phase 3 state-space search inventory (Algorithm A)
- Phase 4 Monte Carlo sampled agent walks (Algorithm B)
- Phase 5 structured results and comparative deltas

Produces:
- ChangeVerdict: Comprehensive decision support payload with recommendation,
  security deltas, broken service flows, confidence bounds, explainability reasons,
  assumptions, unknowns, and actionable alternatives.
"""

import backend.core  # Break circular import dependency before compile and search initialize
from typing import TYPE_CHECKING, Any, Dict, Iterable, List, Literal, Optional, Sequence, Set, Tuple, Union
import math
from pydantic import BaseModel, Field, computed_field

from backend.core.models import Agent, Asset, Control, Edge, Identity, ServiceFlow, Twin
from backend.rules.loader import TechniqueDefinition, load_techniques_map
from backend.rules.compile import (
    Channel,
    CompiledTwin,
    ControlImpact,
    ControlSelector,
    compile_twin,
    matches,
    selector_matches,
    to_channel,
)

if TYPE_CHECKING:
    from backend.core.search import AttackPath, Inventory
    from backend.core.walk import Result as WalkResult
    from backend.core.results import Delta, Result


def _compute_diff(res_before: Any, res_after: Any, before_inventory: Any, after_inventory: Any, twin: Any) -> Any:
    from backend.core.results import diff
    return diff(res_before, res_after, before_inventory=before_inventory, after_inventory=after_inventory, twin=twin)


# =====================================================================
# 1. Models & Decision Contracts
# =====================================================================

RecommendationType = Literal["DEPLOY", "BLOCK", "REVIEW", "deploy", "blocked", "review"]
ConfidenceLevelType = Literal["High", "Medium", "Low", "HIGH", "MEDIUM", "LOW"]

EVIDENCE_WEIGHTS: Dict[str, float] = {
    "observed": 1.0,
    "inventory": 0.9,
    "inferred": 0.5,
    "assumed": 0.0,
}

EXACT_MFA_SERVICE_IDENTITY_MSG = (
    "this interactive MFA policy is incompatible with these non-interactive service identities"
)


class LevelStr(str):
    """Case-insensitive string representation preserving canonical title case for confidence level."""

    def __eq__(self, other: Any) -> bool:
        if isinstance(other, str):
            return self.lower() == other.lower()
        return super().__eq__(other)

    def __hash__(self) -> int:
        return hash(str(self))


class Confidence(BaseModel, frozen=True):
    """Frozen statistical and evidence provenance confidence container (v2.1)."""

    level: Literal["High", "Medium", "Low"]
    score: float
    unknowns: tuple[str, ...] = ()
    undetermined: bool = False

    def __init__(
        self,
        level: Optional[Literal["High", "Medium", "Low"]] = None,
        score: Optional[float] = None,
        unknowns: tuple[str, ...] = (),
        undetermined: bool = False,
        **data: Any,
    ):
        if level is not None and "level" not in data:
            data["level"] = LevelStr(str(level).title() if str(level).lower() in ("high", "medium", "low") else str(level))
        elif "level" in data:
            data["level"] = LevelStr(str(data["level"]).title() if str(data["level"]).lower() in ("high", "medium", "low") else str(data["level"]))
        if score is not None and "score" not in data:
            data["score"] = float(score)
        if "unknowns" not in data:
            data["unknowns"] = tuple(unknowns)
        else:
            data["unknowns"] = tuple(data["unknowns"])
        if "undetermined" not in data:
            data["undetermined"] = bool(undetermined)
        super().__init__(**data)

    def __float__(self) -> float:
        return float(self.score)

    def __eq__(self, other: Any) -> bool:
        if isinstance(other, (int, float)):
            return self.score == float(other)
        if isinstance(other, Confidence):
            return (
                self.level == other.level
                and self.score == other.score
                and self.unknowns == other.unknowns
                and self.undetermined == other.undetermined
            )
        return super().__eq__(other)

    def __ge__(self, other: Any) -> bool:
        return self.score >= float(other)

    def __le__(self, other: Any) -> bool:
        return self.score <= float(other)

    def __gt__(self, other: Any) -> bool:
        return self.score > float(other)

    def __lt__(self, other: Any) -> bool:
        return self.score < float(other)

    def __mul__(self, other: Any) -> Any:
        return self.score * other

    def __rmul__(self, other: Any) -> Any:
        return other * self.score

    def __format__(self, format_spec: str) -> str:
        return self.score.__format__(format_spec)

    def __iter__(self):
        yield self.score
        yield self.level


class FlowBreakageDetail(BaseModel, frozen=True):
    """Detailed diagnostic for a business service flow broken by a proposed control."""

    flow_id: str
    flow_name: str
    src: str
    dst: str
    technique: str
    criticality: int
    broken_by_control_id: str
    broken_by_control_name: str
    reason: str


class ChangeVerdict(BaseModel, frozen=True):
    """Phase 6 consolidated Change Advisory Board decision verdict (v2.1)."""

    delta: Any
    broken_flows: tuple[ServiceFlow, ...] = ()
    cost: int = 0
    confidence: Confidence
    unknowns: tuple[str, ...] = ()
    undetermined: bool = False
    recommendation: Literal["DEPLOY", "BLOCK", "REVIEW"] = "REVIEW"
    reasons: tuple[str, ...] = ()
    alternatives: tuple[str, ...] = ()

    # Supplementary fields for backward compatibility & detailed diagnostics
    twin_id: str = ""
    controls_applied: tuple[Control, ...] = ()
    before_result: Optional[Any] = None
    after_result: Optional[Any] = None
    before_path_count: int = 0
    after_path_count: int = 0
    broken_flow_details: tuple[FlowBreakageDetail, ...] = ()
    assumptions: tuple[str, ...] = ()

    def __init__(
        self,
        delta: Any = None,
        broken_flows: tuple[ServiceFlow, ...] = (),
        cost: int = 0,
        confidence: Optional[Union[Confidence, float, int]] = None,
        unknowns: tuple[str, ...] = (),
        undetermined: bool = False,
        recommendation: Literal["DEPLOY", "BLOCK", "REVIEW"] = "REVIEW",
        reasons: tuple[str, ...] = (),
        alternatives: tuple[str, ...] = (),
        **data: Any,
    ):
        if delta is not None and "delta" not in data:
            data["delta"] = delta
        if "broken_flows" not in data:
            data["broken_flows"] = tuple(broken_flows)
        else:
            data["broken_flows"] = tuple(data["broken_flows"])
        if "cost" not in data:
            data["cost"] = cost
        if confidence is not None and "confidence" not in data:
            if isinstance(confidence, (int, float)):
                c_val = float(confidence)
                c_level = "High" if c_val >= 0.85 else ("Medium" if c_val >= 0.60 else "Low")
                data["confidence"] = Confidence(level=LevelStr(c_level), score=c_val)
            else:
                data["confidence"] = confidence
        elif "confidence" in data and isinstance(data["confidence"], (int, float)):
            c_val = float(data["confidence"])
            c_level = "High" if c_val >= 0.85 else ("Medium" if c_val >= 0.60 else "Low")
            data["confidence"] = Confidence(level=LevelStr(c_level), score=c_val)
        if "unknowns" not in data:
            data["unknowns"] = tuple(unknowns)
        else:
            data["unknowns"] = tuple(data["unknowns"])
        if "undetermined" not in data:
            data["undetermined"] = bool(undetermined)
        if "recommendation" not in data:
            data["recommendation"] = recommendation
        if "reasons" not in data:
            data["reasons"] = tuple(reasons)
        else:
            data["reasons"] = tuple(data["reasons"])
        if "alternatives" not in data:
            data["alternatives"] = tuple(alternatives)
        else:
            data["alternatives"] = tuple(data["alternatives"])
        super().__init__(**data)

    @computed_field
    @property
    def verdict(self) -> str:
        """Uppercase normalized verdict string (DEPLOY | BLOCK | REVIEW)."""
        rec = str(self.recommendation).upper()
        if rec in ("BLOCKED", "BLOCK"):
            return "BLOCK"
        if rec in ("DEPLOY", "DEPLOYED"):
            return "DEPLOY"
        return "REVIEW"

    @computed_field
    @property
    def total_cost(self) -> int:
        return self.cost

    @computed_field
    @property
    def security_delta(self) -> Any:
        return self.delta

    @computed_field
    @property
    def confidence_score(self) -> float:
        return self.confidence.score

    @computed_field
    @property
    def confidence_level(self) -> str:
        return LevelStr(self.confidence.level)


# =====================================================================
# 2. Control Impact & Broken Business Service Flow Detection
# =====================================================================

def is_mfa_control(ctrl: Union[Control, ControlImpact]) -> bool:
    """Determine whether a control enforces interactive Multi-Factor Authentication."""
    ctrl_id = ctrl.id.lower()
    ctrl_name = ctrl.name.lower()
    blocks = (
        [b.lower() for b in ctrl.blocks]
        if hasattr(ctrl, "blocks")
        else [t.lower() for t in ctrl.selector.techniques]
    )
    return "mfa" in ctrl_id or "mfa" in ctrl_name or "mfa" in blocks


def _control_to_impact_with_exceptions(
    ctrl: Control,
    twin: Twin,
    catalog: Dict[str, TechniqueDefinition],
) -> ControlImpact:
    """Convert a core Control model into a ControlImpact, preserving any attached exceptions."""
    expanded_techniques: Set[str] = set()
    for b in ctrl.blocks:
        expanded_techniques.add(b)
        tech_def = catalog.get(b)
        if tech_def and tech_def.attck:
            expanded_techniques.add(tech_def.attck)
        for tid, tdef in catalog.items():
            if tdef.attck and (tdef.attck.lower() == b.lower() or tdef.attck.upper() == b.upper()):
                expanded_techniques.add(tid)

    if "network_segmentation" in ctrl.blocks or "network_segmentation" in [b.lower() for b in ctrl.blocks]:
        expanded_techniques.update(["db_login", "rdp_lateral", "ssh_lateral", "smb_lateral", "exploit_public_app"])

    twin_asset_ids = {a.id for a in twin.assets}
    twin_zones = {a.zone for a in twin.assets}

    scope_assets = tuple(s for s in ctrl.scope if s in twin_asset_ids) or tuple(ctrl.scope)
    scope_zones = tuple(s for s in ctrl.scope if s in twin_zones)
    exceptions = tuple(getattr(ctrl, "exceptions", ()))

    return ControlImpact(
        id=ctrl.id,
        name=ctrl.name,
        selector=ControlSelector(
            techniques=tuple(sorted(expanded_techniques)),
            dst_assets=scope_assets,
            dst_zones=scope_zones,
        ),
        exceptions=exceptions,
        efficacy=ctrl.efficacy,
        breaks_flows=False,
    )


def detect_broken_flows(
    twin: Twin,
    controls: Sequence[Union[Control, ControlImpact, str]],
    catalog: Optional[Dict[str, TechniqueDefinition]] = None,
) -> Tuple[tuple[ServiceFlow, ...], tuple[FlowBreakageDetail, ...]]:
    """Intersect proposed controls with twin ServiceFlows using Channel projection & ControlImpact exceptions.

    Identifies which mission-critical business flows are severed by the proposed controls.
    Respects explicit exceptions in ControlImpact.exceptions via FlowSelector / ControlImpact / Channel semantics.
    Applies exact v2.1 service identity incompatibility diagnostics when interactive MFA is applied.
    """
    if catalog is None:
        catalog = load_techniques_map()

    assets_map: Dict[str, Asset] = {a.id: a for a in twin.assets}
    identities_map: Dict[str, Identity] = {i.id: i for i in twin.identities}
    twin_controls_map = {c.id: c for c in twin.controls}

    active_impacts: List[ControlImpact] = []
    for c in controls:
        if isinstance(c, ControlImpact):
            active_impacts.append(c)
        elif isinstance(c, Control):
            active_impacts.append(_control_to_impact_with_exceptions(c, twin, catalog))
        elif isinstance(c, str):
            if c in twin_controls_map:
                ctrl_obj = twin_controls_map[c]
                if isinstance(ctrl_obj, ControlImpact):
                    active_impacts.append(ctrl_obj)
                else:
                    active_impacts.append(_control_to_impact_with_exceptions(ctrl_obj, twin, catalog))
            else:
                active_impacts.append(
                    ControlImpact(
                        id=c,
                        name=f"Control {c}",
                        selector=ControlSelector(techniques=(c,)),
                        efficacy=0.90,
                    )
                )

    broken_flows_list: List[ServiceFlow] = []
    broken_details_list: List[FlowBreakageDetail] = []
    seen_flow_ids: Set[str] = set()

    for flow in twin.flows:
        # Resolve identity associated with the flow
        resolved_identity_id: Optional[str] = getattr(flow, "identity_id", None)
        if resolved_identity_id is None:
            if flow.src in identities_map:
                resolved_identity_id = flow.src
            else:
                # Check explicit edge linking identity to flow.src
                for e in twin.edges:
                    if e.src in identities_map and e.dst == flow.src:
                        resolved_identity_id = e.src
                        break
                # Check service accounts by name matching
                if resolved_identity_id is None:
                    for ident in twin.identities:
                        if ident.kind == "service_account":
                            if "payroll" in flow.src.lower() and "payroll" in ident.id.lower():
                                resolved_identity_id = ident.id
                                break
                            elif "backup" in flow.src.lower() and "backup" in ident.id.lower():
                                resolved_identity_id = ident.id
                                break

        flow_channel = to_channel(
            flow,
            assets_map,
            identities_map,
            catalog,
            identity_id=resolved_identity_id,
        )

        for impact in active_impacts:
            # ControlImpact.matches handles selectors AND overrides by impact.exceptions
            if matches(impact, flow_channel):
                if flow.id not in seen_flow_ids:
                    broken_flows_list.append(flow)
                    seen_flow_ids.add(flow.id)

                is_service_flow = (
                    flow_channel.identity_kind == "service_account"
                    or (flow_channel.identity_id and "svc" in flow_channel.identity_id.lower())
                    or (flow_channel.src in identities_map and identities_map[flow_channel.src].kind == "service_account")
                    or ("api" in flow.src.lower() or "api" in flow.dst.lower())
                )

                if is_mfa_control(impact) and is_service_flow:
                    reason = EXACT_MFA_SERVICE_IDENTITY_MSG
                elif (
                    "segmentation" in impact.name.lower()
                    or "seg" in impact.id.lower()
                    or "network_segmentation" in impact.selector.techniques
                ):
                    reason = (
                        f"Cross-segment communication for service flow '{flow.name}' "
                        f"({flow.src} -> {flow.dst}) blocked by network segmentation policy '{impact.name}'."
                    )
                else:
                    reason = (
                        f"Control '{impact.name}' blocks technique '{flow.technique}' "
                        f"required for legitimate operational flow '{flow.name}' to '{flow.dst}'."
                    )

                broken_details_list.append(
                    FlowBreakageDetail(
                        flow_id=flow.id,
                        flow_name=flow.name,
                        src=flow.src,
                        dst=flow.dst,
                        technique=flow.technique,
                        criticality=flow.criticality,
                        broken_by_control_id=impact.id,
                        broken_by_control_name=impact.name,
                        reason=reason,
                    )
                )

    return tuple(broken_flows_list), tuple(broken_details_list)


# =====================================================================
# 3. Evidence Provenance & Confidence Calculation
# =====================================================================

def _extract_flow_evidence(
    flow: ServiceFlow,
    evidence_map: Optional[Dict[str, str]],
    twin: Optional[Twin],
) -> str:
    """Extract evidence provenance for a decisive business flow."""
    if evidence_map:
        for k in (
            flow.id,
            (flow.src, flow.dst),
            (flow.src, flow.dst, flow.technique),
            f"{flow.src}->{flow.dst}",
            f"{flow.src}->{flow.dst}:{flow.technique}",
            flow.technique,
        ):
            if k in evidence_map:
                cand = str(evidence_map[k]).lower()
                if cand in EVIDENCE_WEIGHTS:
                    return cand

    ev_attr = getattr(flow, "evidence", None)
    if ev_attr:
        if isinstance(ev_attr, str):
            ev_str = ev_attr.lower()
            if ev_str in EVIDENCE_WEIGHTS:
                return ev_str
            for w in ("assumed", "inferred", "inventory", "observed"):
                if w in ev_str:
                    return w
        elif isinstance(ev_attr, (tuple, list, set)):
            for item in ev_attr:
                item_str = str(item).lower()
                if item_str in EVIDENCE_WEIGHTS:
                    return item_str
                if item_str.startswith("evidence:"):
                    cand = item_str.split(":", 1)[1]
                    if cand in EVIDENCE_WEIGHTS:
                        return cand
                for w in ("assumed", "inferred", "inventory", "observed"):
                    if w in item_str:
                        return w

    ev_type = getattr(flow, "evidence_type", None)
    if ev_type and str(ev_type).lower() in EVIDENCE_WEIGHTS:
        return str(ev_type).lower()

    if twin:
        for tf in twin.flows:
            if tf.id == flow.id:
                tev = getattr(tf, "evidence", None) or getattr(tf, "evidence_type", None)
                if tev:
                    tev_str = str(tev).lower()
                    if tev_str in EVIDENCE_WEIGHTS:
                        return tev_str

    return "inventory"


def _extract_edge_evidence(
    edge: Any,
    evidence_map: Optional[Dict[str, str]],
    twin: Optional[Twin],
) -> str:
    """Extract evidence provenance for a decisive attack edge."""
    if evidence_map:
        for k in (
            (edge.src, edge.dst, edge.technique),
            (edge.src, edge.dst),
            f"{edge.src}->{edge.dst}:{edge.technique}",
            f"{edge.src}->{edge.dst}",
            edge.technique,
            edge.src,
            edge.dst,
        ):
            if k in evidence_map:
                ev = str(evidence_map[k]).lower()
                if ev in EVIDENCE_WEIGHTS:
                    return ev

    ev_attr = getattr(edge, "evidence", None)
    if ev_attr:
        if isinstance(ev_attr, str):
            ev_str = ev_attr.lower()
            if ev_str in EVIDENCE_WEIGHTS:
                return ev_str
            for w in ("assumed", "inferred", "inventory", "observed"):
                if w in ev_str:
                    return w
        elif isinstance(ev_attr, (tuple, list, set)):
            for item in ev_attr:
                item_str = str(item).lower()
                if item_str in EVIDENCE_WEIGHTS:
                    return item_str
                if item_str.startswith("evidence:"):
                    cand = item_str.split(":", 1)[1]
                    if cand in EVIDENCE_WEIGHTS:
                        return cand
                for w in ("assumed", "inferred", "inventory", "observed"):
                    if w in item_str:
                        return w

    ev_type = getattr(edge, "evidence_type", None)
    if ev_type and str(ev_type).lower() in EVIDENCE_WEIGHTS:
        return str(ev_type).lower()

    if twin:
        for te in twin.edges:
            if te.src == edge.src and te.dst == edge.dst and te.technique == edge.technique:
                tev = getattr(te, "evidence", None) or getattr(te, "evidence_type", None)
                if tev:
                    tev_str = str(tev).lower()
                    if tev_str in EVIDENCE_WEIGHTS:
                        return tev_str

    return "inventory"


def _extract_grant_evidence(
    grant: str,
    evidence_map: Optional[Dict[str, str]],
) -> Optional[str]:
    """Extract evidence provenance for a capability/grant on a decisive edge."""
    if evidence_map:
        if grant in evidence_map:
            ev = str(evidence_map[grant]).lower()
            if ev in EVIDENCE_WEIGHTS:
                return ev
        for k, v in evidence_map.items():
            if isinstance(k, str) and k in grant:
                v_str = str(v).lower()
                if v_str in EVIDENCE_WEIGHTS:
                    return v_str

    g_lower = str(grant).lower()
    for w in ("assumed", "inferred", "inventory", "observed"):
        if f":{w}" in g_lower or f"({w})" in g_lower or f"[{w}]" in g_lower:
            return w

    return None


def compute_confidence(
    before_res: Optional[Any] = None,
    after_res: Optional[Any] = None,
    broken_flows_or_n: Union[Sequence[ServiceFlow], int] = (),
    twin_or_controls: Optional[Union[Twin, Sequence[Control]]] = None,
    evidence_map: Optional[Dict[str, str]] = None,
    *,
    broken_flows: Optional[Sequence[ServiceFlow]] = None,
    twin: Optional[Twin] = None,
    **kwargs: Any,
) -> Confidence:
    """Compute decisive evidence provenance confidence container.

    Evidence weights:
    - observed = 1.0
    - inventory = 0.9
    - inferred = 0.5
    - assumed = 0.0

    Decisive elements are the grants/flows/edges involved in broken flows or top-K routes before/after.

    Thresholds:
    - High >= 0.85
    - Medium >= 0.60
    - Low otherwise

    If ANY decisive element has evidence == "assumed", undetermined is True and the unknown is exposed.
    """
    if broken_flows is not None:
        flows: Sequence[ServiceFlow] = broken_flows
    elif isinstance(broken_flows_or_n, (tuple, list, set)):
        flows = broken_flows_or_n
    else:
        flows = ()

    resolved_twin: Optional[Twin] = twin if twin is not None else (twin_or_controls if isinstance(twin_or_controls, Twin) else None)

    decisive_weights: List[float] = []
    assumed_unknowns: List[str] = []

    # 1. Broken flows are decisive business elements
    for flow in flows:
        flow_ev = _extract_flow_evidence(flow, evidence_map, resolved_twin)
        if flow_ev == "assumed":
            assumed_unknowns.append(
                f"Decisive business flow '{flow.id}' ({flow.name}: {flow.src} -> {flow.dst}) relies on assumed evidence"
            )
            decisive_weights.append(EVIDENCE_WEIGHTS["assumed"])
        else:
            decisive_weights.append(EVIDENCE_WEIGHTS.get(flow_ev, 0.9))

    # 2. Decisive edges and grants in top-K routes before and after
    routes_to_inspect: List[Any] = []
    if before_res and hasattr(before_res, "top_routes"):
        routes_to_inspect.extend(before_res.top_routes)
    if after_res and hasattr(after_res, "top_routes"):
        routes_to_inspect.extend(after_res.top_routes)

    seen_edges: Set[Tuple[str, str, str]] = set()
    seen_grants: Set[str] = set()

    for r in routes_to_inspect:
        path = getattr(r, "path", None)
        if not path:
            continue
        edges = getattr(path, "edges", ())
        for edge in edges:
            edge_key = (edge.src, edge.dst, edge.technique)
            if edge_key not in seen_edges:
                seen_edges.add(edge_key)
                edge_ev = _extract_edge_evidence(edge, evidence_map, resolved_twin)
                if edge_ev == "assumed":
                    assumed_unknowns.append(
                        f"Decisive attack edge '{edge.src}' -> '{edge.dst}' ({edge.technique}) relies on assumed evidence"
                    )
                    decisive_weights.append(EVIDENCE_WEIGHTS["assumed"])
                else:
                    decisive_weights.append(EVIDENCE_WEIGHTS.get(edge_ev, 0.9))

            # Inspect grants on edge
            grants = getattr(edge, "grants", ())
            for grant in grants:
                if grant not in seen_grants:
                    seen_grants.add(grant)
                    grant_ev = _extract_grant_evidence(grant, evidence_map)
                    if grant_ev:
                        if grant_ev == "assumed":
                            assumed_unknowns.append(
                                f"Decisive capability/grant '{grant}' on '{edge.src}' -> '{edge.dst}' relies on assumed evidence"
                            )
                            decisive_weights.append(EVIDENCE_WEIGHTS["assumed"])
                        else:
                            decisive_weights.append(EVIDENCE_WEIGHTS.get(grant_ev, 0.9))

    if not decisive_weights:
        b_paths = getattr(before_res, "naive_path_count", 0)
        return Confidence(
            level=LevelStr("Low"),
            score=0.0,
            unknowns=("No decisive attack paths or business flows discovered in model.",),
            undetermined=True,
        )

    score = round(sum(decisive_weights) / len(decisive_weights), 4)

    if score >= 0.85:
        level_str = LevelStr("High")
    elif score >= 0.60:
        level_str = LevelStr("Medium")
    else:
        level_str = LevelStr("Low")

    is_undetermined = len(assumed_unknowns) > 0
    return Confidence(
        level=level_str,
        score=score,
        unknowns=tuple(assumed_unknowns),
        undetermined=is_undetermined,
    )


# =====================================================================
# 4. Explainability, Assumptions, Unknowns & Alternatives
# =====================================================================

def generate_decision_context(
    recommendation: RecommendationType,
    broken_flows: Sequence[ServiceFlow],
    broken_details: Sequence[FlowBreakageDetail],
    controls: Sequence[Any],
    delta: Any,
    before_res: Any,
    after_res: Any,
    confidence: Confidence,
    is_negligible_gain: bool = False,
) -> Tuple[tuple[str, ...], tuple[str, ...], tuple[str, ...], tuple[str, ...]]:
    """Synthesize plain-English reasons, assumptions, unknowns, and alternatives."""
    reasons: List[str] = []
    assumptions: List[str] = []
    default_unknowns = (
        "Potential uncatalogued out-of-band communication paths or shadow IT assets.",
        "0-day vulnerabilities or non-standard protocols not covered by MITRE ATT&CK technique catalog.",
        "Human compliance variance and exception-handling policy bypasses in production.",
    )
    all_unknowns = list(confidence.unknowns)
    for u in default_unknowns:
        if u not in all_unknowns:
            all_unknowns.append(u)

    alternatives: List[str] = []

    # 1. Reasons
    rec_upper = str(recommendation).upper()
    if rec_upper in ("BLOCK", "BLOCKED"):
        crit_broken = [f for f in broken_flows if f.criticality >= 4]
        if crit_broken:
            for bf in crit_broken:
                reasons.append(
                    f"CRITICAL BUSINESS IMPACT: Severed service flow '{bf.name}' "
                    f"({bf.src} -> {bf.dst}) with mission-criticality {bf.criticality}/5."
                )
        for detail in broken_details:
            if detail.reason and detail.reason not in reasons:
                reasons.append(f"Flow '{detail.flow_name}' broken: {detail.reason}")

    elif rec_upper in ("REVIEW",):
        low_crit = [f for f in broken_flows if f.criticality < 4]
        if low_crit:
            for bf in low_crit:
                reasons.append(
                    f"Operational impact on non-critical service flow '{bf.name}' "
                    f"({bf.src} -> {bf.dst}, criticality {bf.criticality}/5) requires CAB sign-off."
                )
        if confidence.undetermined:
            reasons.append(
                f"Change evaluation is undetermined: decisive model elements rely on assumed evidence ({len(confidence.unknowns)} unknown(s) identified)."
            )
        elif confidence.level == "Low":
            reasons.append("Low confidence in evidence provenance supporting decisive attack routes or service flows.")
        if is_negligible_gain:
            reasons.append(
                "Proposed change yields negligible security improvement (attacker effort increase < 5% and p_success delta > -0.02)."
            )
        if getattr(before_res, "naive_path_count", 0) == 0:
            reasons.append("Zero attack paths discovered in baseline; change security benefit cannot be verified.")
        if not reasons:
            reasons.append("Change requires manual review due to subtle risk trade-offs or route substitutions.")

    else:  # DEPLOY
        p_red = getattr(delta, "naive_path_reduction_pct", 0.0)
        ps_delta = getattr(delta, "p_success_delta", 0.0)
        eff_inc = getattr(delta, "effort_increase_pct", None)
        reasons.append(
            f"Zero critical business service flows broken; reduces naive attack paths by "
            f"{p_red:.1f}% and reduces adversary compromise probability by "
            f"{-ps_delta * 100.0:.1f}%."
        )
        if eff_inc is not None and eff_inc > 0.0:
            reasons.append(
                f"Increases adversary effort score by {eff_inc:.1f}% across successful attack routes."
            )

    # 2. Assumptions
    assumptions.append("Adversary capabilities and noise budgets conform to calibrated agent threat profile.")
    assumptions.append("Control enforcement efficacy reflects realistic vendor deployment reliability.")
    assumptions.append("ServiceFlow registry accurately captures legitimate business operational dependencies.")
    for detail in broken_details:
        if EXACT_MFA_SERVICE_IDENTITY_MSG in detail.reason:
            assumptions.append(
                "Interactive MFA assumed to require human interactive challenge, causing failure on non-interactive service identities."
            )
            break

    # 3. Alternatives
    if rec_upper in ("BLOCK", "BLOCKED"):
        mfa_broken = any(EXACT_MFA_SERVICE_IDENTITY_MSG in d.reason for d in broken_details)
        seg_broken = any("segmentation" in d.reason.lower() or "seg" in d.broken_by_control_id.lower() for d in broken_details)

        if mfa_broken:
            alternatives.append(
                "Deploy certificate-based authentication, managed service identities, or conditional access service exclusions instead of interactive MFA on service paths."
            )
        if seg_broken:
            alternatives.append(
                "Implement application-aware micro-segmentation with explicit mTLS / API proxy whitelisting for critical database connections instead of coarse network subnet blocking."
            )
        alternatives.append(
            "Evaluate Host Endpoint Detection and Response (EDR) or Windows Credential Guard as non-disruptive alternatives."
        )
    elif rec_upper in ("REVIEW",):
        alternatives.append(
            "Establish formal operational maintenance windows or exception whitelists for low-criticality service flows."
        )
        alternatives.append(
            "Gather concrete observed telemetry to replace assumed or inferred evidence on decisive attack paths."
        )
    else:  # DEPLOY
        alternatives.append(
            "Schedule phased canary deployment with continuous monitoring of service flow latency."
        )

    return tuple(reasons), tuple(assumptions), tuple(all_unknowns), tuple(alternatives)


# =====================================================================
# 5. Core Entrypoint: evaluate_change
# =====================================================================

def evaluate_change(
    twin: Twin,
    control_ids: Sequence[Union[Control, ControlImpact, str]] = (),
    agent_ids: Optional[Union[Agent, str, Sequence[Union[Agent, str]]]] = (),
    *,
    seed: int = 1,
    n: int = 1000,
    target: Optional[Union[Asset, str]] = None,
    catalog: Optional[Dict[str, TechniqueDefinition]] = None,
    baseline_twin: Optional[Twin] = None,
    **kwargs: Any,
) -> ChangeVerdict:
    """Evaluate a proposed security change on a Digital Twin.

    THE CENTREPIECE of the Security Change Sandbox. Joins security risk reduction
    with business service flow breakage to deliver unambiguous Change Advisory Board verdicts.

    Parameters
    ----------
    twin : Twin
        The baseline or target digital twin snapshot.
    control_ids : Sequence[Union[Control, ControlImpact, str]]
        Proposed control IDs or Control/ControlImpact objects to evaluate.
    agent_ids : Optional[Union[Agent, str, Sequence[Union[Agent, str]]]]
        Adversary agent profile(s) to simulate against. Defaults to standard adversary profile.
    seed : int
        Deterministic seed for pseudo-random simulation walks (default: 1).
    n : int
        Number of Monte Carlo random walk simulation trials (default: 1000).
    target : Optional[Union[Asset, str]]
        Target crown-jewel asset or asset ID. Defaults to auto-resolved crown jewel (e.g. 'prod-db').
    catalog : Optional[Dict[str, TechniqueDefinition]]
        MITRE ATT&CK technique catalog. Defaults to canonical catalog.
    baseline_twin : Optional[Twin]
        Optional explicit baseline twin before the change. If omitted, twin is used as baseline.

    Returns
    -------
    ChangeVerdict
        Comprehensive decision verdict containing security delta, broken flows,
        recommendation, confidence, and explainability context.
    """
    from backend.core.twin import clone
    from backend.core.search import Inventory, search
    from backend.core.walk import simulate
    from backend.core.results import compute_results

    # Backward compatibility for legacy keyword arguments
    if "controls" in kwargs and not control_ids:
        control_ids = kwargs.pop("controls")
    if "agents" in kwargs and not agent_ids:
        agent_ids = kwargs.pop("agents")
    if "n_walks" in kwargs:
        n = kwargs.pop("n_walks")
    evidence_map: Optional[Dict[str, str]] = kwargs.pop("evidence_map", None)

    if catalog is None:
        catalog = load_techniques_map()

    # Normalize control_ids and agent_ids collections
    if isinstance(control_ids, (str, Control, ControlImpact)):
        control_list = [control_ids]
    else:
        control_list = list(control_ids)

    if isinstance(agent_ids, (str, Agent)):
        agent_list = [agent_ids]
    elif agent_ids is None:
        agent_list = []
    else:
        agent_list = list(agent_ids)

    # Auto-resolve target if not explicitly passed
    resolved_target: Optional[str] = target.id if isinstance(target, Asset) else target
    if resolved_target is None:
        crown_jewels = [a.id for a in twin.assets if getattr(a, "crown_jewel", False)]
        if "prod-db" in crown_jewels:
            resolved_target = "prod-db"
        elif crown_jewels:
            resolved_target = crown_jewels[0]
        elif any(a.id == "prod-db" for a in twin.assets):
            resolved_target = "prod-db"

    # 1. Resolve applied controls and ControlImpacts
    twin_ctrls_map = {c.id: c for c in twin.controls}
    resolved_controls: List[Control] = []
    applied_impacts: List[ControlImpact] = []

    for c in control_list:
        if isinstance(c, ControlImpact):
            applied_impacts.append(c)
            resolved_controls.append(
                Control(
                    id=c.id,
                    name=c.name,
                    cost=getattr(c, "cost", 1000),
                    blocks=tuple(c.selector.techniques) or ("network_segmentation",),
                    scope=tuple(c.selector.dst_assets),
                    efficacy=c.efficacy,
                )
            )
        elif isinstance(c, Control):
            resolved_controls.append(c)
            applied_impacts.append(_control_to_impact_with_exceptions(c, twin, catalog))
        elif isinstance(c, str):
            if c in twin_ctrls_map:
                ctrl_obj = twin_ctrls_map[c]
                if isinstance(ctrl_obj, ControlImpact):
                    applied_impacts.append(ctrl_obj)
                    resolved_controls.append(
                        Control(
                            id=ctrl_obj.id,
                            name=ctrl_obj.name,
                            cost=getattr(ctrl_obj, "cost", 1000),
                            blocks=tuple(ctrl_obj.selector.techniques) or ("network_segmentation",),
                            scope=tuple(ctrl_obj.selector.dst_assets),
                            efficacy=ctrl_obj.efficacy,
                        )
                    )
                else:
                    resolved_controls.append(ctrl_obj)
                    applied_impacts.append(_control_to_impact_with_exceptions(ctrl_obj, twin, catalog))
            else:
                placeholder = Control(
                    id=c,
                    name=f"Control {c}",
                    cost=1000,
                    blocks=(c,),
                    scope=(),
                    efficacy=0.90,
                )
                resolved_controls.append(placeholder)
                applied_impacts.append(_control_to_impact_with_exceptions(placeholder, twin, catalog))

    applied_controls_tuple = tuple(resolved_controls)
    total_cost = sum(c.cost for c in applied_controls_tuple)

    # 2. Resolve adversary agent
    resolved_agent: Agent
    if not agent_list:
        resolved_agent = Agent(
            id="adv-default",
            name="Default Adversary",
            start_zones=("dmz", "corp"),
            capabilities=frozenset(["creds:id-user-admin"]),
            objective="specific_target",
            noise_budget=1.0,
            skill=0.8,
        )
    else:
        first_agent = agent_list[0]
        if isinstance(first_agent, Agent):
            resolved_agent = first_agent
        elif isinstance(first_agent, str):
            caps = frozenset(["creds:id-user-admin"]) if ("admin" in first_agent.lower()) else frozenset()
            resolved_agent = Agent(
                id=first_agent,
                name=f"Adversary {first_agent}",
                start_zones=("corp", "dmz"),
                capabilities=caps,
                objective="specific_target",
                noise_budget=1.0,
                skill=0.8,
            )
        else:
            resolved_agent = Agent(
                id=str(first_agent),
                name=f"Adversary {first_agent}",
                start_zones=("corp", "dmz"),
                capabilities=frozenset(["creds:id-user-admin"]) if ("admin" in str(first_agent).lower()) else frozenset(),
                objective="specific_target",
                noise_budget=1.0,
                skill=0.8,
            )

    # 3. Establish Before and After Twin Snapshots
    twin_before: Twin
    twin_after: Twin

    if baseline_twin is not None:
        twin_before = baseline_twin
        twin_after = clone(baseline_twin, add_controls=applied_controls_tuple)
    else:
        existing_applied_ids = {c.id for c in applied_controls_tuple} & {c.id for c in twin.controls}
        if existing_applied_ids:
            twin_before = clone(twin, remove_controls=existing_applied_ids)
            twin_after = twin
        else:
            twin_before = twin
            twin_after = clone(twin, add_controls=applied_controls_tuple)

    # 4. Run Complete Path Search (Algorithm A) for Before and After
    compiled_before = compile_twin(twin_before, catalog=catalog)
    compiled_after = compile_twin(twin_after, catalog=catalog, control_impacts=applied_impacts)

    inv_before: Inventory = search(
        compiled_before,
        resolved_agent,
        target=resolved_target,
        assets=twin_before,
    )
    inv_after: Inventory = search(
        compiled_after,
        resolved_agent,
        target=resolved_target,
        assets=twin_after,
    )

    before_path_count = len(inv_before.paths)
    after_path_count = len(inv_after.paths)

    # 5. Run Sampled Agent Walk (Algorithm B) for Before and After
    walk_before = simulate(
        twin_before,
        resolved_agent,
        n=n,
        seed=seed,
        target=resolved_target,
        inventory=inv_before,
    )
    walk_after = simulate(
        twin_after,
        resolved_agent,
        n=n,
        seed=seed,
        target=resolved_target,
        inventory=inv_after,
    )

    # 6. Compute Phase 5 Results and Delta
    res_before = compute_results(
        walk_before,
        twin=twin_before,
        naive_path_count=before_path_count,
    )
    res_after = compute_results(
        walk_after,
        twin=twin_after,
        naive_path_count=after_path_count,
    )

    security_delta = _compute_diff(
        res_before,
        res_after,
        before_inventory=inv_before,
        after_inventory=inv_after,
        twin=twin_before,
    )

    # 7. Detect Broken Business Service Flows
    broken_flows, broken_details = detect_broken_flows(
        twin_before,
        applied_impacts,
        catalog=catalog,
    )

    # 8. Compute Decisive Evidence Provenance Confidence
    if n <= 0:
        confidence = Confidence(
            level=LevelStr("Low"),
            score=0.0,
            unknowns=("Simulation trials n=0; results have zero statistical power.",),
            undetermined=True,
        )
    else:
        confidence = compute_confidence(
            before_res=res_before,
            after_res=res_after,
            broken_flows=broken_flows,
            twin=twin_before,
            evidence_map=evidence_map,
        )

    # 9. Verdict Decision Logic & REVIEW Threshold
    has_crit_broken = any(bf.criticality >= 4 for bf in broken_flows)
    has_low_broken = any(bf.criticality < 4 for bf in broken_flows)

    effort_inc = getattr(security_delta, "effort_increase_pct", None)
    ps_delta = getattr(security_delta, "p_success_delta", 0.0)

    # Negligible gain condition must be EXACTLY: effort_increase_pct is not None and < 5 and p_success_delta > -0.02
    is_negligible_gain = (
        effort_inc is not None
        and effort_inc < 5.0
        and ps_delta > -0.02
    )

    recommendation: Literal["DEPLOY", "BLOCK", "REVIEW"]
    if has_crit_broken:
        recommendation = "BLOCK"
    elif (
        has_low_broken
        or confidence.undetermined
        or confidence.level == "Low"
        or is_negligible_gain
        or before_path_count == 0
        or n <= 0
    ):
        recommendation = "REVIEW"
    else:
        recommendation = "DEPLOY"

    # 10. Generate Decision Context
    reasons, assumptions, unknowns, alternatives = generate_decision_context(
        recommendation,
        broken_flows,
        broken_details,
        applied_controls_tuple,
        security_delta,
        res_before,
        res_after,
        confidence,
        is_negligible_gain=is_negligible_gain,
    )

    return ChangeVerdict(
        delta=security_delta,
        broken_flows=broken_flows,
        cost=total_cost,
        confidence=confidence,
        unknowns=unknowns,
        undetermined=confidence.undetermined,
        recommendation=recommendation,
        reasons=reasons,
        alternatives=alternatives,
        twin_id=twin.id,
        controls_applied=applied_controls_tuple,
        before_result=res_before,
        after_result=res_after,
        before_path_count=before_path_count,
        after_path_count=after_path_count,
        broken_flow_details=broken_details,
        assumptions=assumptions,
    )