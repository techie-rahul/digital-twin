"""Node-by-Node Crawling Security Auditor.

An autonomous agent that walks the network graph like a chess piece — hop by
hop — analyzing every node it lands on, listing all vulnerabilities, calculating
risk, recommending the cheapest fix, then moving to the next node.

This module is a READ-ONLY explainability and node-level audit layer.
It does NOT modify the twin, run simulations, or call Algorithm A/B.
It uses the static graph topology, MITRE ATT&CK technique catalog, control definitions,
and business flow definitions to produce an explainable node-by-node audit.

NOTE: This topological crawl is designed for explainability and node-level exposure
analysis; it should NOT be confused with the authenticated, stateful attacker reachability
model from Phase 3 (which enforces strict credential barriers, capabilities, and compiled transitions).
Findings map to MITRE ATT&CK technique IDs rather than CVE numbers.
"""

from __future__ import annotations

from collections import defaultdict, deque
from typing import Dict, List, Literal, Optional, Sequence, Set, Tuple

from pydantic import BaseModel, Field

from backend.core.models import Asset, Control, Edge, Identity, ServiceFlow, Twin
from backend.rules.loader import TechniqueDefinition, load_techniques_map


# =====================================================================
# Zone security levels (higher = more secure)
# =====================================================================

ZONE_SECURITY: Dict[str, int] = {
    "dmz": 1,
    "corp": 2,
    "mgmt": 3,
    "prod": 4,
}

# =====================================================================
# Pydantic Models
# =====================================================================

VulnerabilityType = Literal[
    "technique_exposure",
    "missing_control",
    "credential_exposure",
    "zone_crossing",
    "flow_risk",
    "crown_jewel_proximity",
]

SeverityLevel = Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]


class Vulnerability(BaseModel, frozen=True):
    """A single vulnerability finding at a node."""

    type: VulnerabilityType
    severity: SeverityLevel
    title: str
    description: str
    mitre_id: Optional[str] = None
    affected_asset_id: str
    related_entity_id: Optional[str] = None  # edge dst, flow id, control id, etc.


class RecommendedFix(BaseModel, frozen=True):
    """The cheapest / best-value control to deploy at a node."""

    control_id: str
    control_name: str
    cost: int
    vulnerabilities_fixed: int
    description: str


class OutgoingEdgeInfo(BaseModel, frozen=True):
    """Summary of an outgoing attack edge from a node."""

    dst: str
    dst_name: str
    technique: str
    mitre_id: Optional[str] = None
    crosses_zone: bool = False
    dst_zone: str = ""


class FlowAtRisk(BaseModel, frozen=True):
    """A business flow passing through this node."""

    flow_id: str
    flow_name: str
    criticality: int
    role: Literal["source", "destination"]  # is this node the src or dst of the flow


class NodeAudit(BaseModel, frozen=True):
    """Full audit report for a single node on the crawl path."""

    step_index: int
    asset_id: str
    asset_name: str
    zone: str
    criticality: int
    crown_jewel: bool

    entry_technique: Optional[str] = None  # how the agent got here (None for start)
    entry_from: Optional[str] = None  # previous node asset ID

    vulnerabilities: tuple[Vulnerability, ...] = ()
    risk_score: float = 0.0
    recommended_fix: Optional[RecommendedFix] = None

    outgoing_edges: tuple[OutgoingEdgeInfo, ...] = ()
    flows_through: tuple[FlowAtRisk, ...] = ()
    crown_jewels_reachable: tuple[str, ...] = ()


class PrioritizedFix(BaseModel, frozen=True):
    """A deduplicated fix recommendation for the summary."""

    control_id: str
    control_name: str
    cost: int
    protects_nodes: tuple[str, ...]


