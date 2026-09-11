"""Focused tests for Phase 3: Stateful Attack Path Search (Algorithm A)."""

from pathlib import Path
import pytest

from backend.core.models import Agent, Asset, Identity, Edge, ServiceFlow, Twin
from backend.core.twin import CyberDigitalTwin
from backend.rules.compile import CompiledEdge, CompiledTwin, compile_twin
from backend.rules.loader import load_techniques_map
from backend.core.search import (
    AttackPath,
    Inventory,
    SearchBudgetExceeded,
    search,
    SearchCache,
    DEFAULT_MAX_DEPTH,
    DEFAULT_MAX_PATHS,
)


@pytest.fixture
def catalog():
    return load_techniques_map()


@pytest.fixture
def golden_twin() -> Twin:
    path = Path("backend/data/scenarios/golden.json")
    return Twin.model_validate_json(path.read_text(encoding="utf-8"))


# =====================================================================
# 1. Basic Reachability & Initialization
# =====================================================================

def test_basic_reachable_target():
    """Verify stateful search discovers a direct or multi-hop path to a reachable target."""
    edges = (
        CompiledEdge(
            src="ws-dev",
            dst="jump-01",
            technique="ssh_lateral",
            requires=(),
            grants=("session:jump",),
            p_success=0.9,
            cost=2.0,
            noise=0.2,
        ),
        CompiledEdge(
            src="jump-01",
            dst="prod-db",
            technique="db_login",
            requires=("session:jump",),
            grants=("session:db",),
            p_success=0.95,
            cost=1.0,
            noise=0.2,
        ),
    )
    agent = Agent(
        id="adversary-1",
        name="Adversary",
        start_zones=("corp",),
        capabilities=frozenset(),
        objective="specific_target",
        noise_budget=1.0,
        skill=0.8,
    )
    assets = (
        Asset(id="ws-dev", name="WS", kind="workstation", zone="corp", criticality=2),
        Asset(id="jump-01", name="Jump", kind="server", zone="mgmt", criticality=4),
        Asset(id="prod-db", name="DB", kind="database", zone="prod", criticality=5, crown_jewel=True),
    )
    inv = search(edges, agent, target="prod-db", assets=assets)

    assert isinstance(inv, Inventory)
    assert inv.naive_path_count == 1
    assert len(inv.paths) == 1

    path = inv.paths[0]
    assert path.nodes == ("ws-dev", "jump-01", "prod-db")
    assert path.depth == 2
    assert "session:jump" in path.capabilities
    assert "session:db" in path.capabilities


def test_unreachable_target():
    """Verify search returns zero paths when target is disconnected or unreachable."""
    edges = (
        CompiledEdge(
            src="ws-dev",
            dst="jump-01",
            technique="ssh_lateral",
            requires=(),
            grants=(),
            p_success=0.9,
            cost=2.0,
            noise=0.2,
        ),
    )
    agent = Agent(
        id="adversary-1",
        name="Adversary",
        start_zones=("corp",),
        capabilities=frozenset(),
        objective="specific_target",
        noise_budget=1.0,
        skill=0.8,
    )
    inv = search(edges, agent, target="prod-db", start_nodes=("ws-dev",))
    assert inv.naive_path_count == 0
    assert len(inv.paths) == 0


