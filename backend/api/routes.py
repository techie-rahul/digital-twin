"""
FastAPI route handlers for all 8 Digital Twin API endpoints.

Endpoints (from CLAUDE.md §9 / INTERFACES.md):

    GET  /twin/{id}
    POST /twin/{id}/clone
    POST /simulate
    POST /evaluate-change     ← centrepiece — LIVE (Person 2 evaluate.py wired)
    POST /optimize            ← stub until Phase 7
    GET  /matrix/{twin_id}    ← stub until Phase 7
    GET  /blast-radius/{asset_id}
    GET  /lineage/{twin_id}

Business logic stays in backend/core/ and backend/rules/.
This file is glue only.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request

from backend.core.models import Agent, Control
from backend.core.twin import CyberDigitalTwin
from backend.core.walk import simulate
from backend.core.results import compute_results
from backend.rules.compile import compile_twin
from backend.rules.evaluate import evaluate_change as _real_evaluate_change

from backend.api import cache as result_cache
from backend.api.schemas import (
    AssetOut, BlastRadiusOut, CloneOut, CloneRequest, ControlOut,
    EdgeOut, EvaluateChangeRequest, EvaluatedRouteOut, HealthOut,
    IdentityOut, LineageNodeOut, LineageOut, OptimizeRequest,
    ServiceFlowOut, SimulateOut, SimulateRequest, TwinOut,
)
from backend.api.stubs import stub_matrix, stub_optimize

router = APIRouter()


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _get_twin(request: Request, twin_id: str) -> CyberDigitalTwin:
    """Resolve a twin_id from the app-state registry. Raises 404 if missing."""
    registry: Dict[str, CyberDigitalTwin] = request.app.state.twin_registry
    if twin_id not in registry:
        raise HTTPException(
            status_code=404,
            detail=f"Twin '{twin_id}' not found. Available: {list(registry.keys())}",
        )
    return registry[twin_id]


def _get_agent(dt: CyberDigitalTwin, agent_id: str) -> Agent:
    """Find an Agent by id inside a Twin. Raises 404 if missing."""
    for a in dt.twin.assets:
        pass  # assets are not agents; agents are on dt.twin directly via identities
    # Agents are stored separately in app.state — look there
    raise HTTPException(
        status_code=404,
        detail=f"Agent '{agent_id}' not found.",
    )


def _resolve_agent(request: Request, agent_id: str) -> Agent:
    agents: Dict[str, Agent] = request.app.state.agent_registry
    if agent_id not in agents:
        raise HTTPException(
            status_code=404,
            detail=f"Agent '{agent_id}' not found. Available: {list(agents.keys())}",
        )
    return agents[agent_id]


def _twin_to_out(dt: CyberDigitalTwin) -> TwinOut:
    twin = dt.twin
    return TwinOut(
        id=twin.id,
        parent_id=twin.parent_id,
        hash=dt.hash(),
        asset_count=dt.asset_count,
        identity_count=dt.identity_count,
        edge_count=dt.edge_count,
        flow_count=dt.flow_count,
        control_count=dt.control_count,
        assets=[
            AssetOut(
                id=a.id, name=a.name, kind=a.kind,
                zone=a.zone, criticality=a.criticality,
                crown_jewel=a.crown_jewel,
            )
            for a in twin.assets
        ],
        identities=[
            IdentityOut(id=i.id, name=i.name, kind=i.kind, tier=i.tier)
            for i in twin.identities
        ],
        edges=[EdgeOut(src=e.src, dst=e.dst, technique=e.technique) for e in twin.edges],
        flows=[
            ServiceFlowOut(
                id=f.id, name=f.name, src=f.src, dst=f.dst,
                technique=f.technique, criticality=f.criticality,
            )
            for f in twin.flows
        ],
        controls=[
            ControlOut(
                id=c.id, name=c.name, cost=c.cost,
                blocks=list(c.blocks), scope=list(c.scope),
                efficacy=c.efficacy,
            )
            for c in twin.controls
        ],
    )


# ─────────────────────────────────────────────
# GET /
# ─────────────────────────────────────────────

@router.get("/", response_model=HealthOut, tags=["Health"])
def health(request: Request) -> HealthOut:
    """Health check — confirms the server is alive and reports the loaded golden twin."""
    registry: Dict[str, CyberDigitalTwin] = request.app.state.twin_registry
    golden = request.app.state.golden_twin
    return HealthOut(
        status="ok",
        golden_twin_id=golden.id if golden else None,
        golden_hash=golden.hash()[:16] if golden else None,
        cache_size=result_cache.size(),
    )


# ─────────────────────────────────────────────
# GET /twin/{id}
# ─────────────────────────────────────────────

@router.get("/twin/{twin_id}", response_model=TwinOut, tags=["Twin"])
def get_twin(twin_id: str, request: Request) -> TwinOut:
    """Return full serialized Twin including assets, identities, edges, flows, and controls."""
    dt = _get_twin(request, twin_id)
    return _twin_to_out(dt)


# ─────────────────────────────────────────────
# POST /twin/{id}/clone
# ─────────────────────────────────────────────

@router.post("/twin/{twin_id}/clone", response_model=CloneOut, tags=["Twin"])
def clone_twin(twin_id: str, body: CloneRequest, request: Request) -> CloneOut:
    """
    Clone a Twin with control mutations applied.
    The cloned twin is registered in the session registry under its new ID.
    """
    dt = _get_twin(request, twin_id)
    registry: Dict[str, CyberDigitalTwin] = request.app.state.twin_registry

    # Resolve controls to add from the base twin's control catalogue
    control_map = {c.id: c for c in dt.twin.controls}
    add_controls = []
    for cid in body.control_ids_to_add:
        if cid not in control_map:
            raise HTTPException(status_code=400, detail=f"Control '{cid}' not defined in twin '{twin_id}'.")
        add_controls.append(control_map[cid])

    cloned_dt = dt.clone(
        new_id=body.new_id,
        add_controls=add_controls,
        remove_controls=body.control_ids_to_remove,
    )

    # Register cloned twin so subsequent simulate/blast-radius calls can reference it
    registry[cloned_dt.id] = cloned_dt

    return CloneOut(
        original_id=twin_id,
        cloned_id=cloned_dt.id,
        parent_id=cloned_dt.twin.parent_id or twin_id,
        hash=cloned_dt.hash(),
        asset_count=cloned_dt.asset_count,
        edge_count=cloned_dt.edge_count,
        control_count=cloned_dt.control_count,
    )


# ─────────────────────────────────────────────
# POST /simulate
# ─────────────────────────────────────────────

@router.post("/simulate", response_model=SimulateOut, tags=["Simulation"])
def run_simulate(body: SimulateRequest, request: Request) -> SimulateOut:
    """
    Run the plan-then-execute adversary simulation against a Twin.

    Search runs ONCE; walk loop runs n trials. Results are cached by
    (twin_hash, agent_id, seed, n) — identical requests return instantly.
    """
    dt = _get_twin(request, body.twin_id)
    agent = _resolve_agent(request, body.agent_id)

    twin_hash = dt.hash()
    cached = result_cache.get(twin_hash, body.agent_id, body.seed, body.n)
    if cached is not None:
        return _result_to_out(cached, cached=True)

    result = simulate(
        dt,
        agent,
        n=body.n,
        seed=body.seed,
        target=body.target,
    )
    # Phase 5: enrich raw walk result with Wilson CI, p90, route frequencies, weighted risk
    enriched = compute_results(result, twin=dt.twin)
    result_cache.put(twin_hash, body.agent_id, body.seed, body.n, enriched)
    return _result_to_out(enriched, cached=False)


def _result_to_out(result: Any, cached: bool = False) -> SimulateOut:
    """Serialise either a walk.Result or results.Result into SimulateOut."""
    routes_out = []
    # results.Result uses .top_routes (RouteStat); walk.Result uses .candidate_routes (EvaluatedRoute)
    candidate_iter = getattr(result, "top_routes", None) or getattr(result, "candidate_routes", ())
    for er in candidate_iter:
        # RouteStat has er.path (Optional[AttackPath]); EvaluatedRoute has er.path directly
        path_obj = getattr(er, "path", None)
        nodes = list(path_obj.nodes) if path_obj is not None else []
        routes_out.append(
            EvaluatedRouteOut(
                route_id=er.route_id,
                nodes=nodes,
                p_route=er.p_route,
                effort_score=er.effort_score,
                noise=er.noise,
                utility=er.utility,
                selection_prob=getattr(er, "selection_prob", getattr(er, "p_select", 0.0)),
            )
        )
    return SimulateOut(
        twin_id=result.twin_id,
        agent_id=result.agent_id,
        target=result.target,
        n=result.n,
        seed=result.seed,
        p_success=result.p_success,
        mean_effort=result.mean_effort,
        mean_noise=result.mean_noise,
        detection_rate=result.detection_rate,
        success_count=result.success_count,
        failure_count=result.failure_count,
        candidate_routes=routes_out,
        cached=cached,
    )


# ─────────────────────────────────────────────
# POST /evaluate-change
# ─────────────────────────────────────────────

@router.post("/evaluate-change", tags=["Decision"])
def evaluate_change(body: EvaluateChangeRequest, request: Request) -> Dict[str, Any]:
    """
    Propose a set of security controls and receive a ChangeVerdict:
    verdict (BLOCK/REVIEW/DEPLOY), broken business flows, confidence score,
    risk delta, effort delta, and alternatives.

    Uses Person 2's backend.rules.evaluate.evaluate_change() — LIVE.
    """
    dt = _get_twin(request, body.twin_id)
    agent_registry: Dict[str, Agent] = request.app.state.agent_registry

    # Resolve agent objects from string IDs (fall back to string if not in registry)
    agent_ids = [
        agent_registry.get(aid, aid) for aid in body.agent_ids
    ] if body.agent_ids else []

    verdict = _real_evaluate_change(
        twin=dt.twin,
        control_ids=body.control_ids,
        agent_ids=agent_ids,
        seed=body.seed,
        n=body.n,
    )

    return verdict.model_dump()


# ─────────────────────────────────────────────
# POST /optimize
# ─────────────────────────────────────────────

@router.post("/optimize", tags=["Decision"])
def optimize(body: OptimizeRequest, request: Request) -> Dict[str, Any]:
    """
    Return the optimal control portfolio under a budget constraint.
    Exhaustive search over ≤1024 subsets (≤10 controls).

    CURRENT STATUS: Stubbed — wires to Phase 7 optimizer when delivered.
    """
    _get_twin(request, body.twin_id)

    # TODO: Replace with:
    #   from backend.core.optimizer import optimize as _optimize
    #   return _optimize(dt.twin, body.budget, body.agent_ids, seed=body.seed)
    return stub_optimize(
        twin_id=body.twin_id,
        budget=body.budget,
        agent_ids=body.agent_ids,
    )


# ─────────────────────────────────────────────
# GET /matrix/{twin_id}
# ─────────────────────────────────────────────

@router.get("/matrix/{twin_id}", tags=["Decision"])
def get_matrix(twin_id: str, request: Request) -> Dict[str, Any]:
    """
    Return a controls × agents risk-reduction matrix.

    CURRENT STATUS: Stubbed — wires to real computation in Phase 7.
    """
    _get_twin(request, twin_id)

    # TODO: Wire to real matrix computation
    return stub_matrix(twin_id=twin_id)


# ─────────────────────────────────────────────
# GET /blast-radius/{asset_id}
# ─────────────────────────────────────────────

@router.get("/blast-radius/{asset_id}", response_model=BlastRadiusOut, tags=["Analysis"])
def blast_radius(asset_id: str, request: Request, twin_id: str = "twin-finbank-golden") -> BlastRadiusOut:
    """
    Compute blast radius: all nodes reachable from asset_id if it is compromised.
    Uses nx.descendants on the existing graph — no re-implementation here.

    Query param ?twin_id= selects the twin (defaults to golden).
    """
    dt = _get_twin(request, twin_id)
    reachable: set = dt.blast_radius(asset_id)

    if asset_id not in dt.graph and not reachable:
        # blast_radius returns empty set for unknown nodes — be helpful
        raise HTTPException(
            status_code=404,
            detail=f"Asset '{asset_id}' not found in twin '{twin_id}'.",
        )

    # Crown jewels among reachable nodes
    crown_jewels = [
        nid for nid in reachable
        if dt.graph.nodes.get(nid, {}).get("crown_jewel", False)
    ]

    return BlastRadiusOut(
        twin_id=twin_id,
        asset_id=asset_id,
        reachable=sorted(reachable),
        reachable_count=len(reachable),
        crown_jewels_reachable=crown_jewels,
    )


# ─────────────────────────────────────────────
# GET /lineage/{twin_id}
# ─────────────────────────────────────────────

@router.get("/lineage/{twin_id}", response_model=LineageOut, tags=["Twin"])
def lineage(twin_id: str, request: Request) -> LineageOut:
    """
    Return the parent/child lineage chain for a twin.
    Traverses twin_registry following parent_id links.
    """
    registry: Dict[str, CyberDigitalTwin] = request.app.state.twin_registry
    if twin_id not in registry:
        raise HTTPException(status_code=404, detail=f"Twin '{twin_id}' not found.")

    chain: List[LineageNodeOut] = []
    current_id: Optional[str] = twin_id

    visited = set()
    while current_id and current_id not in visited:
        visited.add(current_id)
        if current_id not in registry:
            break
        dt = registry[current_id]
        chain.append(LineageNodeOut(
            twin_id=dt.id,
            parent_id=dt.twin.parent_id,
            hash=dt.hash()[:16],
        ))
        current_id = dt.twin.parent_id

    return LineageOut(twin_id=twin_id, lineage=chain)