class AuditSummary(BaseModel, frozen=True):
    """End-of-crawl roll-up across all nodes."""

    total_vulnerabilities: int = 0
    critical_count: int = 0
    high_count: int = 0
    medium_count: int = 0
    low_count: int = 0
    weakest_node: Optional[str] = None
    weakest_node_score: float = 0.0
    flows_at_risk: tuple[str, ...] = ()
    crown_jewel_reached: bool = False
    prioritized_fixes: tuple[PrioritizedFix, ...] = ()
    total_fix_cost: int = 0


class CrawlAuditPath(BaseModel, frozen=True):
    """Audit result for a single attack path."""

    path: tuple[str, ...] = ()
    total_hops: int = 0
    node_audits: tuple[NodeAudit, ...] = ()


class CrawlAuditResult(BaseModel, frozen=True):
    """Full crawl audit response — all paths audited."""

    start_node: str
    target_node: str
    total_paths: int = 0
    paths: tuple[CrawlAuditPath, ...] = ()
    summary: AuditSummary = AuditSummary()


# =====================================================================
# Helper: Build lookups from Twin
# =====================================================================

def _build_adjacency(twin: Twin) -> Dict[str, List[Edge]]:
    """Build adjacency list from twin edges (asset-to-asset only)."""
    asset_ids = {a.id for a in twin.assets}
    adj: Dict[str, List[Edge]] = defaultdict(list)
    for e in twin.edges:
        if e.src in asset_ids and e.dst in asset_ids:
            adj[e.src].append(e)
    return adj


def _build_asset_map(twin: Twin) -> Dict[str, Asset]:
    return {a.id: a for a in twin.assets}


def _build_identity_map(twin: Twin) -> Dict[str, Identity]:
    return {i.id: i for i in twin.identities}


def _build_identity_edges(twin: Twin) -> Dict[str, List[Edge]]:
    """Edges FROM identities TO assets (credential access paths)."""
    identity_ids = {i.id for i in twin.identities}
    result: Dict[str, List[Edge]] = defaultdict(list)
    for e in twin.edges:
        if e.src in identity_ids:
            result[e.dst].append(e)  # keyed by destination asset
    return result


def _build_flow_index(twin: Twin) -> Dict[str, List[ServiceFlow]]:
    """Index flows by asset ID (both src and dst)."""
    result: Dict[str, List[ServiceFlow]] = defaultdict(list)
    for f in twin.flows:
        result[f.src].append(f)
        result[f.dst].append(f)
    return result


def _build_control_scope_index(twin: Twin) -> Dict[str, List[Control]]:
    """Index controls by which assets they protect (scope)."""
    result: Dict[str, List[Control]] = defaultdict(list)
    for c in twin.controls:
        for asset_id in c.scope:
            result[asset_id].append(c)
    return result


def _crown_jewel_ids(twin: Twin) -> Set[str]:
    return {a.id for a in twin.assets if a.crown_jewel}


def _bfs_distance_to_crown_jewels(
    adj: Dict[str, List[Edge]], crown_jewels: Set[str], asset_ids: Set[str]
) -> Dict[str, int]:
    """BFS from every asset to find shortest distance to any crown jewel."""
    # Reverse adjacency for "how far is each node from a CJ"
    # Actually, we want forward distance: from node X, how many hops to nearest CJ
    distances: Dict[str, int] = {}

    for start in asset_ids:
        if start in crown_jewels:
            distances[start] = 0
            continue
        visited: Set[str] = {start}
        queue: deque[Tuple[str, int]] = deque([(start, 0)])
        found = False
        while queue and not found:
            node, dist = queue.popleft()
            for edge in adj.get(node, []):
                if edge.dst not in visited and edge.dst in asset_ids:
                    if edge.dst in crown_jewels:
                        distances[start] = dist + 1
                        found = True
                        break
                    visited.add(edge.dst)
                    queue.append((edge.dst, dist + 1))
        if not found:
            distances[start] = -1  # unreachable

    return distances


# =====================================================================
# Path finding: BFS all paths (bounded)
# =====================================================================

