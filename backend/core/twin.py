"""Digital Twin graph engine, deterministic content hashing, and immutable cloning."""

import hashlib
import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple, Union
import uuid
import networkx as nx

from backend.core.models import Asset, Control, Edge, Identity, ServiceFlow, Twin


def canonical_twin_dict(twin: Twin) -> Dict[str, Any]:
    """Produce a canonically sorted, deterministic dictionary representation of a Twin.

    Ensures that:
    - assets are sorted by id
    - identities are sorted by id
    - edges are sorted by (src, dst, technique)
    - flows are sorted by id
    - controls are sorted by id, with their inner collections (blocks, scope) sorted
    - all frozensets / tuples / lists are converted to sorted lists
    - sort_keys=True produces identical JSON for logically identical Twins
    """
    return {
        "id": twin.id,
        "parent_id": twin.parent_id,
        "assets": sorted(
            [a.model_dump() for a in twin.assets],
            key=lambda x: x["id"],
        ),
        "identities": sorted(
            [i.model_dump() for i in twin.identities],
            key=lambda x: x["id"],
        ),
        "edges": sorted(
            [e.model_dump() for e in twin.edges],
            key=lambda x: (x["src"], x["dst"], x["technique"]),
        ),
        "flows": sorted(
            [f.model_dump() for f in twin.flows],
            key=lambda x: x["id"],
        ),
        "controls": sorted(
            [
                {
                    "id": c.id,
                    "name": c.name,
                    "cost": c.cost,
                    "blocks": sorted(c.blocks),
                    "scope": sorted(c.scope),
                    "efficacy": c.efficacy,
                }
                for c in twin.controls
            ],
            key=lambda x: x["id"],
        ),
    }


def compute_twin_hash(twin: Twin) -> str:
    """Compute the deterministic SHA-256 digest of a Twin snapshot.

    Serializes the canonical twin dictionary with sort_keys=True and compact separators.
    """
    canonical = canonical_twin_dict(twin)
    encoded = json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def clone(
    twin: Twin,
    *,
    new_id: Optional[str] = None,
    add_controls: Iterable[Control] = (),
    remove_controls: Iterable[Union[str, Control]] = (),
    add_edges: Iterable[Edge] = (),
    remove_edges: Iterable[Union[Edge, Tuple[str, str], Tuple[str, str, str]]] = (),
    add_assets: Iterable[Asset] = (),
    remove_assets: Iterable[Union[str, Asset]] = (),
    add_flows: Iterable[ServiceFlow] = (),
    remove_flows: Iterable[Union[str, ServiceFlow]] = (),
) -> Twin:
    """Produce an independent, immutable copy of a Twin with optional modifications.

    Sets `parent_id = twin.id` to preserve lineage.
    Leaves the original `twin` instance completely unmutated.
    """
    if new_id is None:
        derived_suffix = compute_twin_hash(twin)[:8]
        new_id = f"{twin.id}-clone-{derived_suffix}"

    # Controls
    remove_ctrl_ids = {c if isinstance(c, str) else c.id for c in remove_controls}
    ctrls_map = {c.id: c for c in twin.controls if c.id not in remove_ctrl_ids}
    for c in add_controls:
        ctrls_map[c.id] = c
    new_controls = tuple(ctrls_map.values())

    # Edges
    def edge_matches_removal(
        edge: Edge, rem: Union[Edge, Tuple[str, str], Tuple[str, str, str]]
    ) -> bool:
        if isinstance(rem, Edge):
            return edge == rem
        if len(rem) == 2:
            return edge.src == rem[0] and edge.dst == rem[1]
        if len(rem) == 3:
            return edge.src == rem[0] and edge.dst == rem[1] and edge.technique == rem[2]
        return False

    new_edges_list = [
        e for e in twin.edges if not any(edge_matches_removal(e, r) for r in remove_edges)
    ]
    for e in add_edges:
        if e not in new_edges_list:
            new_edges_list.append(e)
    new_edges = tuple(new_edges_list)

    # Assets
    remove_asset_ids = {a if isinstance(a, str) else a.id for a in remove_assets}
    assets_map = {a.id: a for a in twin.assets if a.id not in remove_asset_ids}
    for a in add_assets:
        assets_map[a.id] = a
    new_assets = tuple(assets_map.values())

    # Flows
    remove_flow_ids = {f if isinstance(f, str) else f.id for f in remove_flows}
    flows_map = {f.id: f for f in twin.flows if f.id not in remove_flow_ids}
    for f in add_flows:
        flows_map[f.id] = f
    new_flows = tuple(flows_map.values())

    return Twin(
        id=new_id,
        assets=new_assets,
        identities=twin.identities,
        edges=new_edges,
        flows=new_flows,
        controls=new_controls,
        parent_id=twin.id,
    )


