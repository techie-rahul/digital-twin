"""Technique and control compilation for digital twins."""

from typing import Dict, List, Optional, Set
from pydantic import BaseModel

from backend.core.models import Twin
from backend.rules.loader import TechniqueDefinition, load_techniques_map


class CompiledEdge(BaseModel, frozen=True):
    """Immutable compiled edge binding topology, technique, and guarding controls."""
    src: str
    dst: str
    technique_id: str
    prerequisites: tuple[str, ...]
    grants: tuple[str, ...]
    mitigating_controls: tuple[str, ...]
    active_control_ids: tuple[str, ...]


class CompiledTwin(BaseModel, frozen=True):
    """Immutable compiled digital twin graph ready for search and simulation."""
    twin_id: str
    adjacency: dict[str, tuple[CompiledEdge, ...]]


def compile_twin(
    twin: Twin,
    catalog: Optional[Dict[str, TechniqueDefinition]] = None
) -> CompiledTwin:
    """Compile a Twin topology and its active controls against a technique catalog.

    Parameters
    ----------
    twin : Twin
        The frozen digital twin snapshot.
    catalog : Optional[Dict[str, TechniqueDefinition]]
        Technique catalog indexed by MITRE technique ID. Defaults to canonical catalog.

    Returns
    -------
    CompiledTwin
        Deterministic, immutable compiled graph representation.

    Raises
    ------
    ValueError
        If any edge source, destination, or technique is invalid, or if any control
        scope entity does not exist in the Twin.
    """
    if catalog is None:
        catalog = load_techniques_map()

    # 1. Collect all valid entity IDs in the Twin (assets + identities)
    entity_ids: Set[str] = {a.id for a in twin.assets} | {i.id for i in twin.identities}

    # 2. Validate Control scopes
    for ctrl in twin.controls:
        for scope_entity in ctrl.scope:
            if scope_entity not in entity_ids:
                raise ValueError(
                    f"Control '{ctrl.id}' references unknown scope entity '{scope_entity}'"
                )

    # 3. Initialize deterministic adjacency mapping for all entities
    # Preserve entity ordering: assets first, then identities
    raw_adjacency: Dict[str, List[CompiledEdge]] = {}
    for a in twin.assets:
        raw_adjacency[a.id] = []
    for i in twin.identities:
        raw_adjacency[i.id] = []

    # 4. Process and compile each edge
    for edge in twin.edges:
        if edge.src not in entity_ids:
            raise ValueError(f"Edge references unknown source entity '{edge.src}'")
        if edge.dst not in entity_ids:
            raise ValueError(f"Edge references unknown destination entity '{edge.dst}'")
        if edge.technique not in catalog:
            raise ValueError(
                f"Edge '{edge.src}' -> '{edge.dst}' references unknown technique ID '{edge.technique}'"
            )

        tech = catalog[edge.technique]

        # 5. Map active controls guarding this edge
        active_ctrls: List[str] = []
        for ctrl in twin.controls:
            # Scope check: destination or source in scope
            in_scope = (edge.dst in ctrl.scope) or (edge.src in ctrl.scope)
            if not in_scope:
                continue

            # Blocking check: direct technique ID OR category intersection
            direct_match = edge.technique in ctrl.blocks
            category_match = bool(set(tech.blocks).intersection(ctrl.blocks))

            if direct_match or category_match:
                active_ctrls.append(ctrl.id)

        compiled_edge = CompiledEdge(
            src=edge.src,
            dst=edge.dst,
            technique_id=tech.id,
            prerequisites=tuple(tech.prerequisites),
            grants=tuple(tech.grants),
            mitigating_controls=tuple(tech.blocks),
            active_control_ids=tuple(sorted(active_ctrls)),
        )

        raw_adjacency[edge.src].append(compiled_edge)

    # 6. Finalize deterministic ordering: sort outbound edges by (dst, technique_id)
    final_adjacency: Dict[str, tuple[CompiledEdge, ...]] = {}
    for node_id, edges in raw_adjacency.items():
        sorted_edges = sorted(edges, key=lambda e: (e.dst, e.technique_id))
        final_adjacency[node_id] = tuple(sorted_edges)

    return CompiledTwin(
        twin_id=twin.id,
        adjacency=final_adjacency,
    )