def _find_all_paths(
    adj: Dict[str, List[Edge]],
    start: str,
    target: str,
    max_depth: int = 8,
    max_paths: int = 20,
) -> List[List[str]]:
    """Find all simple paths from start to target using bounded DFS."""
    all_paths: List[List[str]] = []

    def dfs(node: str, path: List[str], visited: Set[str]) -> None:
        if len(all_paths) >= max_paths:
            return
        if len(path) > max_depth:
            return
        if node == target:
            all_paths.append(list(path))
            return
        for edge in adj.get(node, []):
            if edge.dst not in visited:
                visited.add(edge.dst)
                path.append(edge.dst)
                dfs(edge.dst, path, visited)
                path.pop()
                visited.discard(edge.dst)

    dfs(start, [start], {start})
    # Sort by length (shortest first)
    all_paths.sort(key=len)
    return all_paths


# =====================================================================
# Per-node vulnerability checks
# =====================================================================

def _check_technique_exposure(
    asset_id: str,
    adj: Dict[str, List[Edge]],
    asset_map: Dict[str, Asset],
    tech_map: Dict[str, TechniqueDefinition],
) -> Tuple[List[Vulnerability], List[OutgoingEdgeInfo]]:
    """Check 1: Outgoing attack techniques from this node."""
    vulns: List[Vulnerability] = []
    edges_info: List[OutgoingEdgeInfo] = []
    asset = asset_map.get(asset_id)
    if not asset:
        return vulns, edges_info

    src_zone_level = ZONE_SECURITY.get(asset.zone, 0)

    for edge in adj.get(asset_id, []):
        dst_asset = asset_map.get(edge.dst)
        if not dst_asset:
            continue

        dst_zone_level = ZONE_SECURITY.get(dst_asset.zone, 0)
        crosses_zone = dst_zone_level > src_zone_level

        tech = tech_map.get(edge.technique)
        mitre_id = tech.attck if tech else None
        tech_name = tech.name if tech and tech.name else edge.technique

        severity: SeverityLevel = "HIGH" if crosses_zone else "MEDIUM"

        zone_note = f" (ZONE ESCALATION: {asset.zone} → {dst_asset.zone})" if crosses_zone else ""
        vulns.append(Vulnerability(
            type="technique_exposure",
            severity=severity,
            title=f"{tech_name} to {dst_asset.name}",
            description=(
                f"Outgoing {edge.technique} edge enables pivot to "
                f"{dst_asset.name} ({dst_asset.id}) in zone {dst_asset.zone}.{zone_note}"
            ),
            mitre_id=mitre_id,
            affected_asset_id=asset_id,
            related_entity_id=edge.dst,
        ))

        edges_info.append(OutgoingEdgeInfo(
            dst=edge.dst,
            dst_name=dst_asset.name,
            technique=edge.technique,
            mitre_id=mitre_id,
            crosses_zone=crosses_zone,
            dst_zone=dst_asset.zone,
        ))

    return vulns, edges_info


def _check_missing_controls(
    asset_id: str,
    control_scope_index: Dict[str, List[Control]],
    active_control_ids: Set[str],
) -> List[Vulnerability]:
    """Check 2: Controls that COULD protect this node but aren't deployed."""
    vulns: List[Vulnerability] = []
    for ctrl in control_scope_index.get(asset_id, []):
        if ctrl.id not in active_control_ids:
            severity: SeverityLevel = "HIGH" if ctrl.efficacy >= 0.9 else "MEDIUM"
            vulns.append(Vulnerability(
                type="missing_control",
                severity=severity,
                title=f"No {ctrl.name} deployed",
                description=(
                    f"{ctrl.name} ({ctrl.id}) could protect this node "
                    f"(efficacy {ctrl.efficacy:.0%}) but is not active. "
                    f"Blocks: {', '.join(ctrl.blocks[:5])}. Cost: ${ctrl.cost:,}"
                ),
                affected_asset_id=asset_id,
                related_entity_id=ctrl.id,
            ))
    return vulns


