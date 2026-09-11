"""Phase 1 Migration Tests: Verifying Digital Twin and AttackerState under backend/core."""

import hashlib
import json
from pathlib import Path
import pytest
import networkx as nx

from backend.core.models import Asset, Identity, Edge, ServiceFlow, Control, Twin
from backend.core.twin import CyberDigitalTwin, FinBankTwin, compute_twin_hash, canonical_twin_dict, clone
from backend.core.attacker import AttackerState
from backend.rules.compile import compile_twin


@pytest.fixture
def golden_path() -> Path:
    return Path("backend/data/scenarios/golden.json")


@pytest.fixture
def golden_twin(golden_path) -> Twin:
    return Twin.model_validate_json(golden_path.read_text(encoding="utf-8"))


@pytest.fixture
def digital_twin(golden_path) -> CyberDigitalTwin:
    return CyberDigitalTwin.from_file(golden_path)


# =====================================================================
# 1. Golden Scenario & Twin Construction
# =====================================================================

def test_golden_scenario_file_exists(golden_path):
    """Verify backend/data/scenarios/golden.json exists."""
    assert golden_path.exists(), "backend/data/scenarios/golden.json must exist"


def test_golden_scenario_exact_counts(digital_twin):
    """Verify exact counts: 10 assets, 4 identities, 16 edges, 6 flows, 4 controls."""
    assert digital_twin.asset_count == 10, "Expected 10 assets detected"
    assert digital_twin.identity_count == 4, "Expected 4 identities detected"
    assert digital_twin.edge_count == 16, "Expected 16 edges detected"
    assert digital_twin.flow_count == 6, "Expected 6 ServiceFlows detected"
    assert digital_twin.control_count == 4, "Expected 4 controls detected"


def test_canonical_assets_present(digital_twin):
    """Verify all 10 canonical FinBank assets exist with valid kinds and zones."""
    required_assets = [
        "internet",
        "web-dmz",
        "ws-dev",
        "ws-hr",
        "fileshare",
        "ci-runner",
        "jump-01",
        "payroll-api",
        "backup-01",
        "prod-db",
    ]
    assets = digital_twin.assets
    for asset_id in required_assets:
        assert asset_id in assets, f"Missing required asset '{asset_id}'"

    # Verify crown jewels
    assert assets["prod-db"].crown_jewel is True
    assert assets["prod-db"].kind == "database"
    assert assets["prod-db"].criticality == 5

    assert assets["backup-01"].crown_jewel is True
    assert assets["backup-01"].criticality == 4

    # Verify kinds
    assert assets["ws-dev"].kind == "workstation"
    assert assets["ws-hr"].kind == "workstation"
    assert assets["fileshare"].kind == "share"


def test_identities_and_tiers(digital_twin):
    """Verify all 4 identities with proper tiers."""
    identities = digital_twin.identities
    assert len(identities) == 4
    assert identities["id-user-admin"].tier == 0
    assert identities["id-user-admin"].kind == "admin"
    assert identities["id-svc-payroll"].tier == 1
    assert identities["id-svc-payroll"].kind == "service_account"
    assert identities["id-user-analyst"].tier == 2
    assert identities["id-user-customer"].tier == 3


def test_service_flows_f1_to_f6(digital_twin):
    """Verify F1-F6 ServiceFlows exist and F3 has criticality 5 (Never Break)."""
    flows = digital_twin.flows
    assert len(flows) == 6
    flow_ids = {"F1", "F2", "F3", "F4", "F5", "F6"}
    assert set(flows.keys()) == flow_ids

    # F3: Payroll API -> Production Database (Criticality 5: Never Break)
    f3 = flows["F3"]
    assert f3.src == "payroll-api"
    assert f3.dst == "prod-db"
    assert f3.criticality == 5

    # F1: Internet -> Web DMZ
    f1 = flows["F1"]
    assert f1.src == "internet"
    assert f1.dst == "web-dmz"


def test_controls_mapping_in_graph(digital_twin):
    """Verify controls are mapped to scoped entity nodes."""
    graph = digital_twin.graph
    controls = digital_twin.controls

    assert "ctrl-mfa" in controls
    assert "ctrl-network-seg" in controls
    assert "ctrl-edr" in controls
    assert "ctrl-credguard" in controls

    # MFA scope: jump-01, payroll-api
    assert "ctrl-mfa" in graph.nodes["jump-01"]["controls"]
    assert "ctrl-mfa" in graph.nodes["payroll-api"]["controls"]

    # Network seg scope: prod-db, backup-01
    assert "ctrl-network-seg" in graph.nodes["prod-db"]["controls"]
    assert "ctrl-network-seg" in graph.nodes["backup-01"]["controls"]


