"""Blast-Radius View for compromised assets and identities (Phase 9).

Provides deterministic credential-aware blast radius analysis using the Phase 3
stateful search engine (Algorithm A) and Phase 2 compiled transition model,
contrasted against the raw NetworkX descendant upper bound.
"""

from typing import Any, Dict, Iterable, List, Literal, Optional, Sequence, Set, Tuple, Union
import networkx as nx
from pydantic import BaseModel, Field

from backend.core.attacker import AttackerState
from backend.core.models import Agent, Asset, Edge, Identity, Twin
from backend.core.search import (
    AttackPath,
    Inventory,
    search,
    DEFAULT_MAX_DEPTH,
    DEFAULT_MAX_PATHS,
)
from backend.rules.compile import CompiledEdge, CompiledTwin, compile_twin
from backend.rules.loader import TechniqueDefinition, load_techniques_map


# =====================================================================
# 1. Blast Radius Result Contract (Frozen Pydantic Model)
# =====================================================================

class BlastRadiusResult(BaseModel, frozen=True):
    """Immutable result contract for credential-aware blast radius analysis."""

    compromised_seed: str
    seed_type: Literal["asset", "identity"] = "asset"

    # Credential-aware reachability (State-space model)
    reachable_assets: tuple[str, ...] = ()
    credential_aware_count: int = 0

    # Network-level reachability upper bound (NetworkX nx.descendants)
    network_upper_bound: tuple[str, ...] = ()
    network_upper_bound_count: int = 0

    # Usable identities & credentials
    reachable_identities: tuple[str, ...] = ()
    usable_credentials: tuple[str, ...] = ()

    # Impacted high-value targets
    critical_assets: tuple[str, ...] = ()
    crown_jewels: tuple[str, ...] = ()

    # Feasible attack paths to reachable targets
    attack_paths: tuple[AttackPath, ...] = ()
    paths_by_target: dict[str, tuple[AttackPath, ...]] = Field(default_factory=dict)

    # Adversary state initialisation
    seeded_capabilities: tuple[str, ...] = ()

    # Human-readable advisory summary
    explanation: str = ""

    # Convenience aliases and properties
    @property
    def seed(self) -> str:
        """Alias for compromised_seed."""
        return self.compromised_seed

    @property
    def credential_aware_reachability(self) -> tuple[str, ...]:
        """Alias for reachable_assets."""
        return self.reachable_assets

    @property
    def network_descendants(self) -> tuple[str, ...]:
        """Alias for network_upper_bound."""
        return self.network_upper_bound

    @property
    def usable_identities(self) -> tuple[str, ...]:
        """Alias for reachable_identities."""
        return self.reachable_identities

    @property
    def all_compromised_assets(self) -> tuple[str, ...]:
        """All compromised assets including seed and reachable targets."""
        if self.seed_type == "asset":
            return (self.compromised_seed, *self.reachable_assets)
        return self.reachable_assets

    @property
    def is_crown_jewel_compromised(self) -> bool:
        """True if any crown jewel asset is reachable."""
        return len(self.crown_jewels) > 0

    @property
    def is_critical_asset_compromised(self) -> bool:
        """True if any asset with criticality >= 4 is reachable."""
        return len(self.critical_assets) > 0

    @property
    def divergence(self) -> int:
        """Difference between raw network reachability and true credential-aware reachability."""
        return self.network_upper_bound_count - self.credential_aware_count

    def to_attacker_state(self) -> AttackerState:
        """Construct an AttackerState reflecting the initial adversary position and seeded capabilities."""
        privs: list[str] = []
        if "priv:admin" in self.seeded_capabilities:
            privs.append("admin")
        return AttackerState(
            current_node=self.compromised_seed,
            capabilities=self.seeded_capabilities,
            privileges=frozenset(privs),
        )


# =====================================================================
# 2. Helper Functions
# =====================================================================