def _check_credential_exposure(
    asset_id: str,
    identity_edges: Dict[str, List[Edge]],
    identity_map: Dict[str, Identity],
    tech_map: Dict[str, TechniqueDefinition],
) -> List[Vulnerability]:
    """Check 3: Identities/credentials accessible at this node."""
    vulns: List[Vulnerability] = []
    for edge in identity_edges.get(asset_id, []):
        identity = identity_map.get(edge.src)
        if not identity:
            continue

        tech = tech_map.get(edge.technique)
        mitre_id = tech.attck if tech else None

        if identity.tier == 0:
            severity: SeverityLevel = "CRITICAL"
        elif identity.tier == 1:
            severity = "HIGH"
        else:
            severity = "MEDIUM"

        vulns.append(Vulnerability(
            type="credential_exposure",
            severity=severity,
            title=f"{identity.kind.replace('_', ' ').title()} credential: {identity.name}",
            description=(
                f"Identity {identity.name} ({identity.id}, Tier-{identity.tier} "
                f"{identity.kind}) is accessible at this node. "
                f"Attacker gains {identity.kind} privileges."
            ),
            mitre_id=mitre_id,
            affected_asset_id=asset_id,
            related_entity_id=identity.id,
        ))
    return vulns


def _check_zone_crossings(
    asset_id: str,
    adj: Dict[str, List[Edge]],
    asset_map: Dict[str, Asset],
) -> List[Vulnerability]:
    """Check 5: Zone boundary crossings into more secure zones."""
    vulns: List[Vulnerability] = []
    asset = asset_map.get(asset_id)
    if not asset:
        return vulns

    src_level = ZONE_SECURITY.get(asset.zone, 0)

    for edge in adj.get(asset_id, []):
        dst_asset = asset_map.get(edge.dst)
        if not dst_asset:
            continue
        dst_level = ZONE_SECURITY.get(dst_asset.zone, 0)
        if dst_level > src_level:
            vulns.append(Vulnerability(
                type="zone_crossing",
                severity="HIGH",
                title=f"Zone escalation: {asset.zone} → {dst_asset.zone}",
                description=(
                    f"Outgoing edge to {dst_asset.name} ({dst_asset.id}) crosses "
                    f"from {asset.zone} (security level {src_level}) to "
                    f"{dst_asset.zone} (security level {dst_level}). "
                    f"This is a privilege escalation vector."
                ),
                affected_asset_id=asset_id,
                related_entity_id=edge.dst,
            ))

    return vulns


def _check_flow_risk(
    asset_id: str,
    flow_index: Dict[str, List[ServiceFlow]],
) -> Tuple[List[Vulnerability], List[FlowAtRisk]]:
    """Check 4: Business flows passing through this node."""
    vulns: List[Vulnerability] = []
    flows_at_risk: List[FlowAtRisk] = []

    for flow in flow_index.get(asset_id, []):
        role: Literal["source", "destination"] = "source" if flow.src == asset_id else "destination"

        if flow.criticality >= 5:
            severity: SeverityLevel = "CRITICAL"
        elif flow.criticality >= 4:
            severity = "HIGH"
        elif flow.criticality >= 3:
            severity = "MEDIUM"
        else:
            severity = "LOW"

        vulns.append(Vulnerability(
            type="flow_risk",
            severity=severity,
            title=f"Flow {flow.id}: {flow.name} (Crit {flow.criticality})",
            description=(
                f"Business flow {flow.id} ({flow.name}, Criticality {flow.criticality}/5) "
                f"uses this node as {role}. If compromised, this flow "
                f"{'originates from a hostile source' if role == 'source' else 'receives tainted data'}."
            ),
            affected_asset_id=asset_id,
            related_entity_id=flow.id,
        ))

        flows_at_risk.append(FlowAtRisk(
            flow_id=flow.id,
            flow_name=flow.name,
            criticality=flow.criticality,
            role=role,
        ))

    return vulns, flows_at_risk


