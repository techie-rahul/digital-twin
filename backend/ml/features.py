"""Feature extraction for state-action evaluation in Digital Twin attack graphs.

Extracts an 8-dimensional structural vector independent of specific node IDs:
1. dst_criticality (1-5)
2. dst_is_crown_jewel (0/1)
3. technique_cost (float)
4. technique_noise (float)
5. new_capabilities_count (int)
6. requires_creds (0/1)
7. dst_zone_tier (0=dmz, 1=corp, 2=mgmt, 3=prod)
8. topological_distance_to_target (int shortest hops in graph)
"""
from __future__ import annotations

from typing import Dict, FrozenSet, Sequence, Set
import networkx as nx

from backend.core.models import Asset, Twin
from backend.rules.compile import CompiledEdge

ZONE_TIER_MAP: Dict[str, int] = {
    "dmz": 0,
    "corp": 1,
    "mgmt": 2,
    "prod": 3,
}

FEATURE_NAMES: Sequence[str] = (
    "dst_criticality",
    "dst_is_crown_jewel",
    "technique_cost",
    "technique_noise",
    "new_capabilities_count",
    "requires_creds",
    "dst_zone_tier",
    "distance_to_target",
)


def extract_features(
    edge: CompiledEdge,
    current_caps: FrozenSet[str],
    twin: Twin,
    graph: nx.DiGraph,
    target_id: str,
    target_distance_map: Dict[str, int],
) -> list[float]:
    """Convert an edge transition from current state into an 8D numerical vector."""
    # Find destination asset
    dst_asset: Asset | None = next((a for a in twin.assets if a.id == edge.dst), None)
    
    dst_criticality = float(dst_asset.criticality) if dst_asset else 1.0
    dst_crown_jewel = 1.0 if (dst_asset and getattr(dst_asset, "crown_jewel", False)) else 0.0
    
    cost = float(edge.cost)
    noise = float(edge.noise)
    
    # How many new capabilities this transition unlocks that the agent doesn't already hold
    new_caps = [c for c in edge.grants if c not in current_caps]
    new_caps_count = float(len(new_caps))
    
    # Whether this edge requires credentials
    requires_creds = 1.0 if any("cred" in r.lower() or "id-" in r.lower() for r in edge.requires) else 0.0
    
    # Zone tier
    zone_str = dst_asset.zone.lower() if dst_asset else "corp"
    zone_tier = float(ZONE_TIER_MAP.get(zone_str, 1))
    
    # Distance in hops to target (precomputed or fallback)
    dist = float(target_distance_map.get(edge.dst, 8))
    
    return [
        dst_criticality,
        dst_crown_jewel,
        cost,
        noise,
        new_caps_count,
        requires_creds,
        zone_tier,
        dist,
    ]
