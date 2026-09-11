"""Phase 8: Constrained Security-Control Portfolio Optimizer (v2.1).

Answers:
"Given a catalogue of available security controls and a budget, which combination
of controls provides the greatest risk reduction without breaking critical business flows?"

Features:
- Exhaustive evaluation of all 2^N candidate subsets (up to 10 controls -> 1024 subsets)
- Strict budget enforcement (sum(c.cost) <= budget)
- Hard critical business flow safety constraint (no broken flow with criticality >= 4)
- Maximum risk reduction objective based on the Phase 5/6 weighted risk model
- Deterministic tie-breaking (risk reduction desc, total cost asc, control count asc, IDs asc)
- No monotonic pruning or greedy shortcuts: all candidate subsets are evaluated
- Monte Carlo walk validation (evaluate_change) run strictly for the winning portfolio
- Ranked safe alternatives within budget
"""

from itertools import combinations
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Sequence, Tuple, Union
from pydantic import BaseModel, Field, computed_field

from backend.core.models import Agent, Asset, Control, ServiceFlow, Twin
from backend.core.twin import clone
from backend.rules.loader import TechniqueDefinition, load_techniques_map
from backend.rules.compile import ControlImpact, ControlSelector, compile_twin
from backend.rules.evaluate import (
    ChangeVerdict,
    detect_broken_flows,
    evaluate_change,
    _control_to_impact_with_exceptions,
)

if TYPE_CHECKING:
    from backend.core.search import Inventory
    from backend.core.walk import EvaluatedRoute


MAX_CATALOGUE_SIZE = 10


# =====================================================================
# 1. Models
# =====================================================================

class CandidateEvaluation(BaseModel, frozen=True):
    """Evaluation summary for a candidate control portfolio subset."""

    control_ids: tuple[str, ...]
    controls: tuple[Control, ...]
    total_cost: int
    risk: float
    risk_reduction: float
    broken_flows: tuple[ServiceFlow, ...] = ()
    is_safe: bool = True
    rejection_reason: Optional[str] = None

    @property
    def cost(self) -> int:
        return self.total_cost


class Portfolio(BaseModel, frozen=True):
    """Optimized security control portfolio satisfying budget and operational continuity."""

    selected_control_ids: tuple[str, ...]
    selected_controls: tuple[Control, ...]
    total_cost: int
    budget: int
    risk_before: float
    risk_after: float
    risk_reduction: float
    broken_flows: tuple[ServiceFlow, ...] = ()
    is_safe: bool = True
    verdict: Optional[ChangeVerdict] = None
    alternatives: tuple[CandidateEvaluation, ...] = ()
    all_evaluated_count: int = 0
    safe_evaluated_count: int = 0
    evaluated_subsets: tuple[tuple[str, ...], ...] = ()
    all_evaluations: tuple[CandidateEvaluation, ...] = ()

    @computed_field
    @property
    def subsets_evaluated(self) -> int:
        """Total number of candidate subsets evaluated during optimization."""
        return self.all_evaluated_count

    @property
    def controls(self) -> tuple[Control, ...]:
        return self.selected_controls

    @property
    def control_ids(self) -> tuple[str, ...]:
        return self.selected_control_ids

    @property
    def cost(self) -> int:
        return self.total_cost

    @property
    def recommendation(self) -> str:
        if self.verdict is not None:
            return self.verdict.recommendation
        return "DEPLOY" if self.is_safe else "BLOCK"


# =====================================================================
# 2. Optimizer Engine
# =====================================================================