def _check_crown_jewel_proximity(
    asset_id: str,
    cj_distances: Dict[str, int],
    crown_jewels: Set[str],
    adj: Dict[str, List[Edge]],
    asset_map: Dict[str, Asset],
) -> Tuple[List[Vulnerability], List[str]]:
    """Check 6: How close is this node to crown jewels."""
    vulns: List[Vulnerability] = []
    reachable_cjs: List[str] = []

    if asset_id in crown_jewels:
        vulns.append(Vulnerability(
            type="crown_jewel_proximity",
            severity="CRITICAL",
            title="THIS NODE IS A CROWN JEWEL",
            description=(
                f"This asset is itself a crown jewel. "
                f"Any compromise here is a critical security incident."
            ),
            affected_asset_id=asset_id,
        ))
        reachable_cjs.append(asset_id)
        return vulns, reachable_cjs

    dist = cj_distances.get(asset_id, -1)

    if dist == 1:
        # Find which CJs are 1 hop away
        for edge in adj.get(asset_id, []):
            if edge.dst in crown_jewels:
                dst_asset = asset_map.get(edge.dst)
                cj_name = dst_asset.name if dst_asset else edge.dst
                reachable_cjs.append(edge.dst)
                vulns.append(Vulnerability(
                    type="crown_jewel_proximity",
                    severity="CRITICAL",
                    title=f"1 hop from crown jewel: {cj_name}",
                    description=(
                        f"Crown jewel {cj_name} ({edge.dst}) is directly reachable "
                        f"via {edge.technique}. Compromising this node puts the "
                        f"crown jewel at immediate risk."
                    ),
                    affected_asset_id=asset_id,
                    related_entity_id=edge.dst,
                ))
    elif dist == 2:
        vulns.append(Vulnerability(
            type="crown_jewel_proximity",
            severity="HIGH",
            title="2 hops from a crown jewel",
            description=(
                f"A crown jewel is reachable within 2 hops from this node. "
                f"This asset is a high-value stepping stone for attackers."
            ),
            affected_asset_id=asset_id,
        ))

    return vulns, reachable_cjs


# =====================================================================
# Risk score calculation
# =====================================================================

def _compute_risk_score(
    asset: Asset,
    vulns: List[Vulnerability],
    outgoing_edges: List[OutgoingEdgeInfo],
    cj_distance: int,
    has_tier0_cred: bool,
) -> float:
    """Compute per-node risk score (0.0 – 10.0)."""
    score = asset.criticality * 1.5  # base: 1.5 – 7.5

    # Fan-out risk
    score += 0.5 * len(outgoing_edges)

    # Zone crossing
    if any(e.crosses_zone for e in outgoing_edges):
        score += 1.5

    # Crown jewel proximity
    if cj_distance == 0:
        score += 2.5  # IS a crown jewel
    elif cj_distance == 1:
        score += 2.0
    elif cj_distance == 2:
        score += 1.0

    # Missing controls
    missing_ctrl_count = sum(1 for v in vulns if v.type == "missing_control")
    score += 0.5 * missing_ctrl_count

    # Credential exposure
    if has_tier0_cred:
        score += 1.0

    return min(score, 10.0)


# =====================================================================
# Recommended fix selection
# =====================================================================

