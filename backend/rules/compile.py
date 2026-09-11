"""Technique and control compilation for digital twins."""

from typing import Any, Dict, Iterable, List, NamedTuple, Optional, Sequence, Set, Tuple, Union
from pydantic import BaseModel, Field

from backend.core.models import Asset, Control, Edge, Identity, ServiceFlow, Twin
from backend.rules.loader import TechniqueDefinition, load_techniques_map


# =====================================================================
# 1. Compiled Edge & Compiled Twin Contracts
# =====================================================================

class CompiledEdge(BaseModel, frozen=True):
    """Immutable compiled attack transition ready for state-space search and simulation."""

    src: str
    dst: str
    technique: str
    identity_id: Optional[str] = None
    requires: tuple[str, ...] = ()
    grants: tuple[str, ...] = ()
    p_success: float
    cost: float
    noise: float
    evidence: tuple[str, ...] = ()


class CompiledTwin(BaseModel, frozen=True):
    """Immutable compiled digital twin graph ready for search and simulation."""

    twin_id: str
    edges: tuple[CompiledEdge, ...] = ()
    adjacency: dict[str, tuple[CompiledEdge, ...]] = {}


# =====================================================================
# 2. Channel & Control Models
# =====================================================================

class Channel(NamedTuple):
    """Projected communication channel between source and destination entities."""

    technique: Optional[str]
    src: str
    src_zone: str
    dst: str
    dst_zone: str
    protocol: Optional[str]
    port: Optional[int]
    identity_id: Optional[str]
    identity_kind: Optional[str]


class ControlSelector(BaseModel, frozen=True):
    """Declarative selector for matching traffic channels. Empty fields match ANY."""

    techniques: tuple[str, ...] = ()
    src_zones: tuple[str, ...] = ()
    dst_zones: tuple[str, ...] = ()
    src_assets: tuple[str, ...] = ()
    dst_assets: tuple[str, ...] = ()
    protocols: tuple[str, ...] = ()
    ports: tuple[int, ...] = ()
    identity_ids: tuple[str, ...] = ()
    identity_kinds: tuple[str, ...] = ()


class ControlImpact(BaseModel, frozen=True):
    """Security control definition with selector, exceptions, efficacy, and flow impact."""

    id: str = "ctrl"
    name: str = "Control"
    selector: ControlSelector = Field(default_factory=ControlSelector)
    exceptions: tuple[ControlSelector, ...] = ()
    efficacy: float = 1.0
    breaks_flows: bool = False


# =====================================================================
# 3. Channel Projection & Selector Matching
# =====================================================================

def to_channel(
    item: Union[CompiledEdge, Edge, ServiceFlow],
    assets: Dict[str, Asset],
    identities: Dict[str, Identity],
    catalog: Dict[str, TechniqueDefinition],
    identity_id: Optional[str] = None,
) -> Channel:
    """Project a CompiledEdge, Edge, or ServiceFlow into the canonical Channel representation."""
    src_id = item.src
    dst_id = item.dst
    technique_key = item.technique

    # Resolve technique definition (supports canonical ID and ATT&CK ID)
    tech = catalog.get(technique_key)
    protocol = tech.protocol if tech else None
    port = tech.port if tech else None

    # Resolve zones
    src_asset = assets.get(src_id)
    dst_asset = assets.get(dst_id)
    src_zone = src_asset.zone if src_asset else ""
    dst_zone = dst_asset.zone if dst_asset else ""

    # Resolve identity
    resolved_identity_id = identity_id
    if resolved_identity_id is None and hasattr(item, "identity_id"):
        resolved_identity_id = getattr(item, "identity_id")
    if resolved_identity_id is None and src_id in identities:
        resolved_identity_id = src_id

    identity_kind = None
    if resolved_identity_id and resolved_identity_id in identities:
        identity_kind = identities[resolved_identity_id].kind

    return Channel(
        technique=technique_key,
        src=src_id,
        src_zone=src_zone,
        dst=dst_id,
        dst_zone=dst_zone,
        protocol=protocol,
        port=port,
        identity_id=resolved_identity_id,
        identity_kind=identity_kind,
    )


