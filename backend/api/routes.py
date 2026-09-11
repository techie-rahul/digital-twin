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

import json
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, Response

from backend.core.models import Agent, Asset, Control, Edge, Identity, ServiceFlow, Twin
from backend.core.twin import CyberDigitalTwin, canonical_twin_dict
from backend.core.walk import simulate
from backend.core.results import compute_results
from backend.core.blast_radius import calculate_blast_radius
from backend.rules.compile import compile_twin
from backend.rules.evaluate import evaluate_change as _real_evaluate_change
from backend.rules.optimize import optimize as real_optimize
from backend.rules.audit import crawl_audit, CrawlAuditResult

from backend.api import cache as result_cache
from backend.api.schemas import (
    AssetOut, BlastRadiusOut, CloneOut, CloneRequest, ControlOut,
    CrawlAuditRequest, EdgeOut, EvaluateChangeRequest, EvaluatedRouteOut, HealthOut,
    IdentityOut, LineageNodeOut, LineageOut, OptimizeRequest,
    ServiceFlowOut, SimulateOut, SimulateRequest, TwinOut,
)
from backend.api.stubs import stub_matrix

router = APIRouter()


# ─────────────────────────────────────────────
# Helpers
def _scan_and_register_scenarios(registry: Dict[str, CyberDigitalTwin]) -> None:
    """Scan backend/data/scenarios for any scenarios not yet in the active registry."""
    scenarios_dir = Path(__file__).parent.parent / "data" / "scenarios"
    if scenarios_dir.exists():
        for p in scenarios_dir.glob("*.json"):
            if p.name == "benchmarks.json":
                continue
            try:
                dt = CyberDigitalTwin.from_file(p)
                if dt.id not in registry:
                    registry[dt.id] = dt
            except Exception:
                pass


def _get_twin(request: Request, twin_id: str) -> CyberDigitalTwin:
    """Resolve a twin_id from the app-state registry. Dynamically discovers newly added scenarios."""
    registry: Dict[str, CyberDigitalTwin] = request.app.state.twin_registry
    if twin_id not in registry:
        _scan_and_register_scenarios(registry)
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


def _resolve_agent(request: Request, agent_id: str, dt: Optional[CyberDigitalTwin] = None) -> Agent:
    agents: Dict[str, Agent] = request.app.state.agent_registry
    if agent_id not in agents:
        raise HTTPException(
            status_code=404,
            detail=f"Agent '{agent_id}' not found. Available: {list(agents.keys())}",
        )
    base_agent = agents[agent_id]
    if dt is not None:
        creds = set(base_agent.capabilities)
        for ident in dt.twin.identities:
            creds.add(f"creds:{ident.id}")
        creds.add("creds:who")
        return Agent(
            id=base_agent.id,
            name=base_agent.name,
            start_zones=base_agent.start_zones,
            capabilities=frozenset(creds),
            objective=base_agent.objective,
            noise_budget=base_agent.noise_budget,
            skill=base_agent.skill,
        )
    return base_agent


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

DIST_INDEX = Path(__file__).parent.parent.parent / "dashboard" / "dist" / "index.html"

@router.get("/", response_model=HealthOut, tags=["Health"])
@router.get("/health", response_model=HealthOut, tags=["Health"])
def health(request: Request) -> Any:
    """Health check — confirms the server is alive and reports the loaded golden twin."""
    accept = request.headers.get("accept", "")
    if "text/html" in accept and DIST_INDEX.is_file():
        return FileResponse(DIST_INDEX)

    registry: Dict[str, CyberDigitalTwin] = request.app.state.twin_registry
    golden = request.app.state.golden_twin
    return HealthOut(
        status="ok",
        golden_twin_id=golden.id if golden else None,
        golden_hash=golden.hash()[:16] if golden else None,
        cache_size=result_cache.size(),
    )


# ─────────────────────────────────────────────
# GET /twins
# ─────────────────────────────────────────────

@router.get("/twins", response_model=List[str], tags=["Twin"])
def list_twins(request: Request) -> List[str]:
    """Return all available loaded twin IDs across scenarios."""
    registry: Dict[str, CyberDigitalTwin] = request.app.state.twin_registry
    _scan_and_register_scenarios(registry)
    return list(registry.keys())