# =====================================================================
# 2. Graph Topology & Blast Radius
# =====================================================================

def test_networkx_graph_topology(digital_twin):
    """Verify NetworkX DiGraph representation and resolution helpers."""
    graph = digital_twin.graph
    assert graph.number_of_nodes() == 14  # 10 assets + 4 identities
    assert graph.number_of_edges() == 16

    # Node resolution
    assert digital_twin.resolve_node_id("jump-01") == "jump-01"
    assert digital_twin.resolve_node_id("asset-jump-01") == "jump-01"

    # Detection summary
    summary = digital_twin.get_detection_summary()
    assert summary["assets_detected"] == 10
    assert summary["identities_detected"] == 4
    assert summary["flows_detected"] == 6
    assert summary["graph_nodes"] == 14
    assert summary["graph_edges"] == 16
    assert "hash" in summary

    # Render flow banner
    banner = digital_twin.render_flow_banner()
    assert "10 assets detected" in banner
    assert "6 service flows detected" in banner


def test_blast_radius_calculation(digital_twin):
    """Verify blast radius (reachable descendants) using nx.descendants."""
    blast_from_internet = digital_twin.blast_radius("internet")
    # From internet -> web-dmz -> jump-01, payroll-api -> prod-db, backup-01
    assert "web-dmz" in blast_from_internet
    assert "payroll-api" in blast_from_internet
    assert "prod-db" in blast_from_internet
    assert "jump-01" in blast_from_internet
    assert "backup-01" in blast_from_internet


# =====================================================================
# 3. Deterministic Hashing
# =====================================================================

def test_deterministic_sha256_hash(golden_twin):
    """Verify twin.hash() is a deterministic 64-char SHA-256 digest."""
    h1 = golden_twin.hash()
    h2 = compute_twin_hash(golden_twin)
    assert h1 == h2
    assert len(h1) == 64
    assert all(c in "0123456789abcdef" for c in h1)


def test_logically_identical_twins_produce_identical_hashes(golden_twin):
    """Logically identical twins with differently ordered collections produce identical hashes."""
    # Reverse assets and edges
    reversed_twin = Twin(
        id=golden_twin.id,
        assets=tuple(reversed(golden_twin.assets)),
        identities=tuple(reversed(golden_twin.identities)),
        edges=tuple(reversed(golden_twin.edges)),
        flows=tuple(reversed(golden_twin.flows)),
        controls=tuple(reversed(golden_twin.controls)),
        parent_id=golden_twin.parent_id,
    )
    assert reversed_twin.hash() == golden_twin.hash(), (
        "Logically identical twins with different collection order must produce identical hashes"
    )


def test_different_twins_produce_different_hashes(golden_twin):
    """Any modification in assets, flows, or controls produces a different hash."""
    modified_twin = golden_twin.clone(
        new_id="twin-finbank-golden-modified",
        add_controls=[
            Control(
                id="ctrl-new-firewall",
                name="NextGen Firewall",
                cost=5000,
                blocks=("network_segmentation",),
                scope=("internet", "web-dmz"),
                efficacy=0.99,
            )
        ],
    )
    assert modified_twin.hash() != golden_twin.hash()


# =====================================================================
# 4. Immutable Cloning & Lineage
# =====================================================================

def test_twin_clone_preserves_lineage_and_immutability(golden_twin):
    """Verify clone() sets parent_id, does not mutate original, and updates collections."""
    initial_ctrl_count = len(golden_twin.controls)
    initial_edge_count = len(golden_twin.edges)
    initial_hash = golden_twin.hash()

    new_ctrl = Control(
        id="ctrl-zero-trust",
        name="Zero Trust Gateway",
        cost=8000,
        blocks=("mfa", "network_segmentation"),
        scope=("jump-01",),
        efficacy=0.99,
    )

    cloned = golden_twin.clone(
        add_controls=[new_ctrl],
        remove_edges=[("internet", "web-dmz")],
    )

    # Lineage
    assert cloned.parent_id == golden_twin.id
    assert cloned.id != golden_twin.id

    # Content
    assert len(cloned.controls) == initial_ctrl_count + 1
    assert any(c.id == "ctrl-zero-trust" for c in cloned.controls)
    assert len(cloned.edges) == initial_edge_count - 1
    assert not any(e.src == "internet" and e.dst == "web-dmz" for e in cloned.edges)

    # Original is completely untouched
    assert len(golden_twin.controls) == initial_ctrl_count
    assert len(golden_twin.edges) == initial_edge_count
    assert golden_twin.hash() == initial_hash
    assert golden_twin.parent_id is None


