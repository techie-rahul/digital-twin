"""Focused tests for the v2.1 technique compiler and control mapping."""

import pytest
from pydantic import ValidationError

from backend.core.models import Asset, Identity, Edge, Control, Twin
from backend.rules.loader import TechniqueDefinition, load_techniques_map
from backend.rules.compile import CompiledEdge, CompiledTwin, compile_twin


@pytest.fixture
def minimal_twin() -> Twin:
    """Construct a minimal valid Twin using core v2.1 models."""
    asset1 = Asset(
        id="srv-web",
        name="Web Server",
        kind="server",
        zone="dmz",
        criticality=3,
        crown_jewel=False,
    )
    asset2 = Asset(
        id="srv-db",
        name="Database Server",
        kind="database",
        zone="prod",
        criticality=5,
        crown_jewel=True,
    )
    user = Identity(
        id="user-alice",
        name="Alice Admin",
        kind="admin",
        tier=0,
    )
    edge = Edge(
        src="srv-web",
        dst="srv-db",
        technique="T1021.004",  # SSH
    )
    ctrl = Control(
        id="ctrl-mfa",
        name="MFA Control",
        cost=1000,
        blocks=("mfa",),
        scope=("srv-db",),
        efficacy=0.9,
    )
    return Twin(
        id="twin-test",
        assets=(asset1, asset2),
        identities=(user,),
        edges=(edge,),
        flows=(),
        controls=(ctrl,),
        parent_id=None,
    )


def test_valid_edge_resolves_to_correct_technique(minimal_twin):
    """Test 1: Valid Twin edge resolves to correct technique."""
    compiled = compile_twin(minimal_twin)
    outbound = compiled.adjacency["srv-web"]
    assert len(outbound) == 1
    edge = outbound[0]
    assert edge.src == "srv-web"
    assert edge.dst == "srv-db"
    assert edge.technique_id == "T1021.004"


def test_compiled_edge_contains_correct_prerequisites(minimal_twin):
    """Test 2: CompiledEdge contains correct prerequisites from technique catalog."""
    compiled = compile_twin(minimal_twin)
    edge = compiled.adjacency["srv-web"][0]
    assert "ssh_key_or_password" in edge.prerequisites
    assert "network_access" in edge.prerequisites


def test_compiled_edge_contains_correct_grants(minimal_twin):
    """Test 3: CompiledEdge contains correct grants from technique catalog."""
    compiled = compile_twin(minimal_twin)
    edge = compiled.adjacency["srv-web"][0]
    assert "remote_shell_session" in edge.grants


def test_compiled_edge_contains_correct_mitigating_controls(minimal_twin):
    """Test 4: CompiledEdge contains correct mitigating controls from technique catalog."""
    compiled = compile_twin(minimal_twin)
    edge = compiled.adjacency["srv-web"][0]
    assert "mfa" in edge.mitigating_controls
    assert "network_segmentation" in edge.mitigating_controls


def test_correct_controls_are_mapped_to_edge(minimal_twin):
    """Test 5: Active controls guarding the edge are correctly mapped."""
    compiled = compile_twin(minimal_twin)
    edge = compiled.adjacency["srv-web"][0]
    # ctrl-mfa has scope srv-db (dst) and blocks "mfa" (in T1021.004 blocks)
    assert "ctrl-mfa" in edge.active_control_ids


def test_controls_outside_scope_are_not_mapped():
    """Test 6: Controls whose scope does not cover src or dst are not mapped."""
    a1 = Asset(id="a1", name="A1", kind="server", zone="dmz", criticality=2)
    a2 = Asset(id="a2", name="A2", kind="server", zone="dmz", criticality=2)
    a3 = Asset(id="a3", name="A3", kind="server", zone="dmz", criticality=2)
    edge = Edge(src="a1", dst="a2", technique="T1021.004")
    # Control scope is only a3 (unrelated to a1 -> a2)
    ctrl = Control(id="c-unrelated", name="Unrelated", cost=100, blocks=("mfa",), scope=("a3",), efficacy=1.0)
    twin = Twin(id="t", assets=(a1, a2, a3), identities=(), edges=(edge,), flows=(), controls=(ctrl,))

    compiled = compile_twin(twin)
    edge_compiled = compiled.adjacency["a1"][0]
    assert "c-unrelated" not in edge_compiled.active_control_ids
    assert edge_compiled.active_control_ids == ()


def test_direct_technique_id_control_blocking():
    """Test 7: Control that directly blocks technique ID matches edge."""
    a1 = Asset(id="a1", name="A1", kind="server", zone="dmz", criticality=2)
    a2 = Asset(id="a2", name="A2", kind="server", zone="dmz", criticality=2)
    edge = Edge(src="a1", dst="a2", technique="T1046")  # Network Service Scanning
    ctrl = Control(
        id="c-direct",
        name="Scanner Block",
        cost=100,
        blocks=("T1046",),  # Direct MITRE ID
        scope=("a2",),
        efficacy=1.0,
    )
    twin = Twin(id="t", assets=(a1, a2), identities=(), edges=(edge,), flows=(), controls=(ctrl,))

    compiled = compile_twin(twin)
    assert compiled.adjacency["a1"][0].active_control_ids == ("c-direct",)