# ─────────────────────────────────────────────
# GET /twin (default) & GET /twin/{twin_id}
# ─────────────────────────────────────────────

@router.get("/twin", response_model=TwinOut, tags=["Twin"])
def get_default_twin(request: Request) -> TwinOut:
    """Return default golden twin (used by frontend dashboard root)."""
    golden = request.app.state.golden_twin
    if not golden:
        raise HTTPException(status_code=404, detail="No digital twin loaded.")
    return _twin_to_out(golden)


@router.get("/twin/{twin_id}", response_model=TwinOut, tags=["Twin"])
def get_twin(twin_id: str, request: Request) -> TwinOut:
    """Return full serialized Twin including assets, identities, edges, flows, and controls."""
    dt = _get_twin(request, twin_id)
    return _twin_to_out(dt)


# ─────────────────────────────────────────────
# POST /twin/import & GET /twin/{id}/export
# ─────────────────────────────────────────────

def _normalize_and_build_twin(payload: Any) -> CyberDigitalTwin:
    """Safely validate, leniently normalize, and construct a CyberDigitalTwin from raw JSON data."""
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=400,
            detail=f"Expected JSON object at root, received {type(payload).__name__}.",
        )

    # Support nested {"data": {...}} or {"twin": {...}} wrapping
    data = payload.get("data") if isinstance(payload.get("data"), dict) else (
        payload.get("twin") if isinstance(payload.get("twin"), dict) else payload
    )
    if not isinstance(data, dict):
        raise HTTPException(
            status_code=400,
            detail="Digital twin payload must be a JSON dictionary.",
        )

    # 1. Assets / Nodes inspection
    raw_assets = data.get("assets")
    if raw_assets is None:
        raw_assets = data.get("nodes")

    if raw_assets is None or not isinstance(raw_assets, list):
        keys = list(data.keys())[:10]
        raise HTTPException(
            status_code=400,
            detail=f"Schema mismatch: missing required 'assets' (or 'nodes') array. Keys found: {keys}",
        )

    if len(raw_assets) == 0:
        raise HTTPException(
            status_code=400,
            detail="Invalid digital twin: 'assets' array cannot be empty.",
        )

    valid_kinds = {"server", "workstation", "database", "cloud_role", "share"}
    normalized_assets: List[Asset] = []
    seen_asset_ids = set()

    for idx, item in enumerate(raw_assets):
        if not isinstance(item, dict):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid asset at index {idx}: expected an object, got {type(item).__name__}.",
            )
        raw_id = str(item.get("id") or item.get("name") or f"asset-{idx+1}").strip()
        asset_id = raw_id if raw_id else f"asset-{idx+1}"
        if asset_id in seen_asset_ids:
            asset_id = f"{asset_id}-{idx+1}"
        seen_asset_ids.add(asset_id)

        name = str(item.get("name") or asset_id)

        # Kind normalization
        kind = str(item.get("kind") or item.get("type") or item.get("asset_type") or "server").lower()
        if kind not in valid_kinds:
            if any(k in kind for k in ("data", "db", "sql", "postgres", "mongo", "ledger")):
                kind = "database"
            elif any(k in kind for k in ("workstation", "pc", "laptop", "terminal", "tablet", "client", "desktop")):
                kind = "workstation"
            elif any(k in kind for k in ("role", "iam", "cloud")):
                kind = "cloud_role"
            elif any(k in kind for k in ("share", "file", "smb", "nfs", "storage", "s3", "bucket")):
                kind = "share"
            else:
                kind = "server"

        # Zone normalization
        zone = str(item.get("zone") or "corp").lower()
        if zone not in {"dmz", "corp", "prod", "mgmt"}:
            if any(z in zone for z in ("dmz", "public", "ext", "ingress")):
                zone = "dmz"
            elif any(z in zone for z in ("prod", "secure", "data", "app")):
                zone = "prod"
            elif any(z in zone for z in ("mgmt", "admin", "jump")):
                zone = "mgmt"
            else:
                zone = "corp"

        # Criticality normalization
        crit_raw = item.get("criticality", 2)
        if isinstance(crit_raw, str):
            crit_map = {"low": 1, "medium": 2, "high": 3, "severe": 4, "critical": 5}
            crit = crit_map.get(crit_raw.lower(), 2)
        else:
            try:
                crit = int(crit_raw)
                crit = max(1, min(5, crit))
            except (ValueError, TypeError):
                crit = 2

        crown_jewel = bool(item.get("crown_jewel", False))
        normalized_assets.append(
            Asset(
                id=asset_id,
                name=name,
                kind=kind,  # type: ignore[arg-type]
                zone=zone,
                criticality=crit,
                crown_jewel=crown_jewel,
            )
        )

    # 2. Edges / Relationships inspection
    raw_edges = data.get("edges")
    if raw_edges is None:
        raw_edges = data.get("relationships") or data.get("links") or []

    if not isinstance(raw_edges, list):
        raise HTTPException(
            status_code=400,
            detail=f"Expected 'edges' to be an array, got {type(raw_edges).__name__}.",
        )

    normalized_edges: List[Edge] = []
    for item in raw_edges:
        if not isinstance(item, dict):
            continue
        src = str(item.get("src") or item.get("source") or "").strip()
        dst = str(item.get("dst") or item.get("target") or "").strip()
        tech = str(item.get("technique") or item.get("relation_type") or item.get("type") or "network_access").strip()
        if src and dst:
            normalized_edges.append(Edge(src=src, dst=dst, technique=tech))

    # 3. Identities inspection
    raw_identities = data.get("identities", [])
    valid_id_kinds = {"user", "admin", "service_account", "cloud_role"}
    normalized_identities: List[Identity] = []
    if isinstance(raw_identities, list):
        for idx, item in enumerate(raw_identities):
            if not isinstance(item, dict):
                continue
            i_id = str(item.get("id") or f"id-{idx+1}").strip()
            i_name = str(item.get("name") or i_id)
            i_kind = str(item.get("kind") or item.get("role") or "user").lower()
            if i_kind not in valid_id_kinds:
                i_kind = "admin" if "admin" in i_kind else "user"
            try:
                tier = max(0, int(item.get("tier", 1)))
            except (ValueError, TypeError):
                tier = 1
            normalized_identities.append(Identity(id=i_id, name=i_name, kind=i_kind, tier=tier))  # type: ignore[arg-type]

    # 4. Service Flows inspection
    raw_flows = data.get("flows", [])
    normalized_flows: List[ServiceFlow] = []
    if isinstance(raw_flows, list):
        for idx, item in enumerate(raw_flows):
            if not isinstance(item, dict):
                continue
            f_id = str(item.get("id") or f"F{idx+1}").strip()
            f_name = str(item.get("name") or f"Flow {f_id}")
            f_src = str(item.get("src") or item.get("source") or "").strip()
            f_dst = str(item.get("dst") or item.get("target") or "").strip()
            f_tech = str(item.get("technique") or "service_request").strip()
            try:
                f_crit = max(1, min(5, int(item.get("criticality", 3))))
            except (ValueError, TypeError):
                f_crit = 3
            if f_src and f_dst:
                normalized_flows.append(
                    ServiceFlow(id=f_id, name=f_name, src=f_src, dst=f_dst, technique=f_tech, criticality=f_crit)
                )

    # 5. Controls inspection
    raw_controls = data.get("controls", [])
    normalized_controls: List[Control] = []
    if isinstance(raw_controls, list):
        for idx, item in enumerate(raw_controls):
            if not isinstance(item, dict):
                continue
            c_id = str(item.get("id") or f"ctrl-{idx+1}").strip()
            c_name = str(item.get("name") or f"Control {c_id}")
            try:
                c_cost = max(0, int(item.get("cost", 1000)))
            except (ValueError, TypeError):
                c_cost = 1000

            blocks = item.get("blocks", [])
            if isinstance(blocks, (list, tuple)):
                blocks_tuple = tuple(str(b) for b in blocks)
            elif isinstance(blocks, str):
                blocks_tuple = (blocks,)
            else:
                blocks_tuple = ()

            scope = item.get("scope", item.get("covered_entities", []))
            if isinstance(scope, (list, tuple)):
                scope_tuple = tuple(str(s) for s in scope)
            elif isinstance(scope, str):
                scope_tuple = (scope,)
            else:
                scope_tuple = ()

            try:
                efficacy = float(item.get("efficacy", 0.9))
                efficacy = max(0.0, min(1.0, efficacy))
            except (ValueError, TypeError):
                efficacy = 0.9

            normalized_controls.append(
                Control(
                    id=c_id,
                    name=c_name,
                    cost=c_cost,
                    blocks=blocks_tuple,
                    scope=scope_tuple,
                    efficacy=efficacy,
                )
            )

    # Twin ID
    twin_id = str(data.get("id") or data.get("scenario_id") or "").strip()
    if not twin_id:
        twin_id = f"twin-custom-{uuid.uuid4().hex[:6]}"

    # Parent ID
    parent_id = data.get("parent_id")
    if parent_id is not None:
        parent_id = str(parent_id)

    twin = Twin(
        id=twin_id,
        assets=tuple(normalized_assets),
        identities=tuple(normalized_identities),
        edges=tuple(normalized_edges),
        flows=tuple(normalized_flows),
        controls=tuple(normalized_controls),
        parent_id=parent_id,
    )
    return CyberDigitalTwin.from_twin(twin)