def optimize(
    twin: Twin,
    budget: int,
    agents: Optional[Union[Agent, str, Sequence[Union[Agent, str]]]] = None,
    *,
    controls: Optional[Sequence[Union[Control, ControlImpact, str]]] = None,
    candidate_controls: Optional[Sequence[Union[Control, ControlImpact, str]]] = None,
    target: Optional[Union[Asset, str]] = None,
    seed: int = 1,
    n_walks: int = 1000,
    catalog: Optional[Dict[str, TechniqueDefinition]] = None,
    top_alternatives_limit: int = 3,
    **kwargs: Any,
) -> Portfolio:
    """Optimize security control portfolio selection under budget and business flow constraints.

    Parameters
    ----------
    twin : Twin
        Digital twin environment model.
    budget : int
        Maximum allowable total financial cost of controls.
    agents : Optional[Union[Agent, str, Sequence[Union[Agent, str]]]]
        Adversary agent profile(s). Defaults to standard threat actor.
    controls : Optional[Sequence[Union[Control, ControlImpact, str]]]
        Candidate controls catalogue. Defaults to candidate_controls or twin.controls.
    candidate_controls : Optional[Sequence[Union[Control, ControlImpact, str]]]
        Alias for controls.
    target : Optional[Union[Asset, str]]
        Target crown-jewel asset. Defaults to auto-resolved crown jewel (e.g. 'prod-db').
    seed : int
        Deterministic seed for reproducible Monte Carlo simulation of the winner.
    n_walks : int
        Number of Monte Carlo simulation walks for final winner validation.
    catalog : Optional[Dict[str, TechniqueDefinition]]
        MITRE ATT&CK technique catalog.
    top_alternatives_limit : int
        Number of runner-up safe alternatives to return.

    Returns
    -------
    Portfolio
        Optimal safe portfolio maximizing risk reduction without breaking critical business flows.

    Raises
    ------
    ValueError
        If candidate controls catalogue exceeds MAX_CATALOGUE_SIZE (10).
    """
    if catalog is None:
        catalog = load_techniques_map()

    # 1. Resolve Candidate Controls Catalogue
    raw_candidates: Sequence[Union[Control, ControlImpact, str]]
    if candidate_controls is not None:
        raw_candidates = candidate_controls
    elif controls is not None:
        raw_candidates = controls
    else:
        raw_candidates = twin.controls

    # Normalize candidate controls to Control and ControlImpact objects
    twin_ctrls_map = {c.id: c for c in twin.controls}
    resolved_candidates: List[Control] = []
    applied_flow_impacts: Dict[str, ControlImpact] = {}
    applied_attack_impacts: Dict[str, ControlImpact] = {}

    twin_asset_ids = {a.id for a in twin.assets}

    for c in raw_candidates:
        if isinstance(c, ControlImpact):
            ctrl_obj = Control(
                id=c.id,
                name=c.name,
                cost=getattr(c, "cost", 1000),
                blocks=tuple(c.selector.techniques) or ("network_segmentation",),
                scope=tuple(c.selector.dst_assets) or tuple(c.selector.src_assets),
                efficacy=c.efficacy,
            )
            resolved_candidates.append(ctrl_obj)
            applied_flow_impacts[c.id] = c
            applied_attack_impacts[c.id] = c
        elif isinstance(c, Control):
            resolved_candidates.append(c)
            if not c.blocks:
                flow_imp = ControlImpact(
                    id=c.id,
                    name=c.name,
                    selector=ControlSelector(techniques=("__no_op__",)),
                    efficacy=c.efficacy,
                    breaks_flows=False,
                )
                applied_flow_impacts[c.id] = flow_imp
                applied_attack_impacts[c.id] = flow_imp
            else:
                flow_imp = _control_to_impact_with_exceptions(c, twin, catalog)
                applied_flow_impacts[c.id] = flow_imp

                # For host-level defensive agents (EDR, Credential Guard), monitor outbound execution from host
                c_blocks_lower = {b.lower() for b in c.blocks}
                c_id_lower = c.id.lower()
                c_name_lower = c.name.lower()
                if (
                    "edr" in c_blocks_lower
                    or "edr" in c_id_lower
                    or "edr" in c_name_lower
                    or "credential_guard" in c_blocks_lower
                    or "credguard" in c_id_lower
                    or "credential" in c_name_lower
                ):
                    scope_assets = tuple(s for s in c.scope if s in twin_asset_ids) or tuple(c.scope)
                    expanded_techs = set(flow_imp.selector.techniques)
                    expanded_techs.update(["rdp_lateral", "ssh_lateral", "smb_lateral", "cred_dump", "priv_esc_local"])
                    applied_attack_impacts[c.id] = ControlImpact(
                        id=c.id,
                        name=c.name,
                        selector=ControlSelector(
                            techniques=tuple(sorted(expanded_techs)),
                            src_assets=scope_assets,
                        ),
                        exceptions=tuple(getattr(c, "exceptions", ())),
                        efficacy=c.efficacy,
                        breaks_flows=False,
                    )
                else:
                    applied_attack_impacts[c.id] = flow_imp
        elif isinstance(c, str):
            if c in twin_ctrls_map:
                existing_c = twin_ctrls_map[c]
                if isinstance(existing_c, ControlImpact):
                    ctrl_obj = Control(
                        id=existing_c.id,
                        name=existing_c.name,
                        cost=getattr(existing_c, "cost", 1000),
                        blocks=tuple(existing_c.selector.techniques) or ("network_segmentation",),
                        scope=tuple(existing_c.selector.dst_assets) or tuple(existing_c.selector.src_assets),
                        efficacy=existing_c.efficacy,
                    )
                    resolved_candidates.append(ctrl_obj)
                    applied_flow_impacts[c] = existing_c
                    applied_attack_impacts[c] = existing_c
                else:
                    resolved_candidates.append(existing_c)
                    flow_imp = _control_to_impact_with_exceptions(existing_c, twin, catalog)
                    applied_flow_impacts[c] = flow_imp

                    c_blocks_lower = {b.lower() for b in existing_c.blocks}
                    c_id_lower = existing_c.id.lower()
                    c_name_lower = existing_c.name.lower()
                    if (
                        "edr" in c_blocks_lower
                        or "edr" in c_id_lower
                        or "edr" in c_name_lower
                        or "credential_guard" in c_blocks_lower
                        or "credguard" in c_id_lower
                        or "credential" in c_name_lower
                    ):
                        scope_assets = tuple(s for s in existing_c.scope if s in twin_asset_ids) or tuple(existing_c.scope)
                        expanded_techs = set(flow_imp.selector.techniques)
                        expanded_techs.update(["rdp_lateral", "ssh_lateral", "smb_lateral", "cred_dump", "priv_esc_local"])
                        applied_attack_impacts[c] = ControlImpact(
                            id=existing_c.id,
                            name=existing_c.name,
                            selector=ControlSelector(
                                techniques=tuple(sorted(expanded_techs)),
                                src_assets=scope_assets,
                            ),
                            exceptions=tuple(getattr(existing_c, "exceptions", ())),
                            efficacy=existing_c.efficacy,
                            breaks_flows=False,
                        )
                    else:
                        applied_attack_impacts[c] = flow_imp
            else:
                placeholder = Control(
                    id=c,
                    name=f"Control {c}",
                    cost=1000,
                    blocks=(c,),
                    scope=(),
                    efficacy=0.90,
                )
                resolved_candidates.append(placeholder)
                flow_imp = _control_to_impact_with_exceptions(placeholder, twin, catalog)
                applied_flow_impacts[c] = flow_imp
                applied_attack_impacts[c] = flow_imp

    # Enforce catalogue size limit (<= 10 controls -> max 1024 subsets)
    if len(resolved_candidates) > MAX_CATALOGUE_SIZE:
        raise ValueError(
            f"Candidate control catalogue exceeds maximum supported size of "
            f"{MAX_CATALOGUE_SIZE} controls (got {len(resolved_candidates)})."
        )

    # 2. Normalize Target and Adversary Agent
    resolved_target: Optional[str] = target.id if isinstance(target, Asset) else target
    if resolved_target is None:
        crown_jewels = [a.id for a in twin.assets if getattr(a, "crown_jewel", False)]
        if "prod-db" in crown_jewels:
            resolved_target = "prod-db"
        elif crown_jewels:
            resolved_target = crown_jewels[0]
        elif any(a.id == "prod-db" for a in twin.assets):
            resolved_target = "prod-db"

    target_criticality: int = 1
    if resolved_target is not None:
        target_asset = next((a for a in twin.assets if a.id == resolved_target), None)
        if target_asset is not None:
            target_criticality = target_asset.criticality
        else:
            crown_jewels = [a for a in twin.assets if getattr(a, "crown_jewel", False)]
            if crown_jewels:
                target_criticality = max(a.criticality for a in crown_jewels)

    resolved_agent: Agent
    if agents is None:
        resolved_agent = Agent(
            id="adv-default",
            name="Default Adversary",
            start_zones=("dmz", "corp"),
            capabilities=frozenset(["creds:id-user-admin"]),
            objective="specific_target",
            noise_budget=1.0,
            skill=0.8,
        )
    elif isinstance(agents, Agent):
        resolved_agent = agents
    elif isinstance(agents, str):
        caps = frozenset(["creds:id-user-admin"]) if ("admin" in agents.lower()) else frozenset()
        resolved_agent = Agent(
            id=agents,
            name=f"Adversary {agents}",
            start_zones=("corp", "dmz"),
            capabilities=caps,
            objective="specific_target",
            noise_budget=1.0,
            skill=0.8,
        )
    else:
        first_agent = list(agents)[0] if agents else None
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
                id="adv-default",
                name="Default Adversary",
                start_zones=("dmz", "corp"),
                capabilities=frozenset(["creds:id-user-admin"]),
                objective="specific_target",
                noise_budget=1.0,
                skill=0.8,
            )

    # 3. Clean Baseline Twin and Baseline Risk Calculation
    # Local imports break circular import dependencies
    from backend.core.search import Inventory, search
    from backend.core.walk import EvaluatedRoute, evaluate_routes
    from backend.core.results import compute_weighted_risk

    # Baseline twin has none of the candidate or scenario uncommitted controls applied
    cand_ids_set = {c.id for c in resolved_candidates} | {c.id for c in twin.controls}
    twin_baseline = clone(twin, remove_controls=cand_ids_set)

    compiled_baseline = compile_twin(twin_baseline, catalog=catalog, control_impacts=[])
    inv_baseline: Inventory = search(
        compiled_baseline,
        resolved_agent,
        target=resolved_target,
        assets=twin_baseline,
    )
    routes_baseline: Sequence[EvaluatedRoute] = evaluate_routes(inv_baseline, resolved_agent, k=5)
    baseline_risk: float = compute_weighted_risk(routes_baseline, target_criticality)

    # 4. Exhaustive Subset Enumeration (ALL 2^N subsets evaluated without monotonic pruning)
    n_controls = len(resolved_candidates)
    total_subsets_to_evaluate = 1 << n_controls

    all_evaluated_subsets: List[tuple[str, ...]] = []
    all_evaluations: List[CandidateEvaluation] = []
    safe_evaluations: List[CandidateEvaluation] = []

    for r in range(n_controls + 1):
        for subset in combinations(resolved_candidates, r):
            subset_controls = tuple(subset)
            subset_ids = tuple(c.id for c in subset_controls)
            all_evaluated_subsets.append(subset_ids)
            total_cost = sum(c.cost for c in subset_controls)

            # A. Check Budget Constraint
            if total_cost > budget:
                # Exceeds budget -> rejected
                all_evaluations.append(
                    CandidateEvaluation(
                        control_ids=subset_ids,
                        controls=subset_controls,
                        total_cost=total_cost,
                        risk=baseline_risk,
                        risk_reduction=0.0,
                        broken_flows=(),
                        is_safe=False,
                        rejection_reason="budget_exceeded",
                    )
                )
                continue

            # B. Check Critical Business Flow Safety (Hard Constraint)
            # Evaluate using applied flow impacts (respecting exceptions & channel projections)
            subset_flow_impacts = [applied_flow_impacts[c.id] for c in subset_controls]
            broken_flows, _ = detect_broken_flows(
                twin_baseline,
                subset_flow_impacts,
                catalog=catalog,
            )

            has_critical_breakage = any(f.criticality >= 4 for f in broken_flows)
            if has_critical_breakage:
                # Breaks a critical flow -> hard rejected
                all_evaluations.append(
                    CandidateEvaluation(
                        control_ids=subset_ids,
                        controls=subset_controls,
                        total_cost=total_cost,
                        risk=baseline_risk,
                        risk_reduction=0.0,
                        broken_flows=broken_flows,
                        is_safe=False,
                        rejection_reason="critical_flow_broken",
                    )
                )
                continue

            # C. Evaluate Risk on Valid Safe Portfolio
            if not subset_controls:
                # Empty portfolio baseline
                cand_risk = baseline_risk
                cand_reduction = 0.0
            else:
                # Apply candidate attack impacts and compute deterministic weighted risk
                twin_cand = clone(twin_baseline, add_controls=subset_controls)
                subset_attack_impacts = [applied_attack_impacts[c.id] for c in subset_controls]
                compiled_cand = compile_twin(
                    twin_cand,
                    catalog=catalog,
                    control_impacts=subset_attack_impacts,
                )
                inv_cand: Inventory = search(
                    compiled_cand,
                    resolved_agent,
                    target=resolved_target,
                    assets=twin_cand,
                )
                routes_cand: Sequence[EvaluatedRoute] = evaluate_routes(inv_cand, resolved_agent, k=5)
                cand_risk = compute_weighted_risk(routes_cand, target_criticality)
                cand_reduction = round(baseline_risk - cand_risk, 6)

            eval_cand = CandidateEvaluation(
                control_ids=subset_ids,
                controls=subset_controls,
                total_cost=total_cost,
                risk=cand_risk,
                risk_reduction=cand_reduction,
                broken_flows=broken_flows,
                is_safe=True,
            )
            all_evaluations.append(eval_cand)
            safe_evaluations.append(eval_cand)

    all_evaluated_count = len(all_evaluated_subsets)
    safe_evaluated_count = len(safe_evaluations)

    # 5. Deterministic Selection of Optimal Winning Portfolio
    # Non-empty safe portfolios within budget are prioritized over doing nothing
    safe_candidates = [e for e in safe_evaluations if len(e.control_ids) > 0]

    # Sort safe portfolios:
    # 1. risk_reduction descending (maximize reduction)
    # 2. total_cost ascending (minimize financial cost)
    # 3. number of controls ascending (simpler portfolio)
    # 4. control IDs ascending (deterministic lexicographical tie-break)
    if safe_candidates:
        safe_candidates.sort(
            key=lambda e: (
                -e.risk_reduction,
                e.total_cost,
                len(e.control_ids),
                e.control_ids,
            )
        )
        winner = safe_candidates[0]
    else:
        # Fallback to safe baseline (empty portfolio)
        winner = CandidateEvaluation(
            control_ids=(),
            controls=(),
            total_cost=0,
            risk=baseline_risk,
            risk_reduction=0.0,
            broken_flows=(),
            is_safe=True,
        )

    # 6. Monte Carlo Walk Simulation strictly for the Winner
    winning_verdict = evaluate_change(
        twin=twin_baseline,
        control_ids=winner.controls,
        agent_ids=resolved_agent,
        seed=seed,
        n=n_walks,
        target=resolved_target,
        catalog=catalog,
    )

    # 7. Collect Ranked Safe Alternatives
    runner_ups: List[CandidateEvaluation] = []
    for cand in safe_candidates:
        if cand.control_ids != winner.control_ids:
            runner_ups.append(cand)
            if len(runner_ups) >= top_alternatives_limit:
                break

    if len(runner_ups) < top_alternatives_limit and winner.control_ids != ():
        empty_eval = next((e for e in safe_evaluations if len(e.control_ids) == 0), None)
        if empty_eval is not None:
            runner_ups.append(empty_eval)

    return Portfolio(
        selected_control_ids=winner.control_ids,
        selected_controls=winner.controls,
        total_cost=winner.total_cost,
        budget=budget,
        risk_before=baseline_risk,
        risk_after=winner.risk,
        risk_reduction=winner.risk_reduction,
        broken_flows=winner.broken_flows,
        is_safe=True,
        verdict=winning_verdict,
        alternatives=tuple(runner_ups),
        all_evaluated_count=all_evaluated_count,
        safe_evaluated_count=safe_evaluated_count,
        evaluated_subsets=tuple(all_evaluated_subsets),
        all_evaluations=tuple(all_evaluations),
    )


def optimize_controls(
    twin: Twin,
    candidate_controls: Optional[Sequence[Union[Control, ControlImpact, str]]] = None,
    budget: int = 0,
    agents: Optional[Union[Agent, str, Sequence[Union[Agent, str]]]] = None,
    **kwargs: Any,
) -> Portfolio:
    """Canonical alias for optimize() matching Phase 6 handover specifications."""
    return optimize(
        twin=twin,
        budget=budget,
        agents=agents,
        candidate_controls=candidate_controls,
        **kwargs,
    )
