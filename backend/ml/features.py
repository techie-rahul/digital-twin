"""Feature extraction for state-action evaluation in Digital Twin attack graphs.

Extracts a 10-dimensional structural vector independent of specific node IDs:
1. dst_criticality (1-5)
2. dst_is_crown_jewel (0/1)
3. src_criticality (1-5)
4. src_zone_tier (0=dmz, 1=corp, 2=mgmt, 3=prod)
5. dst_zone_tier (0=dmz, 1=corp, 2=mgmt, 3=prod)
6. technique_cost (float)
7. technique_noise (float)
8. new_capabilities_count (int)
9. requires_creds (0/1)
10. topological_distance_to_target (int shortest hops in graph)
"""
from __future__ import annotations

from typing import Dict, FrozenSet, Sequence
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
    "src_criticality",
    "src_zone_tier",
    "dst_zone_tier",
    "technique_cost",
    "technique_noise",
    "new_capabilities_count",
    "requires_creds",
    "distance_to_target",
)


def extract_features(
    edge: CompiledEdge,
    current_caps: FrozenSet[str],
    twin: Twin,
    graph: nx.DiGraph | None,
    target_id: str,
    target_distance_map: Dict[str, int],
) -> list[float]:
    """Convert an edge transition from current state into a 10D numerical vector."""
    asset_map: Dict[str, Asset] = {a.id: a for a in twin.assets}
    
    src_asset = asset_map.get(edge.src)
    dst_asset = asset_map.get(edge.dst)
    
    src_crit = float(src_asset.criticality) if src_asset else 1.0
    src_zone_str = src_asset.zone.lower() if src_asset else "corp"
    src_zone_tier = float(ZONE_TIER_MAP.get(src_zone_str, 1))

    dst_crit = float(dst_asset.criticality) if dst_asset else 1.0
    dst_crown_jewel = 1.0 if (dst_asset and getattr(dst_asset, "crown_jewel", False)) else 0.0
    dst_zone_str = dst_asset.zone.lower() if dst_asset else "corp"
    dst_zone_tier = float(ZONE_TIER_MAP.get(dst_zone_str, 1))
    
    cost = float(edge.cost)
    noise = float(edge.noise)
    
    # How many new capabilities this transition unlocks that the agent doesn't already hold
    new_caps = [c for c in edge.grants if c not in current_caps]
    new_caps_count = float(len(new_caps))
    
    # Whether this edge requires credentials
    requires_creds = 1.0 if any("cred" in r.lower() or "id-" in r.lower() for r in edge.requires) else 0.0
    
    # Distance in hops to target (precomputed or fallback to 8)
    dist = float(target_distance_map.get(edge.dst, 8))
    
    return [
        dst_crit,
        dst_crown_jewel,
        src_crit,
        src_zone_tier,
        dst_zone_tier,
        cost,
        noise,
        new_caps_count,
        requires_creds,
        dist,
    ]