def resolve_sessions_on_asset(twin: Twin, asset_id: str) -> tuple[Identity, ...]:
    """Resolve all identities with active sessions or authorized credentials on the given asset."""
    identities_map = {i.id: i for i in twin.identities}
    assets_map = {a.id: a for a in twin.assets}
    asset = assets_map.get(asset_id)
    if not asset:
        return ()

    sessions: list[Identity] = []

    # 1. Explicit edges from identities to this asset (canonical session representations)
    for e in twin.edges:
        if e.dst == asset_id and e.src in identities_map:
            ident = identities_map[e.src]
            if ident not in sessions:
                sessions.append(ident)

    # 2. Privileged admin sessions on management infrastructure
    for ident in twin.identities:
        if ident.kind == "admin" or ident.tier == 0:
            if asset.zone in ("mgmt",):
                if ident not in sessions:
                    sessions.append(ident)

    return tuple(sorted(sessions, key=lambda i: i.id))


def compute_network_descendants(twin: Twin, seed: str) -> tuple[str, ...]:
    """Calculate simple NetworkX descendant-based upper bound without credential requirements."""
    G = nx.DiGraph()
    for a in twin.assets:
        G.add_node(a.id)
    for e in twin.edges:
        G.add_edge(e.src, e.dst)

    if seed not in G:
        return ()

    asset_ids = {a.id for a in twin.assets}
    # Filter descendants to assets only, strictly excluding the seed itself
    descendants = {node for node in nx.descendants(G, seed) if node in asset_ids and node != seed}
    return tuple(sorted(descendants))


# =====================================================================
# 3. Core Blast Radius Calculation
# =====================================================================

