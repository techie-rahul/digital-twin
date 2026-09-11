"""Synthetic dataset generation and experience collection for Digital Twin attack simulation.

Generates training samples by executing deterministic search on twin configurations
and recording which state-action transitions lie on winning paths to the crown jewel.
"""
from __future__ import annotations

import random
from pathlib import Path
from typing import Dict, List, Tuple
import networkx as nx

from backend.core.models import Agent, Control, Twin
from backend.core.twin import CyberDigitalTwin, clone
from backend.core.search import search
from backend.rules.compile import compile_twin, CompiledTwin
from backend.ml.features import extract_features


def generate_synthetic_experiences(
    base_twin_path: str = "backend/data/scenarios/golden.json",
    num_variations: int = 25,
    seed: int = 42,
) -> Tuple[List[List[float]], List[int]]:
    """Generate (X, y) training dataset using self-generated simulation experiences.
    
    X: Feature vectors of evaluated transitions
    y: 1 if transition is on a path that reached target, 0 otherwise
    """
    rng = random.Random(seed)
    base_path = Path(base_twin_path)
    if not base_path.exists():
        raise FileNotFoundError(f"Base scenario not found: {base_twin_path}")
        
    base_twin = Twin.model_validate_json(base_path.read_text(encoding="utf-8"))
    
    X: List[List[float]] = []
    y: List[int] = []
    
    target_id = "prod-db"
    
    # Generate variations by perturbing controls and agent initial capabilities
    for var_idx in range(num_variations):
        # 1. Random control perturbation (simulate different security postures)
        active_controls = []
        for ctrl in base_twin.controls:
            if rng.random() > 0.3:  # 70% chance to keep control active
                active_controls.append(ctrl)
                
        cloned_twin = clone(
            base_twin,
            new_id=f"twin-synth-{var_idx}",
            remove_controls=[c.id for c in base_twin.controls],
            add_controls=active_controls,
        )
        
        # 2. Agent variation (test different entry points and skills)
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
        
        # 3. Deterministic compilation and distance mapping
        dt = CyberDigitalTwin(cloned_twin)
        compiled_twin = compile_twin(cloned_twin)
        
        # Precompute target distance map in graph
        target_distance_map: Dict[str, int] = {}
        for n in dt.graph.nodes:
            try:
                target_distance_map[n] = nx.shortest_path_length(dt.graph, n, target_id)
            except (nx.NetworkXNoPath, nx.NodeNotFound):
                target_distance_map[n] = 8
                
        # 4. Run deterministic search to discover true winning paths
        inventory = search(compiled_twin, agent, target=target_id, assets=cloned_twin, max_depth=7)
        
        # Set of edges that actually appeared on at least one successful attack path
        winning_edge_signatures = set()
        for path in inventory.paths:
            for edge in path.edges:
                winning_edge_signatures.add((edge.src, edge.dst, edge.technique))
                
        # 5. Extract positive and negative training samples from all feasible edges
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
                
                X.append(feat)
                y.append(label)
                
    return X, y
