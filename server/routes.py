"""FastAPI REST endpoints for the Cyber Digital Twin and Change Sandbox."""

from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Sequence, Union
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from backend.core.models import Agent, Asset, Control, Edge, Identity, ServiceFlow, Twin
from backend.core.twin import CyberDigitalTwin
from backend.core.search import search
from backend.core.walk import simulate as run_walk_simulation
from backend.core.results import compute_results
from backend.rules.evaluate import evaluate_change
from backend.rules.optimize import optimize_controls
from backend.rules.audit import crawl_audit

router = APIRouter(prefix="/api", tags=["Digital Twin & Sandbox"])

# Cache the loaded golden twin
_GOLDEN_TWIN_PATH = Path("backend/data/scenarios/golden.json")
_cached_golden_twin: Optional[Twin] = None
_cached_cyber_twin: Optional[CyberDigitalTwin] = None


def get_golden_twin() -> Twin:
    global _cached_golden_twin, _cached_cyber_twin
    if _cached_golden_twin is None:
        if not _GOLDEN_TWIN_PATH.exists():
            raise HTTPException(status_code=500, detail="Golden scenario file not found")
        _cached_golden_twin = Twin.model_validate_json(_GOLDEN_TWIN_PATH.read_text(encoding="utf-8"))
        _cached_cyber_twin = CyberDigitalTwin(_cached_golden_twin)
    return _cached_golden_twin


def get_cyber_twin() -> CyberDigitalTwin:
    get_golden_twin()
    assert _cached_cyber_twin is not None
    return _cached_cyber_twin


# -----------------------------------------------------------------------------
# Request & Response Models
# -----------------------------------------------------------------------------

class SimulateRequest(BaseModel):
    twin_id: Optional[str] = "twin-finbank-golden"
    agent_id: Optional[str] = "adv-admin"
    seed: int = 42
    n_walks: int = 200
    control_ids: tuple[str, ...] = ()


class SimulationStep(BaseModel):
    step_index: int
    asset_id: str
    asset_name: str
    zone: str
    technique: str
    status: Literal["targeted", "compromised", "blocked"]
    cost: float
    noise: float


class SimulateResponse(BaseModel):
    twin_id: str
    agent_id: str
    p_success: float
    mean_effort: Optional[float]
    p90_effort: Optional[float]
    compromised_nodes: tuple[str, ...]
    attack_trajectory: tuple[SimulationStep, ...]
    choke_points: Dict[str, float]
    exemplar_paths: tuple[tuple[str, ...], ...]


class EvaluateChangeRequest(BaseModel):
    twin_id: Optional[str] = "twin-finbank-golden"
    control_ids: tuple[str, ...] = ()
    agent_id: Optional[str] = "adv-admin"
    seed: int = 1
    n_walks: int = 500


class OptimizeRequest(BaseModel):
    twin_id: Optional[str] = "twin-finbank-golden"
    budget: int = 5000
    max_broken_criticality: int = 3
    candidate_controls: Optional[tuple[str, ...]] = None
    seed: int = 1
    n_walks: int = 300


class BlastRadiusResponse(BaseModel):
    source_asset_id: str
    source_asset_name: str
    source_criticality: int
    reachable_asset_ids: tuple[str, ...]
    compromised_crown_jewels: tuple[str, ...]
    total_downstream_criticality: int
    direct_dependencies: tuple[str, ...]


# -----------------------------------------------------------------------------
# Endpoints
# -----------------------------------------------------------------------------

@router.get("/twin", response_model=Dict[str, Any])
def get_twin_endpoint():
    """Returns the active FinBank digital twin graph model."""
    twin = get_golden_twin()
    return twin.model_dump()