def _select_recommended_fix(
    asset_id: str,
    vulns: List[Vulnerability],
    control_scope_index: Dict[str, List[Control]],
    active_control_ids: Set[str],
) -> Optional[RecommendedFix]:
    """Find the best-value control to deploy at this node."""
    applicable_controls = [
        c for c in control_scope_index.get(asset_id, [])
        if c.id not in active_control_ids
    ]

    if not applicable_controls:
        return None

    best_ctrl = None
    best_score = -1.0
    best_fixed = 0

    for ctrl in applicable_controls:
        # Count how many vulns this control could address
        fixed = 0
        for v in vulns:
            if v.type == "missing_control" and v.related_entity_id == ctrl.id:
                fixed += 1
            elif v.type == "technique_exposure":
                # Check if the control blocks the technique used in this vuln
                if v.related_entity_id:
                    # The technique is embedded in the description, but we can
                    # check if any blocked technique matches
                    for blocked in ctrl.blocks:
                        if blocked in (v.description or ""):
                            fixed += 1
                            break

        # Always count at least 1 for a missing control
        fixed = max(fixed, 1)
        score = fixed / ctrl.cost
        if score > best_score:
            best_score = score
            best_ctrl = ctrl
            best_fixed = fixed

    if best_ctrl is None:
        return None

    return RecommendedFix(
        control_id=best_ctrl.id,
        control_name=best_ctrl.name,
        cost=best_ctrl.cost,
        vulnerabilities_fixed=best_fixed,
        description=(
            f"Deploy {best_ctrl.name} (${best_ctrl.cost:,}) — "
            f"blocks {', '.join(best_ctrl.blocks[:3])} on this node"
        ),
    )


# =====================================================================
# Audit a single node
# =====================================================================

def _audit_node(
    asset_id: str,
    step_index: int,
    entry_technique: Optional[str],
    entry_from: Optional[str],
    twin: Twin,
    adj: Dict[str, List[Edge]],
    asset_map: Dict[str, Asset],
    identity_map: Dict[str, Identity],
    identity_edges: Dict[str, List[Edge]],
    flow_index: Dict[str, List[ServiceFlow]],
    control_scope_index: Dict[str, List[Control]],
    active_control_ids: Set[str],
    crown_jewels: Set[str],
    cj_distances: Dict[str, int],
    tech_map: Dict[str, TechniqueDefinition],
) -> NodeAudit:
    """Run all 6 vulnerability checks on a single node."""
    asset = asset_map.get(asset_id)
    if not asset:
        return NodeAudit(
            step_index=step_index,
            asset_id=asset_id,
            asset_name=asset_id,
            zone="unknown",
            criticality=0,
            crown_jewel=False,
        )

    all_vulns: List[Vulnerability] = []

    # Check 1: Technique exposure
    tech_vulns, outgoing = _check_technique_exposure(asset_id, adj, asset_map, tech_map)
    all_vulns.extend(tech_vulns)

    # Check 2: Missing controls
    ctrl_vulns = _check_missing_controls(asset_id, control_scope_index, active_control_ids)
    all_vulns.extend(ctrl_vulns)

    # Check 3: Credential exposure
    cred_vulns = _check_credential_exposure(asset_id, identity_edges, identity_map, tech_map)
    all_vulns.extend(cred_vulns)

    # Check 4: Flow risk
    flow_vulns, flows_through = _check_flow_risk(asset_id, flow_index)
    all_vulns.extend(flow_vulns)

    # Check 5: Zone crossings (already partially captured in technique exposure,
    # but we add explicit zone-crossing vulns)
    zone_vulns = _check_zone_crossings(asset_id, adj, asset_map)
    all_vulns.extend(zone_vulns)

    # Check 6: Crown jewel proximity
    cj_vulns, cjs_reachable = _check_crown_jewel_proximity(
        asset_id, cj_distances, crown_jewels, adj, asset_map
    )
    all_vulns.extend(cj_vulns)

    # Deduplicate: remove zone_crossing vulns that duplicate technique_exposure
    # (zone crossings are already flagged in technique exposure with HIGH severity)
    # Keep them as separate findings for clarity

    # Risk score
    has_tier0 = any(v.severity == "CRITICAL" and v.type == "credential_exposure" for v in all_vulns)
    cj_dist = cj_distances.get(asset_id, -1)
    risk_score = _compute_risk_score(asset, all_vulns, list(outgoing), cj_dist, has_tier0)

    # Recommended fix
    rec_fix = _select_recommended_fix(asset_id, all_vulns, control_scope_index, active_control_ids)

    # Sort vulns: CRITICAL first, then HIGH, MEDIUM, LOW
    severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    all_vulns.sort(key=lambda v: severity_order.get(v.severity, 4))

    return NodeAudit(
        step_index=step_index,
        asset_id=asset_id,
        asset_name=asset.name,
        zone=asset.zone,
        criticality=asset.criticality,
        crown_jewel=asset.crown_jewel,
        entry_technique=entry_technique,
        entry_from=entry_from,
        vulnerabilities=tuple(all_vulns),
        risk_score=round(risk_score, 1),
        recommended_fix=rec_fix,
        outgoing_edges=tuple(outgoing),
        flows_through=tuple(flows_through),
        crown_jewels_reachable=tuple(cjs_reachable),
    )


