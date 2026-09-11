"""Synthetic dataset generation and experience collection for Digital Twin attack simulation.

Generates training samples by executing deterministic search on randomized twin configurations
and recording which state-action transitions lie on winning paths to the crown jewel.
Includes topology and control perturbations across train/validation/test splits.
"""
from __future__ import annotations

import random
from pathlib import Path
from typing import Dict, List, Tuple
import networkx as nx

from backend.core.models import Agent, Control, Edge, Twin
from backend.core.twin import CyberDigitalTwin, clone
from backend.core.search import search
from backend.rules.compile import compile_twin, CompiledTwin
from backend.ml.features import extract_features


def _generate_twin_samples(
    base_twin: Twin,
    var_idx: int,
    rng: random.Random,
    target_id: str = "prod-db",
) -> Tuple[List[List[float]], List[int]]:
    """Generate (X, y) samples from a single perturbed synthetic twin environment."""
    # 1. Random control perturbation (simulate diverse security postures)
    active_controls = [c for c in base_twin.controls if rng.random() > 0.35]
    
    # 2. Topology perturbation (randomly retain 80-100% of edges to vary connectivity)
    retained_edges = [e for e in base_twin.edges if rng.random() > 0.15]
    if not any(e.dst == target_id for e in retained_edges):
        # Ensure at least one incoming edge to target survives
        target_edges = [e for e in base_twin.edges if e.dst == target_id]
        if target_edges:
            retained_edges.append(rng.choice(target_edges))

    cloned_twin = clone(
        base_twin,
        new_id=f"twin-synth-{var_idx}",
        remove_controls=[c.id for c in base_twin.controls],
        add_controls=active_controls,
        remove_edges=list(base_twin.edges),
        add_edges=retained_edges,
    )

    # 3. Agent variation (test different footholds and initial capabilities)
    start_zones = rng.choice([("dmz",), ("corp",), ("dmz", "corp")])
    has_admin = rng.random() > 0.4
    caps = frozenset(["creds:id-user-admin"]) if has_admin else frozenset()

    agent = Agent(
        id=f"agent-synth-{var_idx}",
        name="Synthetic Attacker",
        start_zones=start_zones,
        capabilities=caps,
        objective="specific_target",
        noise_budget=1.0,
        skill=rng.uniform(0.4, 0.9),
    )

    # 4. Deterministic compilation and distance mapping
    dt = CyberDigitalTwin(cloned_twin)
    compiled_twin = compile_twin(cloned_twin)

    target_distance_map: Dict[str, int] = {}
    for n in dt.graph.nodes:
        try:
            target_distance_map[n] = nx.shortest_path_length(dt.graph, n, target_id)
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            target_distance_map[n] = 8

    # 5. Run deterministic search to discover true winning paths
    inventory = search(compiled_twin, agent, target=target_id, assets=cloned_twin, max_depth=7)

    # Winning edge signatures
    winning_edge_signatures = set()
    for path in inventory.paths:
        for edge in path.edges:
            winning_edge_signatures.add((edge.src, edge.dst, edge.technique))

    # 6. Extract positive and negative transition samples
    X_sample: List[List[float]] = []
    y_sample: List[int] = []

    for src, edges in compiled_twin.adjacency.items():
        for edge in edges:
            feat = extract_features(
                edge=edge,
                current_caps=agent.capabilities,
                twin=cloned_twin,
                graph=dt.graph,
                target_id=target_id,
                target_distance_map=target_distance_map,
            )
            sig = (edge.src, edge.dst, edge.technique)
            label = 1 if sig in winning_edge_signatures else 0

            X_sample.append(feat)
            y_sample.append(label)

    return X_sample, y_sample


def generate_synthetic_experiences(
    base_twin_path: str = "backend/data/scenarios/golden.json",
    num_train_twins: int = 30,
    num_val_twins: int = 8,
    num_test_twins: int = 8,
    seed: int = 42,
) -> Dict[str, Tuple[List[List[float]], List[int]]]:
    """Generate partitioned train, validation, and test datasets over independent twins."""
    rng = random.Random(seed)
    base_path = Path(base_twin_path)
    if not base_path.exists():
        raise FileNotFoundError(f"Base scenario not found: {base_twin_path}")

    base_twin = Twin.model_validate_json(base_path.read_text(encoding="utf-8"))

    splits = {
        "train": (num_train_twins, 0),
        "val": (num_val_twins, 1000),
        "test": (num_test_twins, 2000),
    }

    result = {}
    for split_name, (count, offset) in splits.items():
        X_split: List[List[float]] = []
        y_split: List[int] = []
        for i in range(count):
            X_t, y_t = _generate_twin_samples(base_twin, offset + i, rng)
            X_split.extend(X_t)
            y_split.extend(y_t)
        result[split_name] = (X_split, y_split)

    return result