# Attach methods to frozen Twin model dynamically
Twin.hash = lambda self: compute_twin_hash(self)
Twin.clone = lambda self, **kwargs: clone(self, **kwargs)


class CyberDigitalTwin:
    """Graph-based Cyber Digital Twin wrapping a canonical Twin model and NetworkX graph."""

    def __init__(self, twin: Twin):
        self._twin: Twin = twin
        self.graph: nx.DiGraph = nx.DiGraph(id=twin.id)

        # Entity registries
        self._assets: Dict[str, Asset] = {a.id: a for a in twin.assets}
        self._identities: Dict[str, Identity] = {i.id: i for i in twin.identities}
        self._controls: Dict[str, Control] = {c.id: c for c in twin.controls}
        self._flows: Dict[str, ServiceFlow] = {f.id: f for f in twin.flows}
        self._edges: Tuple[Edge, ...] = twin.edges

        self._build_graph()

    @property
    def id(self) -> str:
        return self._twin.id

    @property
    def name(self) -> str:
        return self._twin.id

    @property
    def parent_id(self) -> Optional[str]:
        return self._twin.parent_id

    @property
    def twin(self) -> Twin:
        return self._twin

    @classmethod
    def from_twin(cls, twin: Twin) -> "CyberDigitalTwin":
        """Instantiate directly from a validated Twin model."""
        return cls(twin)

    @classmethod
    def from_file(cls, filepath: Union[str, Path]) -> "CyberDigitalTwin":
        """Instantiate from a scenario JSON file."""
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(f"Scenario file not found: {filepath}")
        content = path.read_text(encoding="utf-8")
        data = json.loads(content)
        return cls.from_dict(data)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "CyberDigitalTwin":
        """Instantiate from a dictionary matching Twin or legacy format."""
        if "assets" in data and ("flows" in data or "controls" in data):
            if "flows" not in data:
                data["flows"] = []
            if "identities" not in data:
                data["identities"] = []
            if "edges" not in data and "relationships" in data:
                data["edges"] = [
                    {
                        "src": r.get("source", r.get("src")),
                        "dst": r.get("target", r.get("dst")),
                        "technique": r.get("technique", r.get("relation_type", "ACCESSES")),
                    }
                    for r in data["relationships"]
                ]
            if "id" not in data and "scenario_id" in data:
                data["id"] = data["scenario_id"]
            twin = Twin.model_validate(data)
            return cls(twin)
        raise ValueError("Invalid digital twin data format")

    def _build_graph(self) -> None:
        """Construct the NetworkX graph from Twin entities, flows, and edges."""
        # 1. Asset nodes
        for asset in self._twin.assets:
            self.graph.add_node(
                asset.id,
                name=asset.name,
                node_type="asset",
                kind=asset.kind,
                zone=asset.zone,
                criticality=asset.criticality,
                crown_jewel=asset.crown_jewel,
                controls=[],
            )

        # 2. Identity nodes
        for identity in self._twin.identities:
            self.graph.add_node(
                identity.id,
                name=identity.name,
                node_type="identity",
                kind=identity.kind,
                tier=identity.tier,
                controls=[],
            )

        # 3. Controls mapped to scoped entities
        for control in self._twin.controls:
            for entity_id in control.scope:
                if entity_id in self.graph:
                    self.graph.nodes[entity_id]["controls"].append(control.id)

        # 4. Directed edges
        for edge in self._twin.edges:
            self.graph.add_edge(
                edge.src,
                edge.dst,
                technique=edge.technique,
            )

    def hash(self) -> str:
        """Deterministic content SHA-256 hash."""
        return compute_twin_hash(self._twin)

    def clone(
        self,
        *,
        new_id: Optional[str] = None,
        add_controls: Iterable[Control] = (),
        remove_controls: Iterable[Union[str, Control]] = (),
        add_edges: Iterable[Edge] = (),
        remove_edges: Iterable[Union[Edge, Tuple[str, str], Tuple[str, str, str]]] = (),
        add_assets: Iterable[Asset] = (),
        remove_assets: Iterable[Union[str, Asset]] = (),
        add_flows: Iterable[ServiceFlow] = (),
        remove_flows: Iterable[Union[str, ServiceFlow]] = (),
    ) -> "CyberDigitalTwin":
        """Produce an independent cloned CyberDigitalTwin with parent_id lineage."""
        cloned_twin = clone(
            self._twin,
            new_id=new_id,
            add_controls=add_controls,
            remove_controls=remove_controls,
            add_edges=add_edges,
            remove_edges=remove_edges,
            add_assets=add_assets,
            remove_assets=remove_assets,
            add_flows=add_flows,
            remove_flows=remove_flows,
        )
        return CyberDigitalTwin(cloned_twin)

    def resolve_node_id(self, node_id: str) -> str:
        """Resolve a friendly or prefixed node ID to the exact graph node identifier."""
        if node_id in self.graph:
            return node_id

        # Try common prefixes
        for prefix in ("asset-", "id-"):
            candidate = f"{prefix}{node_id}"
            if candidate in self.graph:
                return candidate

        # Try stripped prefix
        if node_id.startswith("asset-") and node_id[6:] in self.graph:
            return node_id[6:]
        if node_id.startswith("id-") and node_id[3:] in self.graph:
            return node_id[3:]

        # Case-insensitive name match
        for nid, data in self.graph.nodes.items():
            if data.get("name", "").lower() == node_id.lower():
                return nid

        return node_id

    def blast_radius(self, node_id: str) -> Set[str]:
        """Compute blast radius (all reachable descendants) for an asset if compromised."""
        resolved = self.resolve_node_id(node_id)
        if resolved not in self.graph:
            return set()
        return set(nx.descendants(self.graph, resolved))

    @property
    def asset_count(self) -> int:
        return len(self._assets)

    @property
    def identity_count(self) -> int:
        return len(self._identities)

    @property
    def edge_count(self) -> int:
        return len(self._edges)

    @property
    def relationship_count(self) -> int:
        return len(self._edges)

    @property
    def control_count(self) -> int:
        return len(self._controls)

    @property
    def flow_count(self) -> int:
        return len(self._flows)

    @property
    def assets(self) -> Dict[str, Asset]:
        return self._assets

    @property
    def identities(self) -> Dict[str, Identity]:
        return self._identities

    @property
    def controls(self) -> Dict[str, Control]:
        return self._controls

    @property
    def flows(self) -> Dict[str, ServiceFlow]:
        return self._flows

    @property
    def edges(self) -> Tuple[Edge, ...]:
        return self._edges

    def get_detection_summary(self) -> Dict[str, Any]:
        """Return structured summary of detected entities, topology, and hash."""
        return {
            "twin_id": self.id,
            "parent_id": self.parent_id,
            "assets_detected": self.asset_count,
            "identities_detected": self.identity_count,
            "edges_detected": self.edge_count,
            "controls_detected": self.control_count,
            "flows_detected": self.flow_count,
            "graph_nodes": self.graph.number_of_nodes(),
            "graph_edges": self.graph.number_of_edges(),
            "hash": self.hash(),
        }

    def render_flow_banner(self, source_file: str = "golden.json") -> str:
        """Render ASCII flow banner representing ingestion and verification."""
        lines = [
            f"{source_file}",
            "      ↓",
            "Python (Pydantic v2)",
            "      ↓",
            "NetworkX",
            "      ↓",
            "        ┌────────────────────────┐",
            f"        │ {self.id.center(22)} │",
            "        └────────────────────────┘",
            "                    │",
            "                    ▼",
            f"        {self.asset_count} assets detected",
            f"        {self.identity_count} identities detected",
            f"        {self.edge_count} edges detected",
            f"        {self.flow_count} service flows detected",
            f"        {self.control_count} controls detected",
            f"        hash: {self.hash()[:16]}...",
        ]
        return "\n".join(lines)


# Alias for explicit domain naming
FinBankTwin = CyberDigitalTwin