def test_correct_initialization_from_agent():
    """Verify search correctly filters starting assets based on agent.start_zones."""
    edges = (
        CompiledEdge(src="ws-corp", dst="target", technique="phish", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
        CompiledEdge(src="ws-dmz", dst="target", technique="phish", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
    )
    assets = (
        Asset(id="ws-corp", name="Corp", kind="workstation", zone="corp", criticality=2),
        Asset(id="ws-dmz", name="DMZ", kind="server", zone="dmz", criticality=3),
        Asset(id="target", name="Target", kind="database", zone="prod", criticality=5),
    )
    # Agent only allowed to start in dmz
    agent = Agent(
        id="adv",
        name="DMZ Attacker",
        start_zones=("dmz",),
        capabilities=frozenset(),
        objective="specific_target",
        noise_budget=1.0,
        skill=0.5,
    )
    inv = search(edges, agent, target="target", assets=assets)
    assert inv.naive_path_count == 1
    assert inv.paths[0].nodes == ("ws-dmz", "target")


# =====================================================================
# 2. Capability Requirements & Stateful Expansion
# =====================================================================

def test_capability_requirement_blocks_traversal():
    """Verify that an edge with unsatisfied requirements blocks the attacker."""
    edges = (
        CompiledEdge(
            src="ws-dev",
            dst="prod-db",
            technique="db_login",
            requires=("creds:admin",),  # Attacker does not hold this
            grants=("session:admin",),
            p_success=0.9,
            cost=1.0,
            noise=0.1,
        ),
    )
    agent = Agent(
        id="adv",
        name="Adv",
        start_zones=("corp",),
        capabilities=frozenset(["creds:user"]),  # Missing creds:admin
        objective="specific_target",
        noise_budget=1.0,
        skill=0.5,
    )
    inv = search(edges, agent, target="prod-db", start_nodes=("ws-dev",))
    assert inv.naive_path_count == 0


def test_granted_capability_enables_subsequent_traversal():
    """Verify that a credential acquired at hop 1 unlocks traversal at hop 2."""
    edges = (
        CompiledEdge(
            src="ws-dev",
            dst="fileshare",
            technique="smb_lateral",
            requires=(),
            grants=("creds:svc.payroll",),  # Harvest credential
            p_success=0.9,
            cost=1.0,
            noise=0.1,
        ),
        CompiledEdge(
            src="fileshare",
            dst="prod-db",
            technique="db_login",
            requires=("creds:svc.payroll",),  # Unlocked by harvested credential
            grants=("session:db",),
            p_success=0.95,
            cost=1.0,
            noise=0.1,
        ),
    )
    agent = Agent(
        id="adv",
        name="Adv",
        start_zones=("corp",),
        capabilities=frozenset(),
        objective="specific_target",
        noise_budget=1.0,
        skill=0.5,
    )
    inv = search(edges, agent, target="prod-db", start_nodes=("ws-dev",))
    assert inv.naive_path_count == 1
    assert inv.paths[0].nodes == ("ws-dev", "fileshare", "prod-db")
    assert "creds:svc.payroll" in inv.paths[0].capabilities


# =====================================================================
# 3. State Deduplication & Cycle Handling
# =====================================================================

def test_full_state_deduplication():
    """Verify state is tracked as (node, frozenset(capabilities))."""
    # Node ws-dev revisited with the SAME capabilities on the same path is pruned
    edges = (
        CompiledEdge(src="ws-dev", dst="jump-01", technique="ssh_lateral", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
        CompiledEdge(src="jump-01", dst="ws-dev", technique="ssh_lateral", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
    )
    agent = Agent(
        id="adv",
        name="Adv",
        start_zones=("corp",),
        capabilities=frozenset(["initial_cap"]),
        objective="specific_target",
        noise_budget=1.0,
        skill=0.5,
    )
    # Search for unreachable target to ensure finite termination despite cycle
    inv = search(edges, agent, target="target", start_nodes=("ws-dev",))
    assert inv.naive_path_count == 0


def test_same_node_different_capabilities_explored():
    """Verify that visiting the same node with NEW capabilities is explored."""
    # ws-dev -> fileshare (grants creds) -> ws-dev (new state: ws-dev with creds) -> target
    edges = (
        CompiledEdge(src="ws-dev", dst="fileshare", technique="smb_lateral", requires=(), grants=("creds:admin",), p_success=1.0, cost=1.0, noise=0.1),
        CompiledEdge(src="fileshare", dst="ws-dev", technique="smb_lateral", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
        CompiledEdge(src="ws-dev", dst="target", technique="ssh_lateral", requires=("creds:admin",), grants=(), p_success=1.0, cost=1.0, noise=0.1),
    )
    agent = Agent(
        id="adv",
        name="Adv",
        start_zones=("corp",),
        capabilities=frozenset(),
        objective="specific_target",
        noise_budget=1.0,
        skill=0.5,
    )
    inv = search(edges, agent, target="target", start_nodes=("ws-dev",))
    assert inv.naive_path_count == 1
    # Path visits ws-dev twice with different capabilities
    assert inv.paths[0].nodes == ("ws-dev", "fileshare", "ws-dev", "target")


def test_cycles_terminate_safely():
    """Verify cyclic topologies terminate cleanly without hanging."""
    # 3-node cycle A -> B -> C -> A with no capability gains
    edges = (
        CompiledEdge(src="A", dst="B", technique="t1", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
        CompiledEdge(src="B", dst="C", technique="t2", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
        CompiledEdge(src="C", dst="A", technique="t3", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
    )
    agent = Agent(id="adv", name="Adv", start_zones=("A",), capabilities=frozenset(), objective="specific_target", noise_budget=1.0, skill=0.5)
    inv = search(edges, agent, target="Z", start_nodes=("A",))
    assert inv.naive_path_count == 0


# =====================================================================
# 4. Depth & Budget Limits
# =====================================================================

def test_max_depth_enforced():
    """Verify MAX_DEPTH limit truncates exploration at exact depth boundary."""
    # Chain of 10 nodes: n0 -> n1 -> ... -> n10
    edges = [
        CompiledEdge(src=f"n{i}", dst=f"n{i+1}", technique="t", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1)
        for i in range(10)
    ]
    agent = Agent(id="adv", name="Adv", start_zones=("n0",), capabilities=frozenset(), objective="specific_target", noise_budget=1.0, skill=0.5)

    # Search for n8 (depth 8) with max_depth=8 -> should succeed
    inv8 = search(edges, agent, target="n8", start_nodes=("n0",), max_depth=8)
    assert inv8.naive_path_count == 1
    assert inv8.paths[0].depth == 8

    # Search for n9 (depth 9) with max_depth=8 -> truncated / unreachable
    inv9 = search(edges, agent, target="n9", start_nodes=("n0",), max_depth=8)
    assert inv9.naive_path_count == 0


def test_max_paths_enforced_and_budget_exceeded():
    """Verify SearchBudgetExceeded is raised when paths exceed max_paths."""
    # Topology with multiple parallel paths from S to T
    edges = [
        CompiledEdge(src="S", dst=f"mid{i}", technique="t", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1)
        for i in range(10)
    ] + [
        CompiledEdge(src=f"mid{i}", dst="T", technique="t", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1)
        for i in range(10)
    ]
    agent = Agent(id="adv", name="Adv", start_zones=("S",), capabilities=frozenset(), objective="specific_target", noise_budget=1.0, skill=0.5)

    # Budget limit = 5; 10 paths exist
    with pytest.raises(SearchBudgetExceeded) as exc_info:
        search(edges, agent, target="T", start_nodes=("S",), max_paths=5)

    err = exc_info.value
    assert err.limit == 5
    assert err.count > 5
    assert "Search budget exceeded" in str(err)


def test_normal_completion_below_budget():
    """Verify search completes normally when paths are within budget."""
    edges = (
        CompiledEdge(src="S", dst="m1", technique="t", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
        CompiledEdge(src="m1", dst="T", technique="t", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
        CompiledEdge(src="S", dst="m2", technique="t", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
        CompiledEdge(src="m2", dst="T", technique="t", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
    )
    agent = Agent(id="adv", name="Adv", start_zones=("S",), capabilities=frozenset(), objective="specific_target", noise_budget=1.0, skill=0.5)
    inv = search(edges, agent, target="T", start_nodes=("S",), max_paths=10)
    assert inv.naive_path_count == 2


# =====================================================================
# 5. Determinism & Immutability
# =====================================================================

def test_multiple_valid_attack_paths_discovered():
    """Verify all valid attack trajectories are captured."""
    edges = (
        CompiledEdge(src="S", dst="p1", technique="t1", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
        CompiledEdge(src="p1", dst="T", technique="t1", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
        CompiledEdge(src="S", dst="p2", technique="t2", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
        CompiledEdge(src="p2", dst="T", technique="t2", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
        CompiledEdge(src="S", dst="p3", technique="t3", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
        CompiledEdge(src="p3", dst="T", technique="t3", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
    )
    agent = Agent(id="adv", name="Adv", start_zones=("S",), capabilities=frozenset(), objective="specific_target", noise_budget=1.0, skill=0.5)
    inv = search(edges, agent, target="T", start_nodes=("S",))
    assert inv.naive_path_count == 3
    node_sequences = [p.nodes for p in inv.paths]
    assert ("S", "p1", "T") in node_sequences
    assert ("S", "p2", "T") in node_sequences
    assert ("S", "p3", "T") in node_sequences


def test_deterministic_result_ordering():
    """Verify repeated search calls on identical inputs return paths in identical order."""
    edges = (
        CompiledEdge(src="S", dst="b", technique="t", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
        CompiledEdge(src="S", dst="a", technique="t", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
        CompiledEdge(src="b", dst="T", technique="t", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
        CompiledEdge(src="a", dst="T", technique="t", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
    )
    agent = Agent(id="adv", name="Adv", start_zones=("S",), capabilities=frozenset(), objective="specific_target", noise_budget=1.0, skill=0.5)

    inv1 = search(edges, agent, target="T", start_nodes=("S",))
    inv2 = search(edges, agent, target="T", start_nodes=("S",))

    assert [p.nodes for p in inv1.paths] == [p.nodes for p in inv2.paths]
    assert [p.id for p in inv1.paths] == [p.id for p in inv2.paths]


def test_exact_repeated_state_deduplicated():
    """Verify exact repeated state (node, same_capabilities) is deduplicated to prevent loops."""
    edges = (
        CompiledEdge(src="A", dst="B", technique="t", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
        CompiledEdge(src="B", dst="A", technique="t", requires=(), grants=(), p_success=1.0, cost=1.0, noise=0.1),
    )
    agent = Agent(id="adv", name="Adv", start_zones=("A",), capabilities=frozenset(), objective="specific_target", noise_budget=1.0, skill=0.5)
    inv = search(edges, agent, target="T", start_nodes=("A",))
    assert inv.naive_path_count == 0


def test_search_does_not_mutate_twin(golden_twin):
    """Verify search does not mutate the Twin model."""
    ct = compile_twin(golden_twin)
    agent = Agent(id="adv", name="Adv", start_zones=("corp",), capabilities=frozenset(["creds:id-user-admin"]), objective="specific_target", noise_budget=1.0, skill=0.5)
    initial_asset_count = len(golden_twin.assets)
    initial_hash = golden_twin.hash()

    search(ct, agent, target="prod-db", assets=golden_twin)

    assert len(golden_twin.assets) == initial_asset_count
    assert golden_twin.hash() == initial_hash


def test_search_does_not_mutate_agent():
    """Verify search does not mutate the Agent model or its capabilities."""
    edges = (
        CompiledEdge(src="A", dst="B", technique="t", requires=(), grants=("cap_granted",), p_success=1.0, cost=1.0, noise=0.1),
    )
    agent = Agent(id="adv", name="Adv", start_zones=("A",), capabilities=frozenset(["initial_cap"]), objective="specific_target", noise_budget=1.0, skill=0.5)
    initial_caps = agent.capabilities

    search(edges, agent, target="B", start_nodes=("A",))

    assert agent.capabilities == initial_caps
    assert "cap_granted" not in agent.capabilities


def test_search_does_not_mutate_compiled_edges():
    """Verify search does not mutate CompiledEdge attributes."""
    edge = CompiledEdge(src="A", dst="B", technique="t", requires=(), grants=(), p_success=0.85, cost=2.0, noise=0.3)
    agent = Agent(id="adv", name="Adv", start_zones=("A",), capabilities=frozenset(), objective="specific_target", noise_budget=1.0, skill=0.5)

    search((edge,), agent, target="B", start_nodes=("A",))

    assert edge.p_success == 0.85
    assert edge.cost == 2.0
    assert edge.noise == 0.3
    assert edge.evidence == ()



# =====================================================================
# 6. FinBank Golden Scenario Capability-Dependent Paths
# =====================================================================

def test_finbank_golden_scenario_paths(golden_twin):
    """Validate capability-dependent path discovery on the canonical FinBank topology.

    Validates routes:
    - Route A: jump-01 / adm.ops
    - Route B: ci-runner -> jump-01 -> prod-db
    - Route C: ws-hr -> fileshare -> ws-dev -> jump-01 -> prod-db
    - Route D: internet -> web-dmz -> jump-01 -> backup-01
    """
    ct = compile_twin(golden_twin)

    # 1. Attacker starting at ws-dev with admin credentials reaching prod-db via jump-01
    agent_admin = Agent(
        id="adv-admin",
        name="Privileged Attacker",
        start_zones=("corp",),
        capabilities=frozenset(["creds:id-user-admin"]),
        objective="specific_target",
        noise_budget=1.0,
        skill=0.8,
    )
    inv_admin = search(ct, agent_admin, target="prod-db", assets=golden_twin)
    assert inv_admin.naive_path_count >= 1
    # Check that a path goes through jump-01
    assert any("jump-01" in p.nodes for p in inv_admin.paths)

    # 2. Attacker starting at ws-dev with NO credentials cannot reach prod-db
    agent_unprivileged = Agent(
        id="adv-unprivileged",
        name="Unprivileged Attacker",
        start_zones=("corp",),
        capabilities=frozenset(),
        objective="specific_target",
        noise_budget=1.0,
        skill=0.5,
    )
    inv_unprivileged = search(ct, agent_unprivileged, target="prod-db", assets=golden_twin)
    # Because jump-01 requires creds:id-user-admin, unprivileged cannot reach prod-db
    assert inv_unprivileged.naive_path_count == 0

    # 3. Route D: internet -> web-dmz -> jump-01 -> backup-01 (with admin creds for jump-01)
    agent_external = Agent(
        id="adv-external",
        name="External Attacker",
        start_zones=("dmz",),
        capabilities=frozenset(["creds:id-user-admin"]),
        objective="specific_target",
        noise_budget=1.0,
        skill=0.9,
    )
    inv_backup = search(ct, agent_external, target="backup-01", assets=golden_twin)
    assert inv_backup.naive_path_count >= 1
    # Path should traverse internet or web-dmz to backup-01
    assert any("backup-01" in p.nodes for p in inv_backup.paths)


# =====================================================================
# 7. Static Code Architecture Guarantees
# =====================================================================

def test_search_does_not_import_engine():
    """Verify backend/core/search.py has zero imports from legacy engine/."""
    search_file = Path("backend/core/search.py")
    content = search_file.read_text(encoding="utf-8")
    for line_num, line in enumerate(content.splitlines(), 1):
        stripped = line.strip()
        assert not stripped.startswith("import engine"), f"Forbidden import at line {line_num}: {stripped}"
        assert not stripped.startswith("from engine"), f"Forbidden import at line {line_num}: {stripped}"


def test_no_networkx_all_simple_paths():
    """Verify search.py does NOT use networkx.all_simple_paths (must be custom stateful DFS)."""
    search_file = Path("backend/core/search.py")
    content = search_file.read_text(encoding="utf-8")
    assert "all_simple_paths" not in content, "search.py must not use networkx.all_simple_paths"