# =====================================================================
# Build summary
# =====================================================================

def _build_summary(
    all_node_audits: List[NodeAudit],
    target_node: str,
    crown_jewels: Set[str],
) -> AuditSummary:
    """Roll up all node audits into a summary."""
    total = 0
    crit = high = med = low = 0
    weakest: Optional[str] = None
    weakest_score = 0.0
    flow_ids: Set[str] = set()
    fix_map: Dict[str, Tuple[str, int, List[str]]] = {}  # ctrl_id -> (name, cost, [nodes])

    for na in all_node_audits:
        for v in na.vulnerabilities:
            total += 1
            if v.severity == "CRITICAL":
                crit += 1
            elif v.severity == "HIGH":
                high += 1
            elif v.severity == "MEDIUM":
                med += 1
            else:
                low += 1

        if na.risk_score > weakest_score:
            weakest_score = na.risk_score
            weakest = na.asset_id

        for ft in na.flows_through:
            flow_ids.add(ft.flow_id)

        if na.recommended_fix:
            rf = na.recommended_fix
            if rf.control_id in fix_map:
                name, cost, nodes = fix_map[rf.control_id]
                if na.asset_id not in nodes:
                    nodes.append(na.asset_id)
            else:
                fix_map[rf.control_id] = (rf.control_name, rf.cost, [na.asset_id])

    # Build prioritized fixes sorted by cost
    prioritized = sorted(fix_map.items(), key=lambda x: x[1][1])
    fixes = tuple(
        PrioritizedFix(
            control_id=ctrl_id,
            control_name=name,
            cost=cost,
            protects_nodes=tuple(nodes),
        )
        for ctrl_id, (name, cost, nodes) in prioritized
    )

    return AuditSummary(
        total_vulnerabilities=total,
        critical_count=crit,
        high_count=high,
        medium_count=med,
        low_count=low,
        weakest_node=weakest,
        weakest_node_score=weakest_score,
        flows_at_risk=tuple(sorted(flow_ids)),
        crown_jewel_reached=target_node in crown_jewels,
        prioritized_fixes=fixes,
        total_fix_cost=sum(cost for _, (_, cost, _) in fix_map.items()),
    )


# =====================================================================
# Main entry point
# =====================================================================