@router.post("/twin/import", response_model=TwinOut, tags=["Twin"])
def import_twin(payload: Dict[str, Any], request: Request) -> TwinOut:
    """
    Import, normalize, and register a new Cyber Digital Twin scenario from JSON.
    Supports both canonical and relaxed/legacy formats with graceful error handling.
    """
    dt = _normalize_and_build_twin(payload)
    registry: Dict[str, CyberDigitalTwin] = request.app.state.twin_registry
    registry[dt.id] = dt

    # Dynamically absorb credentials for any newly introduced identities into adversary agents
    agents: Dict[str, Agent] = request.app.state.agent_registry
    for ident in dt.twin.identities:
        cred = f"creds:{ident.id}"
        for aid, ag in list(agents.items()):
            if cred not in ag.capabilities:
                new_caps = set(ag.capabilities)
                new_caps.add(cred)
                agents[aid] = Agent(
                    id=ag.id,
                    name=ag.name,
                    start_zones=ag.start_zones,
                    capabilities=frozenset(new_caps),
                    objective=ag.objective,
                    noise_budget=ag.noise_budget,
                    skill=ag.skill,
                )

    return _twin_to_out(dt)


@router.get("/twin/{twin_id}/export", tags=["Twin"])
def export_twin(twin_id: str, request: Request) -> Response:
    """
    Export full canonical JSON representation of a digital twin scenario.
    Sets Content-Disposition header so browsers trigger a downloadable .json file.
    """
    dt = _get_twin(request, twin_id)
    canonical = canonical_twin_dict(dt.twin)
    json_bytes = json.dumps(canonical, indent=2).encode("utf-8")
    return Response(
        content=json_bytes,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{twin_id}.json"',
            "Content-Type": "application/json; charset=utf-8",
        },
    )


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
    agent = _resolve_agent(request, body.agent_id, dt=dt)

    if body.control_ids:
        control_map = {c.id: c for c in dt.twin.controls}
        add_controls = [control_map[cid] for cid in body.control_ids if cid in control_map]
        if add_controls:
            sim_id = f"{dt.id}-sim-{':'.join(sorted(body.control_ids))}"
            dt = dt.clone(new_id=sim_id, add_controls=add_controls)

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

    # Resolve agent objects from string IDs
    agent_ids = [
        _resolve_agent(request, aid, dt=dt) for aid in body.agent_ids
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

    Uses Phase 8 backend.rules.optimize.optimize() — LIVE.
    """
    dt = _get_twin(request, body.twin_id)

    portfolio = real_optimize(
        twin=dt.twin,
        budget=body.budget,
        agents=body.agent_ids,
        seed=body.seed,
    )

    portfolio_dict = portfolio.model_dump()

    optimal_portfolio = {
        "control_ids": list(portfolio.selected_control_ids),
        "total_cost": portfolio.total_cost,
        "risk_before": portfolio.risk_before,
        "risk_after": portfolio.risk_after,
        "risk_reduction": portfolio.risk_reduction,
        "broken_flows": portfolio_dict.get("broken_flows", []),
        "is_safe": portfolio.is_safe,
        "verdict": portfolio.verdict.verdict if portfolio.verdict else ("DEPLOY" if portfolio.is_safe else "BLOCK"),
        "recommendation": portfolio.verdict.recommendation if portfolio.verdict else "",
    }

    naive_top_n = [
        {
            "rank": i + 1,
            "control_ids": list(alt.control_ids),
            "cost": alt.total_cost,
            "risk_reduction": alt.risk_reduction,
            "is_safe": alt.is_safe,
        }
        for i, alt in enumerate(portfolio.alternatives[:5])
    ]

    return {
        "twin_id": body.twin_id,
        "budget": body.budget,
        "agent_ids": body.agent_ids,
        "selected_control_ids": list(portfolio.selected_control_ids),
        "selected_controls": portfolio_dict.get("selected_controls", []),
        "total_cost": portfolio.total_cost,
        "risk_before": portfolio.risk_before,
        "risk_after": portfolio.risk_after,
        "risk_reduction": portfolio.risk_reduction,
        "broken_flows": portfolio_dict.get("broken_flows", []),
        "is_safe": portfolio.is_safe,
        "verdict": portfolio_dict.get("verdict"),
        "alternatives": portfolio_dict.get("alternatives", []),
        "all_evaluated_count": portfolio.all_evaluated_count,
        "safe_evaluated_count": portfolio.safe_evaluated_count,
        "subsets_evaluated": portfolio.subsets_evaluated,
        "optimal_portfolio": optimal_portfolio,
        "naive_top_n": naive_top_n,
    }


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
    Compute credential-aware blast radius and NetworkX descendant upper bound.
    Uses Phase 9 backend.core.blast_radius.calculate_blast_radius().

    Query param ?twin_id= selects the twin (defaults to golden).
    """
    dt = _get_twin(request, twin_id)

    try:
        res = calculate_blast_radius(dt.twin, asset_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Asset '{asset_id}' not found in twin '{twin_id}'.",
        )

    return BlastRadiusOut(
        twin_id=twin_id,
        asset_id=res.compromised_seed,
        reachable=list(res.reachable_assets),
        reachable_count=res.credential_aware_count,
        crown_jewels_reachable=list(res.crown_jewels),
        reachable_assets=list(res.reachable_assets),
        credential_aware_count=res.credential_aware_count,
        network_upper_bound=list(res.network_upper_bound),
        network_upper_bound_count=res.network_upper_bound_count,
        divergence=res.divergence,
        critical_assets=list(res.critical_assets),
        crown_jewels=list(res.crown_jewels),
        reachable_identities=list(res.reachable_identities),
        usable_credentials=list(res.usable_credentials),
        seeded_capabilities=list(res.seeded_capabilities),
        explanation=res.explanation,
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


# ─────────────────────────────────────────────
# POST /crawl-audit
# ─────────────────────────────────────────────

@router.post("/crawl-audit", response_model=CrawlAuditResult, tags=["Analysis"])
@router.post("/audit", response_model=CrawlAuditResult, tags=["Analysis"], include_in_schema=False)
def post_crawl_audit(body: CrawlAuditRequest, request: Request) -> CrawlAuditResult:
    """
    Node-by-node crawling security audit (Chesspiece feature).

    Walks the network topology hop-by-hop like a chess piece, producing an
    explainable audit of node vulnerabilities, missing controls, MITRE ATT&CK
    technique exposures, business-flow risks, and recommended cheapest fixes.
    """
    dt = _get_twin(request, body.twin_id)
    return crawl_audit(
        twin=dt.twin,
        start_node=body.start_node,
        target_node=body.target_node,
        active_control_ids=body.active_control_ids,
        max_paths=body.max_paths,
        max_depth=body.max_depth,
    )

