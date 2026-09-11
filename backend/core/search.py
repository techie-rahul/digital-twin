"""Stateful attack path search (Algorithm A) exploring feasible attack chains in state-space."""

import hashlib
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple, Union
from pydantic import BaseModel, Field

from backend.core.models import Agent, Asset, Twin
from backend.rules.compile import CompiledEdge, CompiledTwin


# =====================================================================
# 1. Models & Exceptions
# =====================================================================

class SearchBudgetExceeded(Exception):
    """Raised when attack path search exceeds the maximum allowed search budget (MAX_PATHS)."""

    def __init__(self, count: int, limit: int):
        super().__init__(
            f"Search budget exceeded: discovered {count} paths, exceeding limit of {limit}"
        )
        self.count = count
        self.limit = limit


class AttackPath(BaseModel, frozen=True):
    """An ordered deterministic attack trajectory discovered during stateful search."""

    id: str
    nodes: tuple[str, ...]
    edges: tuple[CompiledEdge, ...]
    capabilities: frozenset[str]
    depth: int


class Inventory(BaseModel, frozen=True):
    """Immutable collection of feasible attack paths discovered by state-space search."""

    paths: tuple[AttackPath, ...] = ()
    naive_path_count: int = 0
    target: Optional[str] = None
    agent_id: str = ""

    def __len__(self) -> int:
        return len(self.paths)

    def __iter__(self):
        return iter(self.paths)

    def __getitem__(self, index: int) -> AttackPath:
        return self.paths[index]

    @property
    def path_count(self) -> int:
        return len(self.paths)


# =====================================================================
# 2. Stateful DFS Search Algorithm (Algorithm A)
# =====================================================================

DEFAULT_MAX_DEPTH: int = 8
DEFAULT_MAX_PATHS: int = 5000


def _generate_path_id(nodes: tuple[str, ...], edges: tuple[CompiledEdge, ...]) -> str:
    """Generate a deterministic, content-derived path identity string."""
    raw = ":".join(nodes) + "|" + ":".join(f"{e.src}->{e.dst}@{e.technique}" for e in edges)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]
    return f"path-{digest}"


