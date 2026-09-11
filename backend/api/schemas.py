"""
API request/response Pydantic schemas for the FinBank Digital Twin API.

These are the API-layer models — separate from the domain models in backend/core/models.py.
They serialize/deserialize HTTP request bodies and response payloads.

Do NOT modify backend/core/models.py to add API-specific fields.
Use these schemas as the adapter layer between HTTP and the domain.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ─────────────────────────────────────────────
# Request Schemas
# ─────────────────────────────────────────────

class SimulateRequest(BaseModel):
    """POST /simulate — request body."""
    twin_id: str = Field(..., description="ID of the Twin to simulate against.")
    agent_id: str = Field(..., description="Agent ID defined inside the Twin.")
    n: int = Field(100, ge=1, le=2000, description="Number of Monte Carlo trials.")
    seed: int = Field(42, description="Deterministic RNG seed.")
    target: Optional[str] = Field(None, description="Target asset ID. Defaults to crown jewel.")


class CloneRequest(BaseModel):
    """POST /twin/{id}/clone — request body."""
    control_ids_to_add: List[str] = Field(default_factory=list, description="Control IDs to apply.")
    control_ids_to_remove: List[str] = Field(default_factory=list, description="Control IDs to remove.")
    new_id: Optional[str] = Field(None, description="Optional explicit ID for the cloned twin.")


class EvaluateChangeRequest(BaseModel):
    """POST /evaluate-change — request body."""
    twin_id: str = Field(..., description="Base twin ID to evaluate the change against.")
    control_ids: List[str] = Field(..., description="Control IDs to apply as a proposed change.")
    agent_ids: List[str] = Field(default_factory=list, description="Agent IDs to evaluate against.")
    seed: int = Field(42, description="Deterministic RNG seed.")
    n: int = Field(100, ge=1, le=2000, description="Monte Carlo trials for the simulation.")


class OptimizeRequest(BaseModel):
    """POST /optimize — request body."""
    twin_id: str = Field(..., description="Twin ID to optimize controls for.")
    budget: int = Field(..., ge=0, description="Maximum total control cost budget.")
    agent_ids: List[str] = Field(default_factory=list, description="Agent IDs to optimise against.")
    seed: int = Field(42, description="Deterministic RNG seed.")


class CrawlAuditRequest(BaseModel):
    """POST /crawl-audit — request body."""
    twin_id: str = Field("twin-finbank-golden", description="Twin ID to audit.")
    start_node: str = Field("internet", description="Asset ID where the agent starts.")
    target_node: Optional[str] = Field(None, description="Asset ID the agent tries to reach. Defaults to highest-criticality crown jewel.")
    active_control_ids: List[str] = Field(default_factory=list, description="Control IDs to treat as deployed.")
    max_paths: int = Field(20, ge=1, le=100, description="Maximum number of paths to discover and audit.")
    max_depth: int = Field(8, ge=1, le=20, description="Maximum path length in hops.")


# ─────────────────────────────────────────────
# Response Schemas
# ─────────────────────────────────────────────

class AssetOut(BaseModel):
    id: str
    name: str
    kind: str
    zone: str
    criticality: int
    crown_jewel: bool


class IdentityOut(BaseModel):
    id: str
    name: str
    kind: str
    tier: int


class EdgeOut(BaseModel):
    src: str
    dst: str
    technique: str


class ServiceFlowOut(BaseModel):
    id: str
    name: str
    src: str
    dst: str
    technique: str
    criticality: int


class ControlOut(BaseModel):
    id: str
    name: str
    cost: int
    blocks: List[str]
    scope: List[str]
    efficacy: float


class TwinOut(BaseModel):
    """GET /twin/{id} response."""
    id: str
    parent_id: Optional[str]
    hash: str
    asset_count: int
    identity_count: int
    edge_count: int
    flow_count: int
    control_count: int
    assets: List[AssetOut]
    identities: List[IdentityOut]
    edges: List[EdgeOut]
    flows: List[ServiceFlowOut]
    controls: List[ControlOut]


class CloneOut(BaseModel):
    """POST /twin/{id}/clone response."""
    original_id: str
    cloned_id: str
    parent_id: str
    hash: str
    asset_count: int
    edge_count: int
    control_count: int


class EvaluatedRouteOut(BaseModel):
    route_id: str
    nodes: List[str]
    p_route: float
    effort_score: float
    noise: float
    utility: float
    selection_prob: float


class SimulateOut(BaseModel):
    """POST /simulate response."""
    twin_id: str
    agent_id: str
    target: Optional[str]
    n: int
    seed: int
    p_success: float
    mean_effort: float
    mean_noise: float
    detection_rate: float
    success_count: int
    failure_count: int
    candidate_routes: List[EvaluatedRouteOut]
    cached: bool = False


class BlastRadiusOut(BaseModel):
    """GET /blast-radius/{asset_id} response (Phase 9 enriched)."""
    twin_id: str
    asset_id: str
    reachable: List[str]
    reachable_count: int
    crown_jewels_reachable: List[str]
    # Phase 9 enhanced fields
    reachable_assets: List[str] = Field(default_factory=list)
    credential_aware_count: int = 0
    network_upper_bound: List[str] = Field(default_factory=list)
    network_upper_bound_count: int = 0
    divergence: int = 0
    critical_assets: List[str] = Field(default_factory=list)
    crown_jewels: List[str] = Field(default_factory=list)
    reachable_identities: List[str] = Field(default_factory=list)
    usable_credentials: List[str] = Field(default_factory=list)
    seeded_capabilities: List[str] = Field(default_factory=list)
    explanation: str = ""


class LineageNodeOut(BaseModel):
    twin_id: str
    parent_id: Optional[str]
    hash: str


class LineageOut(BaseModel):
    """GET /lineage/{twin_id} response."""
    twin_id: str
    lineage: List[LineageNodeOut]


class HealthOut(BaseModel):
    """GET / health response."""
    status: str
    golden_twin_id: Optional[str]
    golden_hash: Optional[str]
    cache_size: int