def test_blocking_category_intersection():
    """Test 8: Control that blocks technique defensive category matches edge."""
    a1 = Asset(id="a1", name="A1", kind="server", zone="dmz", criticality=2)
    a2 = Asset(id="a2", name="A2", kind="server", zone="dmz", criticality=2)
    edge = Edge(src="a1", dst="a2", technique="T1003")  # OS Credential Dumping
    # T1003 blocks: ("edr", "credential_guard")
    ctrl = Control(
        id="c-edr",
        name="Host EDR",
        cost=500,
        blocks=("edr",),  # Category match
        scope=("a2",),
        efficacy=0.99,
    )
    twin = Twin(id="t", assets=(a1, a2), identities=(), edges=(edge,), flows=(), controls=(ctrl,))

    compiled = compile_twin(twin)
    assert compiled.adjacency["a1"][0].active_control_ids == ("c-edr",)


def test_unknown_technique_raises_value_error(minimal_twin):
    """Test 9: Unknown technique ID raises ValueError."""
    bad_edge = Edge(src="srv-web", dst="srv-db", technique="T9999.NONEXISTENT")
    twin = Twin(
        id="twin-bad",
        assets=minimal_twin.assets,
        identities=minimal_twin.identities,
        edges=(bad_edge,),
        flows=(),
        controls=(),
    )
    with pytest.raises(ValueError, match="unknown technique ID 'T9999.NONEXISTENT'"):
        compile_twin(twin)


def test_unknown_edge_source_raises_value_error(minimal_twin):
    """Test 10: Unknown edge source entity raises ValueError."""
    bad_edge = Edge(src="ghost-node", dst="srv-db", technique="T1021.004")
    twin = Twin(
        id="twin-bad-src",
        assets=minimal_twin.assets,
        identities=minimal_twin.identities,
        edges=(bad_edge,),
        flows=(),
        controls=(),
    )
    with pytest.raises(ValueError, match="unknown source entity 'ghost-node'"):
        compile_twin(twin)


def test_unknown_edge_destination_raises_value_error(minimal_twin):
    """Test 11: Unknown edge destination entity raises ValueError."""
    bad_edge = Edge(src="srv-web", dst="ghost-dest", technique="T1021.004")
    twin = Twin(
        id="twin-bad-dst",
        assets=minimal_twin.assets,
        identities=minimal_twin.identities,
        edges=(bad_edge,),
        flows=(),
        controls=(),
    )
    with pytest.raises(ValueError, match="unknown destination entity 'ghost-dest'"):
        compile_twin(twin)


def test_unknown_control_scope_entity_raises_value_error(minimal_twin):
    """Test 12: Unknown control scope entity raises ValueError."""
    bad_ctrl = Control(
        id="ctrl-orphan",
        name="Orphaned Scope Control",
        cost=50,
        blocks=("mfa",),
        scope=("nonexistent-server",),
        efficacy=1.0,
    )
    twin = Twin(
        id="twin-bad-ctrl",
        assets=minimal_twin.assets,
        identities=minimal_twin.identities,
        edges=minimal_twin.edges,
        flows=(),
        controls=(bad_ctrl,),
    )
    with pytest.raises(ValueError, match="references unknown scope entity 'nonexistent-server'"):
        compile_twin(twin)


def test_compilation_does_not_mutate_twin(minimal_twin):
    """Test 13: Compilation is pure and does not mutate the Twin."""
    twin_hash_before = hash(minimal_twin)
    twin_edges_before = minimal_twin.edges
    compile_twin(minimal_twin)
    assert hash(minimal_twin) == twin_hash_before
    assert minimal_twin.edges == twin_edges_before


def test_compiled_edge_is_frozen(minimal_twin):
    """Test 14: CompiledEdge rejects attribute reassignment."""
    compiled = compile_twin(minimal_twin)
    edge = compiled.adjacency["srv-web"][0]
    with pytest.raises(ValidationError):
        edge.dst = "srv-other"


def test_compiled_twin_is_frozen(minimal_twin):
    """Test 15: CompiledTwin rejects attribute reassignment."""
    compiled = compile_twin(minimal_twin)
    with pytest.raises(ValidationError):
        compiled.twin_id = "twin-mutated"


def test_repeated_compilation_is_deterministic(minimal_twin):
    """Test 16: Repeated compilation produces identical outputs."""
    run1 = compile_twin(minimal_twin)
    run2 = compile_twin(minimal_twin)
    assert run1 == run2
    assert run1.adjacency == run2.adjacency


def test_outbound_edges_sorted_by_dst_and_technique():
    """Test 17: Outbound edges are deterministically sorted by (dst, technique_id)."""
    src = Asset(id="src", name="Src", kind="server", zone="lan", criticality=1)
    b_node = Asset(id="b_node", name="B", kind="server", zone="lan", criticality=1)
    a_node = Asset(id="a_node", name="A", kind="server", zone="lan", criticality=1)

    # Insert edges in reverse/unsorted order
    e1 = Edge(src="src", dst="b_node", technique="T1021.004")
    e2 = Edge(src="src", dst="a_node", technique="T1021.004")
    e3 = Edge(src="src", dst="a_node", technique="T1021.001")

    twin = Twin(
        id="t-sort",
        assets=(src, b_node, a_node),
        identities=(),
        edges=(e1, e2, e3),
        flows=(),
        controls=(),
    )

    compiled = compile_twin(twin)
    edges = compiled.adjacency["src"]
    assert len(edges) == 3
    # Expected sort order:
    # 1. dst='a_node', technique='T1021.001'
    # 2. dst='a_node', technique='T1021.004'
    # 3. dst='b_node', technique='T1021.004'
    assert (edges[0].dst, edges[0].technique_id) == ("a_node", "T1021.001")
    assert (edges[1].dst, edges[1].technique_id) == ("a_node", "T1021.004")
    assert (edges[2].dst, edges[2].technique_id) == ("b_node", "T1021.004")