def selector_matches(selector: ControlSelector, channel: Channel) -> bool:
    """Check if a selector matches a channel. Empty selector collections mean ANY."""
    if selector.techniques and channel.technique not in selector.techniques:
        return False
    if selector.src_zones and channel.src_zone not in selector.src_zones:
        return False
    if selector.dst_zones and channel.dst_zone not in selector.dst_zones:
        return False
    if selector.src_assets and channel.src not in selector.src_assets:
        return False
    if selector.dst_assets and channel.dst not in selector.dst_assets:
        return False
    if selector.protocols and channel.protocol not in selector.protocols:
        return False
    if selector.ports and channel.port not in selector.ports:
        return False
    if selector.identity_ids and channel.identity_id not in selector.identity_ids:
        return False
    if selector.identity_kinds and channel.identity_kind not in selector.identity_kinds:
        return False
    return True


def matches(impact: Union[ControlImpact, ControlSelector], channel: Channel) -> bool:
    """Evaluate whether a ControlImpact or ControlSelector matches a Channel.

    Exceptions in ControlImpact override the selector (if any exception matches, returns False).
    """
    if isinstance(impact, ControlSelector):
        return selector_matches(impact, channel)

    if not selector_matches(impact.selector, channel):
        return False

    # Exceptions override the selector
    for exc in impact.exceptions:
        if selector_matches(exc, channel):
            return False

    return True


# =====================================================================
# 4. Compiler Implementation
# =====================================================================

HOST_LOCAL_TECHNIQUES = {"cred_dump", "priv_esc_local"}


def _control_to_impact(ctrl: Control) -> ControlImpact:
    """Convert a core Control model into a ControlImpact."""
    return ControlImpact(
        id=ctrl.id,
        name=ctrl.name,
        selector=ControlSelector(
            techniques=tuple(ctrl.blocks),
            dst_assets=tuple(ctrl.scope),
        ),
        efficacy=ctrl.efficacy,
        breaks_flows=False,
    )