def crawl_audit(
    twin: Twin,
    start_node: str,
    target_node: Optional[str] = None,
    active_control_ids: Sequence[str] = (),
    *,
    max_paths: int = 20,
    max_depth: int = 8,
) -> CrawlAuditResult:
    """Run a node-by-node crawling security audit across all attack paths.

    Parameters
    ----------
    twin : Twin
        The digital twin to audit.
    start_node : str
        Asset ID where the agent starts.
    target_node : str, optional
        Asset ID the agent tries to reach.  Defaults to the highest-criticality
        crown jewel.
    active_control_ids : Sequence[str]
        Controls to treat as deployed.  Default is empty (worst-case audit).
    max_paths : int
        Maximum number of paths to discover and audit.
    max_depth : int
        Maximum path length (hops).

    Returns
    -------
    CrawlAuditResult
        Full audit with per-path, per-node vulnerability reports and summary.
    """
    # Build lookups
    asset_map = _build_asset_map(twin)
    identity_map = _build_identity_map(twin)
    adj = _build_adjacency(twin)
    identity_edges = _build_identity_edges(twin)
    flow_index = _build_flow_index(twin)
    control_scope_index = _build_control_scope_index(twin)
    crown_jewels = _crown_jewel_ids(twin)
    active_set = set(active_control_ids)
    tech_map = load_techniques_map()

    # Default target: highest-criticality crown jewel
    if target_node is None:
        cj_assets = [a for a in twin.assets if a.crown_jewel]
        if cj_assets:
            target_node = max(cj_assets, key=lambda a: a.criticality).id
        else:
            # Fallback: highest criticality asset
            target_node = max(twin.assets, key=lambda a: a.criticality).id

    # Validate nodes exist
    if start_node not in asset_map:
        return CrawlAuditResult(
            start_node=start_node,
            target_node=target_node,
            total_paths=0,
            paths=(),
            summary=AuditSummary(),
        )
    if target_node not in asset_map:
        return CrawlAuditResult(
            start_node=start_node,
            target_node=target_node,
            total_paths=0,
            paths=(),
            summary=AuditSummary(),
        )

    # Crown jewel distances
    asset_ids = {a.id for a in twin.assets}
    cj_distances = _bfs_distance_to_crown_jewels(adj, crown_jewels, asset_ids)

    # Find all paths
    all_paths = _find_all_paths(adj, start_node, target_node, max_depth, max_paths)

    if not all_paths:
        # No path found — audit just the start node
        single_audit = _audit_node(
            start_node, 1, None, None, twin, adj, asset_map, identity_map,
            identity_edges, flow_index, control_scope_index, active_set,
            crown_jewels, cj_distances, tech_map,
        )
        return CrawlAuditResult(
            start_node=start_node,
            target_node=target_node,
            total_paths=0,
            paths=(),
            summary=_build_summary([single_audit], target_node, crown_jewels),
        )

    # Audit each path
    audited_paths: List[CrawlAuditPath] = []
    all_node_audits: List[NodeAudit] = []

    for path in all_paths:
        path_audits: List[NodeAudit] = []
        for i, node_id in enumerate(path):
            entry_tech = None
            entry_from = None
            if i > 0:
                prev = path[i - 1]
                entry_from = prev
                # Find the edge technique
                for edge in adj.get(prev, []):
                    if edge.dst == node_id:
                        entry_tech = edge.technique
                        break

            na = _audit_node(
                node_id, i + 1, entry_tech, entry_from, twin, adj,
                asset_map, identity_map, identity_edges, flow_index,
                control_scope_index, active_set, crown_jewels, cj_distances,
                tech_map,
            )
            path_audits.append(na)
            all_node_audits.append(na)

        audited_paths.append(CrawlAuditPath(
            path=tuple(path),
            total_hops=len(path) - 1,
            node_audits=tuple(path_audits),
        ))

    # Build global summary (deduplicated across all paths)
    # Use only unique node audits (by asset_id, keep highest risk_score)
    unique_audits: Dict[str, NodeAudit] = {}
    for na in all_node_audits:
        if na.asset_id not in unique_audits or na.risk_score > unique_audits[na.asset_id].risk_score:
            unique_audits[na.asset_id] = na

    summary = _build_summary(list(unique_audits.values()), target_node, crown_jewels)

    return CrawlAuditResult(
        start_node=start_node,
        target_node=target_node,
        total_paths=len(audited_paths),
        paths=tuple(audited_paths),
        summary=summary,
    )