def search(
    edges: Union[CompiledTwin, Sequence[CompiledEdge]],
    agent: Agent,
    target: Optional[str] = None,
    *,
    assets: Optional[Union[Twin, Sequence[Asset], Dict[str, Asset]]] = None,
    start_nodes: Optional[Sequence[str]] = None,
    max_depth: int = DEFAULT_MAX_DEPTH,
    max_paths: int = DEFAULT_MAX_PATHS,
) -> Inventory:
    """Execute stateful state-space search discovering attack paths from agent footholds to target.

    State is represented strictly as:
        (current_node, frozenset(capabilities_held))

    Parameters
    ----------
    edges : Union[CompiledTwin, Sequence[CompiledEdge]]
        The compiled attack edges from Phase 2.
    agent : Agent
        The threat actor profile specifying starting zones, capabilities, and objective.
    target : Optional[str]
        Target asset ID when searching for a specific objective.
    assets : Optional[Union[Twin, Sequence[Asset], Dict[str, Asset]]]
        Asset inventory used to resolve valid starting nodes from `agent.start_zones`.
    start_nodes : Optional[Sequence[str]]
        Explicit list of starting nodes overriding asset zone resolution.
    max_depth : int
        Maximum number of transitions in a valid path (default 8).
    max_paths : int
        Maximum number of paths allowed before raising SearchBudgetExceeded (default 5000).

    Returns
    -------
    Inventory
        The immutable inventory of discovered attack paths and naive path count.

    Raises
    ------
    SearchBudgetExceeded
        If the number of discovered paths strictly exceeds `max_paths`.
    """
    # 1. Normalize edge collection and build deterministic adjacency
    if isinstance(edges, CompiledTwin):
        compiled_edge_list = list(edges.edges)
    else:
        compiled_edge_list = list(edges)

    # Deterministic adjacency mapping
    adjacency: Dict[str, List[CompiledEdge]] = {}
    for edge in compiled_edge_list:
        if edge.src not in adjacency:
            adjacency[edge.src] = []
        adjacency[edge.src].append(edge)

    # Sort outbound edges deterministically by (dst, technique, identity_id, requires, grants)
    for src in adjacency:
        adjacency[src].sort(
            key=lambda e: (
                e.dst,
                e.technique,
                e.identity_id or "",
                e.requires,
                e.grants,
            )
        )

    # 2. Resolve starting nodes based on agent.start_zones
    resolved_start_nodes: List[str] = []
    if start_nodes is not None:
        resolved_start_nodes = sorted(start_nodes)
    elif assets is not None:
        asset_list: Sequence[Asset]
        if isinstance(assets, Twin):
            asset_list = assets.assets
        elif isinstance(assets, dict):
            asset_list = list(assets.values())
        else:
            asset_list = assets

        for a in asset_list:
            if a.zone in agent.start_zones:
                resolved_start_nodes.append(a.id)
        resolved_start_nodes.sort()
    else:
        # Fallback: check if any source node in edges directly matches start_zones
        for src in sorted(adjacency.keys()):
            if src in agent.start_zones:
                resolved_start_nodes.append(src)
        if not resolved_start_nodes and agent.start_zones:
            # If no start nodes found, use start_zones entries as node IDs
            resolved_start_nodes = sorted(agent.start_zones)

    discovered_paths: List[AttackPath] = []
    initial_caps = frozenset(agent.capabilities)

    # 3. Explicit Stack DFS
    # Stack item: (current_node, capabilities, path_nodes, path_edges, visited_on_path)
    stack: List[
        Tuple[
            str,
            frozenset[str],
            Tuple[str, ...],
            Tuple[CompiledEdge, ...],
            frozenset[Tuple[str, frozenset[str]]],
        ]
    ] = []

    # Push start nodes in reverse order so lowest sorted is popped first
    for start_node in reversed(resolved_start_nodes):
        init_state = (start_node, initial_caps)
        stack.append(
            (
                start_node,
                initial_caps,
                (start_node,),
                (),
                frozenset([init_state]),
            )
        )

    while stack:
        (
            curr_node,
            curr_caps,
            path_nodes,
            path_edges,
            visited_on_path,
        ) = stack.pop()

        # Check if target is reached (must have traversed at least one edge)
        if target is not None and curr_node == target and len(path_edges) > 0:
            path_id = _generate_path_id(path_nodes, path_edges)
            attack_path = AttackPath(
                id=path_id,
                nodes=path_nodes,
                edges=path_edges,
                capabilities=curr_caps,
                depth=len(path_edges),
            )
            discovered_paths.append(attack_path)

            if len(discovered_paths) > max_paths:
                raise SearchBudgetExceeded(count=len(discovered_paths), limit=max_paths)

            # Target reached; stop expanding on this branch
            continue

        # Enforce strict MAX_DEPTH limit
        if len(path_edges) >= max_depth:
            continue

        # Outbound edge expansion
        candidate_edges = adjacency.get(curr_node, [])

        # Push to stack in reverse sorted order so ascending order is processed first
        for edge in reversed(candidate_edges):
            # 1. Edge source must equal current node (guaranteed by adjacency lookup)

            # 2. Check all edge requirements against held capabilities
            if not all(req in curr_caps for req in edge.requires):
                continue

            # 3. Traversal allowed: accumulate capabilities
            new_caps = curr_caps | frozenset(edge.grants)
            next_state = (edge.dst, new_caps)

            # 4. Cycle prevention: avoid exact repeated (node, capabilities) on THIS path
            if next_state in visited_on_path:
                continue

            # 5. Advance path
            next_path_nodes = (*path_nodes, edge.dst)
            next_path_edges = (*path_edges, edge)
            next_visited = visited_on_path | frozenset([next_state])

            stack.append(
                (
                    edge.dst,
                    new_caps,
                    next_path_nodes,
                    next_path_edges,
                    next_visited,
                )
            )

    return Inventory(
        paths=tuple(discovered_paths),
        naive_path_count=len(discovered_paths),
        target=target,
        agent_id=agent.id,
    )


# =====================================================================
# 3. Search Cache
# =====================================================================

class SearchCache:
    """Thread-safe, deterministic cache for path inventories keyed by configuration."""

    def __init__(self):
        self._cache: Dict[Tuple[Any, ...], Inventory] = {}

    def get(
        self,
        key: Tuple[Any, ...],
    ) -> Optional[Inventory]:
        return self._cache.get(key)

    def set(
        self,
        key: Tuple[Any, ...],
        inventory: Inventory,
    ) -> None:
        self._cache[key] = inventory

    def clear(self) -> None:
        self._cache.clear()

    def make_key(
        self,
        twin_id: str,
        agent: Agent,
        target: Optional[str],
        max_depth: int,
        max_paths: int,
    ) -> Tuple[Any, ...]:
        return (
            twin_id,
            agent.id,
            target,
            tuple(sorted(agent.capabilities)),
            tuple(sorted(agent.start_zones)),
            max_depth,
            max_paths,
        )


GLOBAL_SEARCH_CACHE = SearchCache()