def test_cyber_digital_twin_clone(digital_twin):
    """Verify CyberDigitalTwin.clone() produces an independent instance with updated graph."""
    initial_edges = digital_twin.graph.number_of_edges()

    cloned_dt = digital_twin.clone(
        remove_edges=[("internet", "web-dmz")]
    )

    assert cloned_dt.parent_id == digital_twin.id
    assert cloned_dt.graph.number_of_edges() == initial_edges - 1
    assert not cloned_dt.graph.has_edge("internet", "web-dmz")

    # Original graph remains untouched
    assert digital_twin.graph.number_of_edges() == initial_edges
    assert digital_twin.graph.has_edge("internet", "web-dmz")


# =====================================================================
# 5. AttackerState under backend/core
# =====================================================================

def test_attacker_state_creation_and_immutability():
    """Verify AttackerState stores frozenset capabilities and tuple path."""
    state = AttackerState(
        current_node="ws-dev",
        capabilities=["network_scan", "admin_credentials"],
        privileges=["internal_read"],
    )
    assert state.current_node == "ws-dev"
    assert isinstance(state.capabilities, frozenset)
    assert isinstance(state.privileges, frozenset)
    assert isinstance(state.path, tuple)
    assert state.path == ("ws-dev",)
    assert "ws-dev" in state.compromised_nodes
    assert len(state.capabilities) == 2


def test_attacker_state_capability_and_privilege_detection():
    state = AttackerState(
        current_node="ws-dev",
        capabilities=["admin_credentials"],
        privileges=["internal_read"],
    )
    assert state.has_capability("admin_credentials") is True
    assert state.has_capability("domain_admin") is False
    assert state.has_privilege("internal_read") is True
    assert state.has_privilege("root_access") is False


def test_attacker_state_acquisition_and_move():
    state = AttackerState(current_node="ws-dev")
    state.add_capability("jumpbox_access")
    state.add_privilege("infrastructure_admin")
    state.move_to("jump-01")

    assert state.current_node == "jump-01"
    assert state.path == ("ws-dev", "jump-01")
    assert "jump-01" in state.compromised_nodes
    assert state.has_capability("jumpbox_access") is True
    assert state.has_privilege("infrastructure_admin") is True


def test_attacker_state_cloning_prevents_branch_mutation():
    original = AttackerState(
        current_node="ws-dev",
        capabilities=["admin_credentials"],
        privileges=["internal_read"],
    )
    clone = original.clone()

    clone.move_to("jump-01")
    clone.add_capability("jumpbox_access")
    clone.add_privilege("infrastructure_admin")

    # Original remains untouched
    assert original.current_node == "ws-dev"
    assert original.path == ("ws-dev",)
    assert "jump-01" not in original.compromised_nodes
    assert not original.has_capability("jumpbox_access")
    assert not original.has_privilege("infrastructure_admin")


def test_attacker_state_keys_and_hashability():
    state = AttackerState(
        current_node="ws-dev",
        capabilities=["admin_credentials"],
        privileges=["internal_read"],
    )
    key = state.state_key()
    assert isinstance(key, tuple)
    assert key[0] == "ws-dev"
    assert isinstance(key[1], frozenset)

    # Algorithm A search key
    search_key = state.search_key()
    assert search_key == ("ws-dev", frozenset(["admin_credentials"]))

    # Can be placed in set/dict
    visited = {state.state_key()}
    assert state.clone().state_key() in visited


# =====================================================================
# 6. Compiler and Rule Integration
# =====================================================================

def test_golden_twin_compiles_with_technique_catalog(golden_twin):
    """Verify golden.json compiles cleanly against techniques.yaml catalog."""
    compiled = compile_twin(golden_twin)
    assert compiled.twin_id == golden_twin.id
    assert len(compiled.adjacency) == 14

    # Check edges from ws-dev
    ws_edges = compiled.adjacency["ws-dev"]
    assert len(ws_edges) >= 1
    # Check active control mapping on edges
    jump_edges = compiled.adjacency["jump-01"]
    for e in jump_edges:
        if e.dst == "prod-db":
            assert "ctrl-network-seg" in e.evidence


# =====================================================================
# 7. Code Decoupling: backend/ does NOT import engine/
# =====================================================================

def test_no_engine_imports_in_backend():
    """Verify that backend/ has zero imports referencing legacy engine/."""
    backend_dir = Path("backend")
    for py_file in backend_dir.rglob("*.py"):
        content = py_file.read_text(encoding="utf-8")
        for line_num, line in enumerate(content.splitlines(), 1):
            stripped = line.strip()
            if stripped.startswith("import engine") or stripped.startswith("from engine"):
                pytest.fail(f"Forbidden engine import in {py_file}:{line_num}: {stripped}")