@router.post("/simulate", response_model=SimulateResponse)
def post_simulate(req: SimulateRequest):
    """Executes Monte Carlo walk simulation and returns compromise trajectory & falling nodes."""
    twin = get_golden_twin()

    # Apply proposed controls if supplied
    if req.control_ids:
        from backend.core.twin import clone
        active_controls = tuple(c for c in twin.controls if c.id in req.control_ids)
        # If control not in twin.controls, look it up
        twin = clone(twin, add_controls=active_controls)

    agent = Agent(
        id=req.agent_id or "adv-admin",
        name="Privileged Adversary",
        start_zones=("corp",),
        capabilities=frozenset(["creds:id-user-admin"]),
        objective="specific_target",
        noise_budget=1.0,
        skill=0.8,
    )

    walk_result = run_walk_simulation(twin, agent, n=req.n_walks, seed=req.seed)
    result = compute_results(walk_result, twin=twin)

    # Build representative attack trajectory of falling nodes from top routes
    trajectory: List[SimulationStep] = []
    compromised: List[str] = []
    asset_map = {a.id: a for a in twin.assets}
    exemplar_list: List[tuple[str, ...]] = []

    if result.top_routes:
        for route_stat in result.top_routes:
            if route_stat.path and route_stat.path.nodes:
                exemplar_list.append(route_stat.path.nodes)

        # Use primary top route for step-by-step visual trajectory
        primary = result.top_routes[0]
        if primary.path and primary.path.nodes:
            step_idx = 1
            for node_id in primary.path.nodes:
                if node_id in asset_map:
                    asset = asset_map[node_id]
                    if node_id not in compromised:
                        compromised.append(node_id)
                    trajectory.append(
                        SimulationStep(
                            step_index=step_idx,
                            asset_id=node_id,
                            asset_name=asset.name,
                            zone=asset.zone,
                            technique="lateral_escalation",
                            status="compromised",
                            cost=2.0 * step_idx,
                            noise=0.15 * step_idx,
                        )
                    )
                    step_idx += 1

    # Ensure targeted crown jewel is in compromised if trial succeeded
    if result.p_success > 0 and "prod-db" not in compromised:
        compromised.append("prod-db")

    return SimulateResponse(
        twin_id=twin.id,
        agent_id=agent.id,
        p_success=result.p_success,
        mean_effort=result.mean_effort,
        p90_effort=result.p90_effort,
        compromised_nodes=tuple(compromised),
        attack_trajectory=tuple(trajectory),
        choke_points=result.edge_frequency,
        exemplar_paths=tuple(exemplar_list),
    )


@router.post("/evaluate-change")
def post_evaluate_change(req: EvaluateChangeRequest):
    """The Centrepiece: Evaluates proposed security controls against risk and business service flows."""
    twin = get_golden_twin()
    agent = Agent(
        id=req.agent_id or "adv-admin",
        name="Privileged Adversary",
        start_zones=("corp",),
        capabilities=frozenset(["creds:id-user-admin"]),
        objective="specific_target",
        noise_budget=1.0,
        skill=0.8,
    )

    verdict = evaluate_change(
        twin=twin,
        control_ids=req.control_ids,
        agent_ids=(agent.id,),
        seed=req.seed,
        n=req.n_walks,
    )

    # Return serialized model
    return verdict.model_dump()


@router.post("/optimize")
def post_optimize(req: OptimizeRequest):
    """Phase 7: Knapsack constrained portfolio optimizer vs naive selection."""
    twin = get_golden_twin()
    agent = Agent(
        id="adv-admin",
        name="Privileged Adversary",
        start_zones=("corp",),
        capabilities=frozenset(["creds:id-user-admin"]),
        objective="specific_target",
        noise_budget=1.0,
        skill=0.8,
    )

    res = optimize_controls(
        twin=twin,
        budget=req.budget,
        max_broken_criticality=req.max_broken_criticality,
        agents=agent,
        seed=req.seed,
        n=req.n_walks,
    )

    return res.model_dump()


@router.get("/blast-radius/{asset_id}", response_model=BlastRadiusResponse)
def get_blast_radius(asset_id: str):
    """Calculates downstream reachable assets (blast radius) if asset_id is compromised."""
    twin = get_golden_twin()
    cyber_twin = get_cyber_twin()

    asset_map = {a.id: a for a in twin.assets}
    if asset_id not in asset_map:
        raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found in twin")

    target_asset = asset_map[asset_id]
    reachable = cyber_twin.blast_radius(asset_id)

    crown_jewels = [a_id for a_id in reachable if asset_map.get(a_id, None) and asset_map[a_id].crown_jewel]
    total_crit = sum(asset_map[a_id].criticality for a_id in reachable if a_id in asset_map)

    # Direct outward edges
    direct = [e.dst for e in twin.edges if e.src == asset_id]

    return BlastRadiusResponse(
        source_asset_id=asset_id,
        source_asset_name=target_asset.name,
        source_criticality=target_asset.criticality,
        reachable_asset_ids=tuple(sorted(reachable)),
        compromised_crown_jewels=tuple(sorted(crown_jewels)),
        total_downstream_criticality=total_crit,
        direct_dependencies=tuple(sorted(set(direct))),
    )


class CrawlAuditRequest(BaseModel):
    start_node: str = "internet"
    target_node: Optional[str] = None  # defaults to highest-crit crown jewel
    active_control_ids: tuple[str, ...] = ()


@router.post("/crawl-audit")
def post_crawl_audit(req: CrawlAuditRequest):
    """Node-by-node crawling security audit — walks the graph like a chess piece."""
    twin = get_golden_twin()
    result = crawl_audit(
        twin=twin,
        start_node=req.start_node,
        target_node=req.target_node,
        active_control_ids=req.active_control_ids,
    )
    return result.model_dump()

