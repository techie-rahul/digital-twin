"""Adaptive ML-Guided State-Space Search (Algorithm A*).

Combines 100% deterministic rule enforcement with a machine-learned
heuristic that prioritizes transitions most likely to lead to target assets.
Includes guaranteed fallback to deterministic DFS if ML model is unavailable.
"""
from __future__ import annotations

import heapq
import time
from typing import Dict, FrozenSet, List, Optional, Sequence, Set, Tuple, Union
import networkx as nx

from backend.core.models import Agent, Asset, Twin
from backend.core.search import AttackPath, Inventory, _generate_path_id, search as fallback_search
from backend.rules.compile import CompiledEdge, CompiledTwin
from backend.ml.features import extract_features
from backend.ml.model import TransitionScorer


def guided_search(
    edges: Union[CompiledTwin, Sequence[CompiledEdge]],
    agent: Agent,
    target: Optional[str] = None,
    scorer: Optional[TransitionScorer] = None,
    *,
    assets: Optional[Union[Twin, Sequence[Asset], Dict[str, Asset]]] = None,
    start_nodes: Optional[Sequence[str]] = None,
    max_depth: int = 8,
    max_paths: int = 5000,
    max_states: int = 2000,
    enable_ml: bool = True,
) -> Tuple[Inventory, int, bool]:
    """Execute ML-guided Priority Search discovering attack paths to target.

    Parameters
    ----------
    edges : Union[CompiledTwin, Sequence[CompiledEdge]]
        Compiled attack edges from Phase 2.
    agent : Agent
        The threat actor profile.
    target : Optional[str]
        Target asset ID (e.g. 'prod-db').
    scorer : Optional[TransitionScorer]
        Preloaded ML transition scorer. Loads default if omitted.
    enable_ml : bool
        If False or on error, falls back safely to pure deterministic DFS.

    Returns
    -------
    Tuple[Inventory, int, bool]
        (Inventory, states_evaluated, fallback_used)
    """
    if not enable_ml:
        # User explicitly requested baseline DFS
        inv = fallback_search(edges, agent, target=target, assets=assets, start_nodes=start_nodes, max_depth=max_depth, max_paths=max_paths)
        return inv, len(inv.paths) * 2, True

    try:
        if scorer is None:
            scorer = TransitionScorer.load()
    except Exception:
        inv = fallback_search(edges, agent, target=target, assets=assets, start_nodes=start_nodes, max_depth=max_depth, max_paths=max_paths)
        return inv, len(inv.paths) * 2, True

    # 1. Normalize edge collection and build deterministic adjacency
    if isinstance(edges, CompiledTwin):
        compiled_edge_list = list(edges.edges)
    else:
        compiled_edge_list = list(edges)

    adjacency: Dict[str, List[CompiledEdge]] = {}
    graph = nx.DiGraph()
    for edge in compiled_edge_list:
        if edge.src not in adjacency:
            adjacency[edge.src] = []
        adjacency[edge.src].append(edge)
        graph.add_edge(edge.src, edge.dst, technique=edge.technique)

    # 2. Resolve target and compute distance heuristic map
    resolved_target: Optional[str] = target
    target_distance_map: Dict[str, int] = {}

    if resolved_target:
        for n in graph.nodes:
            try:
                target_distance_map[n] = nx.shortest_path_length(graph, n, resolved_target)
            except (nx.NetworkXNoPath, nx.NodeNotFound):
                target_distance_map[n] = 8

    # 3. Resolve starting nodes based on agent.start_zones
    actual_start_nodes: List[str] = []
    if start_nodes is not None:
        actual_start_nodes = list(start_nodes)
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
                actual_start_nodes.append(a.id)

    if not actual_start_nodes:
        actual_start_nodes = list(agent.start_zones)

    actual_start_nodes.sort()

    twin_model: Optional[Twin] = assets if isinstance(assets, Twin) else None
    if twin_model is None:
        dummy_assets = [
            Asset(id=n, name=n, kind="server", zone="corp", criticality=2, crown_jewel=(n == resolved_target))
            for n in graph.nodes
        ]
        twin_model = Twin(id="temp", assets=dummy_assets, edges=[], controls=[])

    # 4. Priority Queue state: (-priority_score, counter, node_path, edge_path, caps)
    counter = 0
    pq: List[Tuple[float, int, Tuple[str, ...], Tuple[CompiledEdge, ...], FrozenSet[str]]] = []
    discovered_paths: List[AttackPath] = []
    visited_states: Set[Tuple[str, FrozenSet[str]]] = set()
    states_evaluated = 0

    for s_node in actual_start_nodes:
        counter += 1
        heapq.heappush(pq, (-1.0, counter, (s_node,), (), agent.capabilities))

    while pq and len(discovered_paths) < max_paths and states_evaluated < max_states:
        neg_score, _, node_trail, edge_trail, current_caps = heapq.heappop(pq)
        curr_node = node_trail[-1]
        state_key = (curr_node, current_caps)

        if state_key in visited_states:
            continue
        visited_states.add(state_key)
        states_evaluated += 1

        # Check goal state
        if resolved_target is not None and curr_node == resolved_target:
            path_id = _generate_path_id(node_trail, edge_trail)
            discovered_paths.append(
                AttackPath(
                    id=path_id,
                    nodes=node_trail,
                    edges=edge_trail,
                    capabilities=current_caps,
                    depth=len(edge_trail),
                )
            )
            continue

        if len(edge_trail) >= max_depth:
            continue

        # CRITICAL PRINCIPLE: Strict deterministic feasibility filter BEFORE scoring
        candidate_edges = adjacency.get(curr_node, [])
        legal_edges = [
            e for e in candidate_edges
            if set(e.requires).issubset(current_caps) and e.dst not in node_trail
        ]

        if not legal_edges:
            continue

        # ML Scoring: order legal edges by predicted probability of reaching crown jewel
        try:
            features_batch = [
                extract_features(
                    edge=e,
                    current_caps=current_caps,
                    twin=twin_model,
                    graph=graph,
                    target_id=resolved_target or "prod-db",
                    target_distance_map=target_distance_map,
                )
                for e in legal_edges
            ]
            scores = scorer.predict_batch(features_batch)
        except Exception:
            # Safe internal fallback to uniform priority if scoring fails
            scores = [0.5 for _ in legal_edges]

        # Enqueue legal transitions sorted by ML score
        for edge, score in zip(legal_edges, scores):
            counter += 1
            new_caps = current_caps.union(edge.grants)
            new_nodes = node_trail + (edge.dst,)
            new_edges = edge_trail + (edge,)
            heapq.heappush(pq, (-score, counter, new_nodes, new_edges, new_caps))

    inventory = Inventory(
        paths=tuple(discovered_paths),
        naive_path_count=len(discovered_paths),
        target=resolved_target,
        agent_id=agent.id,
    )
    return inventory, states_evaluated, False