def compile_twin(
    twin: Twin,
    catalog: Optional[Dict[str, TechniqueDefinition]] = None,
    control_impacts: Optional[Iterable[Union[Control, ControlImpact]]] = None,
    naive: bool = False,
) -> CompiledTwin:
    """Compile a Twin topology and its active controls into an executable transition model.

    Rules:
    A. NEVER INVENT TRANSITIONS: Every transition originates from an explicitly declared Twin edge.
    B. ONE TECHNIQUE PER EDGE: Each Twin edge represents exactly one technique.
    C. CREDENTIAL EXPANSION: If a technique requires `creds:who`, expand for each identity with
       login/admin privileges on `edge.dst`.
    D. SESSION CREDENTIALS: If a technique requires `creds:sessions@src`, resolve credentials for
       identities with a session on `src`.
    E. HOST-LOCAL TECHNIQUES: `cred_dump` and `priv_esc_local` must only operate where explicitly
       represented by Twin self-edges (`src == dst`).

    Parameters
    ----------
    twin : Twin
        The frozen digital twin snapshot.
    catalog : Optional[Dict[str, TechniqueDefinition]]
        Technique catalog indexed by ID. Defaults to the canonical catalog.
    control_impacts : Optional[Iterable[Union[Control, ControlImpact]]]
        Controls to apply during compilation. Defaults to `twin.controls`.
    naive : bool
        If True, any matched attack edge is completely removed.
        If False, the edge remains with degraded `p_success = original_p_success * (1 - efficacy)`.

    Returns
    -------
    CompiledTwin
        Compiled immutable twin containing all admissible attack transitions.
    """
    if catalog is None:
        catalog = load_techniques_map()

    # Asset and Identity registries
    assets_map: Dict[str, Asset] = {a.id: a for a in twin.assets}
    identities_map: Dict[str, Identity] = {i.id: i for i in twin.identities}
    valid_entity_ids: Set[str] = set(assets_map.keys()) | set(identities_map.keys())

    # Build identity privilege mappings from explicit Twin edges
    # Identities with login/admin on dst:
    identities_on_dst: Dict[str, List[Identity]] = {eid: [] for eid in valid_entity_ids}
    for e in twin.edges:
        if e.src in identities_map and e.dst in assets_map:
            identities_on_dst[e.dst].append(identities_map[e.src])

    # Convert controls into ControlImpact list
    active_impacts: List[ControlImpact] = []
    source_controls = control_impacts if control_impacts is not None else twin.controls
    for c in source_controls:
        if isinstance(c, ControlImpact):
            active_impacts.append(c)
        elif isinstance(c, Control):
            active_impacts.append(_control_to_impact(c))

    compiled_edges: List[CompiledEdge] = []

    # Process each explicitly declared Twin edge (Rule A & B)
    for edge in twin.edges:
        if edge.src not in valid_entity_ids:
            raise ValueError(f"Edge references unknown source entity '{edge.src}'")
        if edge.dst not in valid_entity_ids:
            raise ValueError(f"Edge references unknown destination entity '{edge.dst}'")

        if edge.technique not in catalog:
            raise ValueError(
                f"Edge '{edge.src}' -> '{edge.dst}' references unknown technique '{edge.technique}'"
            )

        tech = catalog[edge.technique]

        # Rule E: Host-local techniques must only operate where explicitly self-edges
        if tech.id in HOST_LOCAL_TECHNIQUES and edge.src != edge.dst:
            continue

        # Check for Credential Expansion (Rule C) and Session Credentials (Rule D)
        has_creds_who = "creds:who" in tech.requires
        has_session_src = "creds:sessions@src" in tech.requires

        candidate_instances: List[Tuple[Optional[str], tuple[str, ...], tuple[str, ...]]] = []

        if has_creds_who:
            # Rule C: expand for each identity having access to dst
            matching_identities = identities_on_dst.get(edge.dst, [])
            if matching_identities:
                for ident in matching_identities:
                    reqs = tuple(
                        r.replace("creds:who", f"creds:{ident.id}") for r in tech.requires
                    )
                    grants = tuple(
                        g.replace("who", ident.id) for g in tech.grants
                    )
                    candidate_instances.append((ident.id, reqs, grants))
            else:
                candidate_instances.append((None, tuple(tech.requires), tuple(tech.grants)))
        elif has_session_src:
            # Rule D: resolve credentials for identities with a session on src
            sessions_at_src = identities_on_dst.get(edge.src, [])
            reqs = tuple(r for r in tech.requires if r != "creds:sessions@src")
            if sessions_at_src:
                grants_list = list(tech.grants)
                if "creds:dumped" in grants_list:
                    grants_list.remove("creds:dumped")
                for s_ident in sessions_at_src:
                    grants_list.append(f"creds:{s_ident.id}")
                grants = tuple(grants_list)
            else:
                grants = tuple(tech.grants)
            candidate_instances.append((None, reqs, grants))
        else:
            # Standard transition
            ident_id = edge.src if edge.src in identities_map else None
            candidate_instances.append((ident_id, tuple(tech.requires), tuple(tech.grants)))

        # Evaluate candidate instances against controls
        for ident_id, reqs, grants in candidate_instances:
            channel = to_channel(
                edge,
                assets_map,
                identities_map,
                catalog,
                identity_id=ident_id,
            )

            # Match active controls
            matched_controls: List[ControlImpact] = [
                impact for impact in active_impacts if matches(impact, channel)
            ]

            # Rule 6: Control behavior
            if matched_controls:
                if naive:
                    # In naive mode, a matched attack transition is blocked / removed
                    continue

                # In honest mode (naive=False), degrade p_success deterministically
                p_success = tech.base_success
                for ctrl in matched_controls:
                    p_success *= (1.0 - ctrl.efficacy)
                evidence = tuple(sorted(ctrl.id for ctrl in matched_controls))
            else:
                p_success = tech.base_success
                evidence = ()

            compiled_edge = CompiledEdge(
                src=edge.src,
                dst=edge.dst,
                technique=tech.id,
                identity_id=ident_id,
                requires=reqs,
                grants=grants,
                p_success=round(p_success, 6),
                cost=tech.cost,
                noise=tech.noise,
                evidence=evidence,
            )
            compiled_edges.append(compiled_edge)

    # Sort compiled edges deterministically
    sorted_edges = sorted(
        compiled_edges,
        key=lambda e: (e.src, e.dst, e.technique, e.identity_id or ""),
    )

    # Build adjacency mapping
    adjacency: Dict[str, List[CompiledEdge]] = {eid: [] for eid in valid_entity_ids}
    for e in sorted_edges:
        if e.src in adjacency:
            adjacency[e.src].append(e)

    final_adjacency = {k: tuple(v) for k, v in adjacency.items()}

    return CompiledTwin(
        twin_id=twin.id,
        edges=tuple(sorted_edges),
        adjacency=final_adjacency,
    )