def calculate_blast_radius(
    twin: Union[Twin, Any],
    seed: str,
    *,
    catalog: Optional[Dict[str, TechniqueDefinition]] = None,
    compiled_twin: Optional[CompiledTwin] = None,
    max_depth: int = DEFAULT_MAX_DEPTH,
    max_paths: int = DEFAULT_MAX_PATHS,
) -> BlastRadiusResult:
    """Perform deterministic credential-aware blast radius analysis for a compromised asset or identity.

    Parameters
    ----------
    twin : Union[Twin, CyberDigitalTwin]
        The digital twin snapshot (immutable).
    seed : str
        The ID or name of the compromised asset or identity.
    catalog : Optional[Dict[str, TechniqueDefinition]]
        MITRE technique catalog. Defaults to canonical loader.
    compiled_twin : Optional[CompiledTwin]
        Precompiled transition model from Phase 2. Compiled on-demand if omitted.
    max_depth : int
        Maximum path depth for search exploration (default 8).
    max_paths : int
        Maximum paths per target search before budget exception (default 5000).

    Returns
    -------
    BlastRadiusResult
        The comprehensive blast radius result model.

    Raises
    ------
    ValueError
        If the seed does not correspond to any asset or identity in the twin.
    """
    # Normalize Twin model if CyberDigitalTwin instance is passed
    underlying_twin: Twin = getattr(twin, "twin", twin)
    if not isinstance(underlying_twin, Twin):
        raise TypeError(f"Expected Twin or CyberDigitalTwin, got {type(twin)}")

    assets_map = {a.id: a for a in underlying_twin.assets}
    identities_map = {i.id: i for i in underlying_twin.identities}

    # Resolve seed entity: try ID first, then case-insensitive name
    target_asset = assets_map.get(seed)
    target_identity = identities_map.get(seed)

    if not target_asset and not target_identity:
        seed_lower = seed.lower()
        for a in underlying_twin.assets:
            if a.name.lower() == seed_lower:
                target_asset = a
                break
        if not target_asset:
            for i in underlying_twin.identities:
                if i.name.lower() == seed_lower:
                    target_identity = i
                    break

    if not target_asset and not target_identity:
        raise ValueError(f"Seed entity '{seed}' not found in twin assets or identities.")

    # Ensure compiled transition model is ready
    if compiled_twin is None:
        compiled_twin = compile_twin(underlying_twin, catalog=catalog)

    # -----------------------------------------------------------------
    # Branch A: Compromised Asset
    # -----------------------------------------------------------------
    if target_asset is not None:
        seed_asset_id = target_asset.id
        compromised_seed = seed_asset_id
        seed_type: Literal["asset", "identity"] = "asset"

        # 1. Resolve sessions on this asset
        sessions = resolve_sessions_on_asset(underlying_twin, seed_asset_id)

        # 2. Seed capabilities strictly according to Phase 0-8 semantics (Requirement 3):
        # - session:X
        # - admin:X
        # - credentials associated with sessions on X
        # - foothold and priv:admin local capabilities
        seed_caps_set: Set[str] = {
            f"session:{seed_asset_id}",
            f"admin:{seed_asset_id}",
            "foothold",
            "priv:admin",
        }
        for ident in sessions:
            seed_caps_set.add(f"creds:{ident.id}")

        seeded_capabilities = tuple(sorted(seed_caps_set))

        # 3. Simple NetworkX descendant-based upper bound (Requirement 5)
        network_upper_bound = compute_network_descendants(underlying_twin, seed_asset_id)
        network_upper_bound_count = len(network_upper_bound)

        # 4. Credential-aware state-space search (Algorithm A, Requirement 4)
        agent = Agent(
            id=f"blast-agent-{seed_asset_id}",
            name=f"Blast Radius Agent for {seed_asset_id}",
            start_zones=(),
            capabilities=frozenset(seed_caps_set),
            objective="max_breadth",
            noise_budget=100.0,
            skill=1.0,
        )

        reachable_assets_list: List[str] = []
        attack_paths_list: List[AttackPath] = []
        paths_by_target: Dict[str, tuple[AttackPath, ...]] = {}

        # Candidate targets: all assets except the seed itself
        candidate_target_ids = sorted([a.id for a in underlying_twin.assets if a.id != seed_asset_id])

        for target_id in candidate_target_ids:
            inv = search(
                compiled_twin,
                agent,
                target=target_id,
                assets=underlying_twin,
                start_nodes=[seed_asset_id],
                max_depth=max_depth,
                max_paths=max_paths,
            )
            if len(inv.paths) > 0:
                reachable_assets_list.append(target_id)
                attack_paths_list.extend(inv.paths)
                paths_by_target[target_id] = inv.paths

        reachable_assets = tuple(sorted(reachable_assets_list))
        credential_aware_count = len(reachable_assets)
        attack_paths = tuple(sorted(attack_paths_list, key=lambda p: (p.depth, p.id)))

        # 5. Resolve usable credentials and identities
        discovered_creds = {c for c in seed_caps_set if c.startswith("creds:")}
        for p in attack_paths:
            for cap in p.capabilities:
                if cap.startswith("creds:"):
                    discovered_creds.add(cap)
            for edge in p.edges:
                if edge.identity_id:
                    discovered_creds.add(f"creds:{edge.identity_id}")

        usable_credentials = tuple(sorted(discovered_creds))

        discovered_identities = {ident.id for ident in sessions}
        for cred in discovered_creds:
            ident_name = cred.split(":", 1)[1]
            discovered_identities.add(ident_name)
        reachable_identities = tuple(sorted(discovered_identities))

    # -----------------------------------------------------------------
    # Branch B: Compromised Identity
    # -----------------------------------------------------------------
    else:
        assert target_identity is not None
        seed_ident_id = target_identity.id
        compromised_seed = seed_ident_id
        seed_type = "identity"

        seed_caps_set = {
            f"creds:{seed_ident_id}",
            f"session:{seed_ident_id}",
            "foothold",
        }
        if target_identity.kind == "admin" or target_identity.tier == 0:
            seed_caps_set.add("priv:admin")

        seeded_capabilities = tuple(sorted(seed_caps_set))

        # Starting assets: anywhere this identity has direct access or role assignment
        start_nodes_set: Set[str] = set()
        for e in underlying_twin.edges:
            if e.src == seed_ident_id and e.dst in assets_map:
                start_nodes_set.add(e.dst)
        if target_identity.kind == "admin" or target_identity.tier == 0:
            for a in underlying_twin.assets:
                if a.kind in ("server", "database") or a.zone in ("prod", "mgmt"):
                    start_nodes_set.add(a.id)

        start_nodes = sorted(start_nodes_set)

        # Network upper bound: starting nodes + their network descendants
        net_upper_set: Set[str] = set()
        G = nx.DiGraph()
        for a in underlying_twin.assets:
            G.add_node(a.id)
        for e in underlying_twin.edges:
            G.add_edge(e.src, e.dst)

        for sn in start_nodes:
            net_upper_set.add(sn)
            for desc in nx.descendants(G, sn):
                if desc in assets_map:
                    net_upper_set.add(desc)

        network_upper_bound = tuple(sorted(net_upper_set))
        network_upper_bound_count = len(network_upper_bound)

        # Credential-aware state search
        agent = Agent(
            id=f"blast-agent-{seed_ident_id}",
            name=f"Blast Radius Agent for {seed_ident_id}",
            start_zones=(),
            capabilities=frozenset(seed_caps_set),
            objective="max_breadth",
            noise_budget=100.0,
            skill=1.0,
        )

        reachable_assets_set: Set[str] = set()
        attack_paths_list = []
        paths_by_target = {}

        # The starting nodes are directly accessible
        for sn in start_nodes:
            reachable_assets_set.add(sn)

        candidate_target_ids = sorted(assets_map.keys())

        if start_nodes:
            for target_id in candidate_target_ids:
                inv = search(
                    compiled_twin,
                    agent,
                    target=target_id,
                    assets=underlying_twin,
                    start_nodes=start_nodes,
                    max_depth=max_depth,
                    max_paths=max_paths,
                )
                if len(inv.paths) > 0:
                    reachable_assets_set.add(target_id)
                    attack_paths_list.extend(inv.paths)
                    paths_by_target[target_id] = inv.paths

        reachable_assets = tuple(sorted(reachable_assets_set))
        credential_aware_count = len(reachable_assets)
        attack_paths = tuple(sorted(attack_paths_list, key=lambda p: (p.depth, p.id)))

        # Discovered credentials and identities
        discovered_creds = {f"creds:{seed_ident_id}"}
        for p in attack_paths:
            for cap in p.capabilities:
                if cap.startswith("creds:"):
                    discovered_creds.add(cap)
            for edge in p.edges:
                if edge.identity_id:
                    discovered_creds.add(f"creds:{edge.identity_id}")

        usable_credentials = tuple(sorted(discovered_creds))
        discovered_identities = {seed_ident_id}
        for cred in discovered_creds:
            ident_name = cred.split(":", 1)[1]
            discovered_identities.add(ident_name)
        reachable_identities = tuple(sorted(discovered_identities))

    # -----------------------------------------------------------------
    # 6. Critical Assets and Crown Jewels
    # -----------------------------------------------------------------
    critical_assets = tuple(
        sorted(
            aid for aid in reachable_assets
            if assets_map.get(aid) and assets_map[aid].criticality >= 4
        )
    )
    crown_jewels = tuple(
        sorted(
            aid for aid in reachable_assets
            if assets_map.get(aid) and assets_map[aid].crown_jewel
        )
    )

    # -----------------------------------------------------------------
    # 7. Narrative Explanation
    # -----------------------------------------------------------------
    divergence_count = network_upper_bound_count - credential_aware_count
    divergence_note = (
        f"Raw network topology indicates {network_upper_bound_count} descendant(s), "
        f"but strict credential validation restricts genuine reachability to {credential_aware_count} "
        f"asset(s) ({divergence_count} unauthenticated branch(es) safely unviable)."
        if divergence_count > 0
        else f"All {network_upper_bound_count} network descendant(s) are credential-reachable."
    )

    explanation = (
        f"Compromise of {seed_type} '{compromised_seed}' yields {credential_aware_count} "
        f"credential-aware reachable asset(s). {divergence_note} "
        f"Affected critical assets (criticality >= 4): {len(critical_assets)}; "
        f"Affected crown jewels: {len(crown_jewels)}. "
        f"Usable identities: {len(reachable_identities)}; Usable credentials: {len(usable_credentials)}."
    )

    return BlastRadiusResult(
        compromised_seed=compromised_seed,
        seed_type=seed_type,
        reachable_assets=reachable_assets,
        credential_aware_count=credential_aware_count,
        network_upper_bound=network_upper_bound,
        network_upper_bound_count=network_upper_bound_count,
        reachable_identities=reachable_identities,
        usable_credentials=usable_credentials,
        critical_assets=critical_assets,
        crown_jewels=crown_jewels,
        attack_paths=attack_paths,
        paths_by_target=paths_by_target,
        seeded_capabilities=seeded_capabilities,
        explanation=explanation,
    )


# Canonical alias
compute_blast_radius = calculate_blast_radius

__all__ = [
    "BlastRadiusResult",
    "calculate_blast_radius",
    "compute_blast_radius",
    "resolve_sessions_on_asset",
    "compute_network_descendants",
]
