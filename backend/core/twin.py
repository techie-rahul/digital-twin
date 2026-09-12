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
        if not isinstance(data, dict):
            raise ValueError("Digital twin data must be a dictionary")

        # Make a shallow copy of data dictionary
        d = dict(data)

        # 1. Normalize ID
        if "id" not in d and "scenario_id" in d:
            d["id"] = str(d["scenario_id"])
        d.setdefault("id", "twin-custom")

        if "assets" not in d or not isinstance(d["assets"], list):
            raise ValueError("Invalid digital twin data: missing 'assets' list")

        # 2. Normalize Assets
        crit_map = {"critical": 5, "high": 4, "medium": 3, "low": 2, "info": 1}
        kind_map = {
            "web_server": "server", "api_gateway": "server", "microservice": "server",
            "auth_service": "server", "siem_server": "server", "server": "server",
            "database": "database", "db": "database",
            "workstation": "workstation", "laptop": "workstation", "jumpbox": "workstation",
            "cloud_role": "cloud_role", "iam": "cloud_role",
            "share": "share", "backup_vault": "share", "storage": "share",
        }
        allowed_kinds = {"server", "workstation", "database", "cloud_role", "share"}

        normalized_assets = []
        for a_raw in d["assets"]:
            if not isinstance(a_raw, dict) or "id" not in a_raw:
                continue
            a = dict(a_raw)
            # Normalize Kind
            raw_kind = a.get("kind") or a.get("type") or "server"
            if raw_kind not in allowed_kinds:
                raw_kind = kind_map.get(str(raw_kind).lower(), "server")
            a["kind"] = raw_kind

            # Normalize Criticality
            crit = a.get("criticality", 3)
            if isinstance(crit, str):
                crit = crit_map.get(crit.lower(), 3)
            elif not isinstance(crit, int):
                try:
                    crit = int(crit)
                except Exception:
                    crit = 3
            a["criticality"] = max(1, min(5, crit))

            # Normalize Crown Jewel
            if "crown_jewel" not in a:
                a["crown_jewel"] = (a["criticality"] >= 5)
            else:
                a["crown_jewel"] = bool(a["crown_jewel"])

            # Normalize Name and Zone
            a.setdefault("name", str(a["id"]))
            a.setdefault("zone", "corp")
            normalized_assets.append(a)

        d["assets"] = normalized_assets
        asset_id_set = {a["id"] for a in normalized_assets}

        # 3. Normalize Edges
        valid_techniques = {
            "phish", "exploit_public_app", "cred_dump", "priv_esc_local",
            "creds_in_files", "rdp_lateral", "ssh_lateral", "smb_lateral",
            "db_login", "exfil_c2",
        }
        tech_alias_map = {
            "web": "exploit_public_app", "http": "exploit_public_app", "https": "exploit_public_app",
            "api": "exploit_public_app", "ingress": "exploit_public_app", "portal": "exploit_public_app",
            "sql": "db_login", "database": "db_login", "postgres": "db_login", "mysql": "db_login",
            "rdp": "rdp_lateral", "smb": "smb_lateral", "share": "smb_lateral", "storage": "smb_lateral",
            "vault": "smb_lateral", "ssh": "ssh_lateral", "lateral": "ssh_lateral", "admin": "ssh_lateral",
            "phish": "phish", "spearphish": "phish", "email": "phish", "exfil": "exfil_c2",
        }

        if "edges" not in d and "relationships" in d:
            d["edges"] = [
                {
                    "src": r.get("source", r.get("src")),
                    "dst": r.get("target", r.get("dst")),
                    "technique": r.get("technique", r.get("relation_type", r.get("type", "ACCESSES"))),
                }
                for r in d["relationships"]
                if isinstance(r, dict)
            ]
        d.setdefault("edges", [])

        normalized_edges = []
        for e_raw in d["edges"]:
            if not isinstance(e_raw, dict):
                continue
            src = e_raw.get("src") or e_raw.get("source")
            dst = e_raw.get("dst") or e_raw.get("target")
            raw_tech = str(e_raw.get("technique") or e_raw.get("relation_type") or e_raw.get("type") or "ACCESSES").strip()
            if not src or not dst:
                continue

            # Ensure technique is valid against the MITRE catalog
            if raw_tech.lower() in valid_techniques:
                clean_tech = raw_tech.lower()
            else:
                matched_tech = None
                raw_lower = raw_tech.lower()
                for key, val in tech_alias_map.items():
                    if key in raw_lower:
                        matched_tech = val
                        break
                if not matched_tech:
                    dst_lower = str(dst).lower()
                    src_lower = str(src).lower()
                    if any(k in dst_lower for k in ("db", "database", "ledger", "sql", "rds")):
                        matched_tech = "db_login"
                    elif any(k in dst_lower for k in ("share", "storage", "vault", "s3", "bucket", "lake")):
                        matched_tech = "smb_lateral"
                    elif any(k in dst_lower for k in ("rdp", "jump", "bastion", "workstation")):
                        matched_tech = "rdp_lateral"
                    elif any(k in src_lower for k in ("web", "portal", "internet", "ingress")):
                        matched_tech = "exploit_public_app"
                    elif "user" in src_lower:
                        matched_tech = "phish"
                    else:
                        matched_tech = "ssh_lateral"
                clean_tech = matched_tech

            normalized_edges.append({"src": str(src), "dst": str(dst), "technique": clean_tech})
        d["edges"] = normalized_edges

        # 4. Normalize Identities
        d.setdefault("identities", [])
        allowed_identity_kinds = {"user", "admin", "service_account", "cloud_role"}
        normalized_identities = []
        for i_raw in d["identities"]:
            if not isinstance(i_raw, dict) or "id" not in i_raw:
                continue
            i = dict(i_raw)
            i.setdefault("name", str(i["id"]))
            raw_ikind = i.get("kind") or i.get("type")
            if not raw_ikind or raw_ikind not in allowed_identity_kinds:
                role_str = str(i.get("role", "")).lower()
                id_str = str(i["id"]).lower()
                if "admin" in role_str or "admin" in id_str or "root" in role_str:
                    raw_ikind = "admin"
                elif "svc" in id_str or "service" in role_str:
                    raw_ikind = "service_account"
                elif "role" in id_str or "role" in role_str:
                    raw_ikind = "cloud_role"
                else:
                    raw_ikind = "user"
            i["kind"] = raw_ikind

            tier = i.get("tier")
            if not isinstance(tier, int):
                tier = 0 if raw_ikind in ("admin", "cloud_role") else (2 if raw_ikind == "service_account" else 3)
            i["tier"] = max(0, min(4, tier))
            normalized_identities.append(i)
        d["identities"] = normalized_identities

        # 5. Normalize Service Flows
        d.setdefault("flows", [])
        normalized_flows = []
        for idx, f_raw in enumerate(d["flows"]):
            if not isinstance(f_raw, dict):
                continue
            f = dict(f_raw)
            f.setdefault("id", f"FLOW-{idx + 1}")
            f.setdefault("name", f["id"])
            if "src" not in f or "dst" not in f:
                continue
            f.setdefault("technique", "ACCESSES")
            fcrit = f.get("criticality", 3)
            if isinstance(fcrit, str):
                fcrit = crit_map.get(fcrit.lower(), 3)
            elif not isinstance(fcrit, int):
                fcrit = 3
            f["criticality"] = max(1, min(5, fcrit))
            normalized_flows.append(f)
        d["flows"] = normalized_flows

        # 6. Normalize Controls
        d.setdefault("controls", [])
        normalized_controls = []
        for idx, c_raw in enumerate(d["controls"]):
            if not isinstance(c_raw, dict) or "id" not in c_raw:
                continue
            c = dict(c_raw)
            c.setdefault("name", str(c["id"]))
            cost = c.get("cost", 2000)
            if not isinstance(cost, int):
                try:
                    cost = int(cost)
                except Exception:
                    cost = 2000
            c["cost"] = cost

            # Blocks techniques
            blocks = c.get("blocks")
            if not blocks or not isinstance(blocks, (list, tuple)):
                blocks = ["ACCESSES", "exploit_public_app", "ssh_lateral", "rdp_lateral", "db_login"]
            c["blocks"] = [str(b) for b in blocks]

            # Scope
            scope = c.get("scope")
            if not scope or not isinstance(scope, (list, tuple)):
                scope = list(asset_id_set)
            else:
                scope = [str(s) for s in scope if str(s) in asset_id_set] or list(asset_id_set)
            c["scope"] = scope

            # Efficacy
            efficacy = c.get("efficacy", 0.9)
            if not isinstance(efficacy, (int, float)):
                try:
                    efficacy = float(efficacy)
                except Exception:
                    efficacy = 0.9
            c["efficacy"] = float(efficacy)

            normalized_controls.append(c)
        d["controls"] = normalized_controls

        twin = Twin.model_validate(d)
        return cls(twin)

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
        control_ids_to_add: Iterable[str] = (),
        control_ids_to_remove: Iterable[str] = (),
        add_edges: Iterable[Edge] = (),
        remove_edges: Iterable[Union[Edge, Tuple[str, str], Tuple[str, str, str]]] = (),
        add_assets: Iterable[Asset] = (),
        remove_assets: Iterable[Union[str, Asset]] = (),
        add_flows: Iterable[ServiceFlow] = (),
        remove_flows: Iterable[Union[str, ServiceFlow]] = (),
    ) -> "CyberDigitalTwin":
        """Produce an independent cloned CyberDigitalTwin with parent_id lineage."""
        effective_add_controls = list(add_controls)
        if control_ids_to_add:
            ctrl_map = {c.id: c for c in self._twin.controls}
            for cid in control_ids_to_add:
                if cid in ctrl_map and ctrl_map[cid] not in effective_add_controls:
                    effective_add_controls.append(ctrl_map[cid])

        effective_remove_controls = list(remove_controls)
        if control_ids_to_remove:
            effective_remove_controls.extend(control_ids_to_remove)

        cloned_twin = clone(
            self._twin,
            new_id=new_id,
            add_controls=effective_add_controls,
            remove_controls=effective_remove_controls,
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
