"""Focused tests for Phase 9: Blast-Radius View.

Verifies credential-aware blast radius analysis, strict separation from raw
NetworkX descendant upper bound, seeded adversary capabilities, critical/crown-jewel
identification, and immutable deterministic execution.
"""

from pathlib import Path
import pytest
from pydantic import ValidationError

from backend.core.attacker import AttackerState
from backend.core.models import Asset, Control, Edge, Identity, ServiceFlow, Twin
from backend.core.twin import compute_twin_hash
from backend.core.blast_radius import (
    BlastRadiusResult,
    calculate_blast_radius,
    compute_blast_radius,
    compute_network_descendants,
    resolve_sessions_on_asset,
)
from backend.rules.compile import compile_twin


@pytest.fixture
def golden_twin() -> Twin:
    """Load the canonical FinBank golden scenario twin."""
    path = Path("backend/data/scenarios/golden.json")
    return Twin.model_validate_json(path.read_text(encoding="utf-8"))


@pytest.fixture
def synthetic_twin() -> Twin:
    """Construct a controlled 4-asset twin with explicit credential barriers."""
    assets = (
        Asset(id="ws-1", name="Workstation 1", kind="workstation", zone="corp", criticality=2),
        Asset(id="app-srv", name="Application Server", kind="server", zone="prod", criticality=3),
        Asset(id="db-vault", name="Database Vault", kind="database", zone="prod", criticality=5, crown_jewel=True),
        Asset(id="mgmt-jump", name="Admin Jumpbox", kind="server", zone="mgmt", criticality=4),
    )
    identities = (
        Identity(id="user.alice", name="Alice", kind="user", tier=2),
        Identity(id="admin.bob", name="Bob", kind="admin", tier=0),
    )
    edges = (
        # ws-1 -> app-srv (requires alice's credentials)
        Edge(src="ws-1", dst="app-srv", technique="ssh_lateral"),
        # app-srv -> db-vault (requires admin bob's credentials)
        Edge(src="app-srv", dst="db-vault", technique="db_login"),
        # ws-1 -> mgmt-jump (requires admin bob's credentials)
        Edge(src="ws-1", dst="mgmt-jump", technique="rdp_lateral"),
        # Identity authorized accesses / active sessions
        Edge(src="user.alice", dst="ws-1", technique="db_login"),
        Edge(src="user.alice", dst="app-srv", technique="db_login"),
        Edge(src="admin.bob", dst="mgmt-jump", technique="db_login"),
        Edge(src="admin.bob", dst="db-vault", technique="db_login"),
    )
    return Twin(
        id="twin-synthetic-blast",
        assets=assets,
        identities=identities,
        edges=edges,
        flows=(),
        controls=(),
    )


# =====================================================================
# 1. Workstation Credential-Aware Reachability (Test 1)
# =====================================================================

def test_workstation_credential_aware_reachability(synthetic_twin):
    """Compromising a normal workstation produces the expected credential-aware reachable assets."""
    result = calculate_blast_radius(synthetic_twin, "ws-1")

    # ws-1 has alice's credentials, so it can reach app-srv
    assert "app-srv" in result.reachable_assets
    assert result.credential_aware_count == 1
    assert result.reachable_assets == ("app-srv",)


# =====================================================================
# 2. Credential Requirements Prevent Unauthorized Reachability (Test 2)
# =====================================================================

def test_credential_requirements_prevent_unauthorized_reachability(synthetic_twin):
    """Credential requirements prevent assets from being counted as reachable when lacking credentials."""
    result = calculate_blast_radius(synthetic_twin, "ws-1")

    # db-vault requires admin.bob, mgmt-jump requires admin.bob
    # Attacker on ws-1 only holds alice's credentials, so both must be unreachable
    assert "db-vault" not in result.reachable_assets
    assert "mgmt-jump" not in result.reachable_assets
    assert result.is_crown_jewel_compromised is False
    assert result.is_critical_asset_compromised is False


# =====================================================================
# 3. Network Descendants Upper Bound Can Be Larger (Test 3)
# =====================================================================

def test_network_descendant_upper_bound_larger_than_credential_aware(synthetic_twin):
    """Network descendant upper bound can be larger than credential-aware reachability."""
    result = calculate_blast_radius(synthetic_twin, "ws-1")

    # Raw network topology allows ws-1 -> app-srv -> db-vault and ws-1 -> mgmt-jump
    expected_descendants = ("app-srv", "db-vault", "mgmt-jump")
    assert result.network_upper_bound == expected_descendants
    assert result.network_upper_bound_count == 3
    assert result.credential_aware_count == 1
    assert result.divergence == 2
    assert result.network_upper_bound_count > result.credential_aware_count


# =====================================================================
# 4. Seeding session:X and admin:X (Test 4)
# =====================================================================

def test_session_and_admin_capabilities_seeded(synthetic_twin):
    """session:X and admin:X are correctly seeded for compromised asset X."""
    result = calculate_blast_radius(synthetic_twin, "ws-1")

    assert "session:ws-1" in result.seeded_capabilities
    assert "admin:ws-1" in result.seeded_capabilities
    assert "foothold" in result.seeded_capabilities
    assert "priv:admin" in result.seeded_capabilities


# =====================================================================
# 5. Seeding Credentials Associated with Sessions on X (Test 5)
# =====================================================================

def test_credentials_associated_with_sessions_seeded(synthetic_twin):
    """Credentials associated with sessions on X are correctly seeded."""
    result = calculate_blast_radius(synthetic_twin, "ws-1")

    # Alice has a session on ws-1
    assert "creds:user.alice" in result.seeded_capabilities
    assert "creds:user.alice" in result.usable_credentials
    assert "user.alice" in result.reachable_identities

    # Bob does NOT have a session on ws-1
    assert "creds:admin.bob" not in result.seeded_capabilities


# =====================================================================
# 6. Critical Assets Correctly Identified (Test 6)
# =====================================================================

def test_critical_assets_correctly_identified(golden_twin):
    """Critical assets (criticality >= 4) inside the blast radius are correctly identified."""
    result = calculate_blast_radius(golden_twin, "jump-01")

    # jump-01 reaches backup-01 (crit 4) and prod-db (crit 5)
    assert "backup-01" in result.critical_assets
    assert "prod-db" in result.critical_assets
    assert len(result.critical_assets) == 2
    assert result.is_critical_asset_compromised is True


# =====================================================================
# 7. Crown-Jewel Assets Correctly Identified (Test 7)
# =====================================================================

def test_crown_jewel_assets_correctly_identified(golden_twin):
    """Crown-jewel assets are correctly identified inside the blast radius."""
    result = calculate_blast_radius(golden_twin, "jump-01")

    # Both backup-01 and prod-db are crown jewels in FinBank
    assert "backup-01" in result.crown_jewels
    assert "prod-db" in result.crown_jewels
    assert len(result.crown_jewels) == 2
    assert result.is_crown_jewel_compromised is True

    # But from ws-dev, zero crown jewels are reached
    res_ws = calculate_blast_radius(golden_twin, "ws-dev")
    assert len(res_ws.crown_jewels) == 0
    assert res_ws.is_crown_jewel_compromised is False


# =====================================================================
# 8. Compromised Seed Itself Handled Correctly (Test 8)
# =====================================================================

def test_compromised_seed_handling(synthetic_twin):
    """The compromised seed itself is handled correctly and not counted as a downstream target."""
    result = calculate_blast_radius(synthetic_twin, "ws-1")

    assert result.compromised_seed == "ws-1"
    assert result.seed == "ws-1"
    assert "ws-1" not in result.reachable_assets
    assert "ws-1" not in result.network_upper_bound

    # all_compromised_assets property includes both seed and downstream
    assert result.all_compromised_assets == ("ws-1", "app-srv")


# =====================================================================
# 9. Twin and Input Immutability Preserved (Test 9)
# =====================================================================

def test_twin_immutability_preserved(golden_twin):
    """Twin/input immutability is preserved; no collections or fields are mutated."""
    hash_before = compute_twin_hash(golden_twin)
    assets_count_before = len(golden_twin.assets)
    edges_count_before = len(golden_twin.edges)

    result = calculate_blast_radius(golden_twin, "ws-dev")

    hash_after = compute_twin_hash(golden_twin)
    assert hash_before == hash_after
    assert len(golden_twin.assets) == assets_count_before
    assert len(golden_twin.edges) == edges_count_before

    # Verify result model itself is frozen
    with pytest.raises(ValidationError):
        result.credential_aware_count = 999  # type: ignore


# =====================================================================
# 10. Deterministic Repeated Execution (Test 10)
# =====================================================================

def test_deterministic_repeated_execution(golden_twin):
    """Deterministic repeated execution produces identical results."""
    run1 = calculate_blast_radius(golden_twin, "jump-01")
    run2 = calculate_blast_radius(golden_twin, "jump-01")

    assert run1.compromised_seed == run2.compromised_seed
    assert run1.reachable_assets == run2.reachable_assets
    assert run1.credential_aware_count == run2.credential_aware_count
    assert run1.network_upper_bound == run2.network_upper_bound
    assert run1.critical_assets == run2.critical_assets
    assert run1.crown_jewels == run2.crown_jewels
    assert run1.seeded_capabilities == run2.seeded_capabilities
    assert run1.explanation == run2.explanation
    assert len(run1.attack_paths) == len(run2.attack_paths)


# =====================================================================
# 11. FinBank Golden Scenario Sensible Behavior (Test 11)
# =====================================================================

def test_golden_scenario_blast_radius_sensibility(golden_twin):
    """FinBank golden scenario exhibits sensible domain-specific blast-radius behavior."""
    # 1. ws-dev (standard corporate workstation): cannot reach crown jewels without escalation
    res_ws = calculate_blast_radius(golden_twin, "ws-dev")
    assert "prod-db" not in res_ws.reachable_assets
    assert "backup-01" not in res_ws.reachable_assets
    assert res_ws.credential_aware_count == 0

    # 2. jump-01 (privileged bastion jumpbox): reaches both core databases
    res_jump = calculate_blast_radius(golden_twin, "jump-01")
    assert "prod-db" in res_jump.reachable_assets
    assert "backup-01" in res_jump.reachable_assets
    assert res_jump.credential_aware_count == 2

    # 3. internet gateway: reaches customer portal web-dmz only
    res_net = calculate_blast_radius(golden_twin, "internet")
    assert res_net.reachable_assets == ("web-dmz",)
    assert res_net.credential_aware_count == 1
    assert "prod-db" not in res_net.reachable_assets


# =====================================================================
# 12. Network Descendants Does Not Imply Compromise (Test 12)
# =====================================================================

def test_network_descendants_does_not_imply_compromise(golden_twin):
    """NetworkX descendant upper bound does NOT incorrectly imply authenticated compromise."""
    res_ws = calculate_blast_radius(golden_twin, "ws-dev")

    # In raw network graph, prod-db and backup-01 are descendants of ws-dev
    assert "prod-db" in res_ws.network_upper_bound
    assert "backup-01" in res_ws.network_upper_bound

    # But genuine credential-aware search proves they are NOT reachable
    assert "prod-db" not in res_ws.reachable_assets
    assert "backup-01" not in res_ws.reachable_assets
    assert res_ws.divergence == 5


# =====================================================================
# 13. Network Reachability vs Credential Distinction (Test 13)
# =====================================================================

def test_network_reachability_without_credentials_distinction(synthetic_twin):
    """Asset where network reachability exists but credentials do not proves the view distinction."""
    result = calculate_blast_radius(synthetic_twin, "ws-1")

    # mgmt-jump is an immediate network neighbour of ws-1
    assert "mgmt-jump" in result.network_upper_bound
    # But ws-1 lacks admin.bob credentials, so mgmt-jump is not reachable
    assert "mgmt-jump" not in result.reachable_assets


# =====================================================================
# 14. No Invented Transitions (Test 14)
# =====================================================================

def test_no_invented_transitions(golden_twin):
    """Analysis does not invent transitions absent from the compiled twin."""
    compiled = compile_twin(golden_twin)
    valid_compiled_pairs = {(e.src, e.dst) for e in compiled.edges}

    res_jump = calculate_blast_radius(golden_twin, "jump-01", compiled_twin=compiled)

    for path in res_jump.attack_paths:
        for edge in path.edges:
            assert (edge.src, edge.dst) in valid_compiled_pairs


# =====================================================================
# 15. Result Schema and Serialization (Test 15)
# =====================================================================

def test_result_schema_and_serialization(golden_twin):
    """Result conforms to Pydantic v2 schema and cleanly round-trips to/from JSON."""
    result = calculate_blast_radius(golden_twin, "jump-01")

    # Export to dict and JSON
    dumped_dict = result.model_dump()
    dumped_json = result.model_dump_json()

    assert isinstance(dumped_dict, dict)
    assert isinstance(dumped_json, str)
    assert dumped_dict["compromised_seed"] == "jump-01"
    assert dumped_dict["credential_aware_count"] == 2
    assert "backup-01" in dumped_dict["reachable_assets"]

    # Round-trip reconstruction
    restored = BlastRadiusResult.model_validate_json(dumped_json)
    assert restored.compromised_seed == result.compromised_seed
    assert restored.reachable_assets == result.reachable_assets
    assert restored.network_upper_bound == result.network_upper_bound
    assert restored.explanation == result.explanation


# =====================================================================
# 16. Compromised Identity Blast Radius (Test 16)
# =====================================================================

def test_compromised_identity_blast_radius(golden_twin):
    """Directly compromising an Identity computes its full downstream asset reachability."""
    res_admin = calculate_blast_radius(golden_twin, "id-user-admin")

    assert res_admin.compromised_seed == "id-user-admin"
    assert res_admin.seed_type == "identity"
    assert "creds:id-user-admin" in res_admin.seeded_capabilities
    assert "jump-01" in res_admin.reachable_assets
    assert "prod-db" in res_admin.reachable_assets
    assert "backup-01" in res_admin.reachable_assets
    assert len(res_admin.critical_assets) == 4
    assert len(res_admin.crown_jewels) == 2


# =====================================================================
# 17. Unknown Seed Raises ValueError (Test 17)
# =====================================================================

def test_unknown_seed_raises_value_error(golden_twin):
    """Querying an unknown asset or identity ID raises a descriptive ValueError."""
    with pytest.raises(ValueError, match="not found in twin"):
        calculate_blast_radius(golden_twin, "non-existent-asset-999")


# =====================================================================
# 18. Case-Insensitive Name Resolution (Test 18)
# =====================================================================

def test_case_insensitive_name_resolution(golden_twin):
    """Seed can be specified by asset name case-insensitively."""
    res_by_name = calculate_blast_radius(golden_twin, "Privileged Admin Jump Host")
    res_by_id = calculate_blast_radius(golden_twin, "jump-01")

    assert res_by_name.compromised_seed == res_by_id.compromised_seed
    assert res_by_name.reachable_assets == res_by_id.reachable_assets


# =====================================================================
# 19. Isolated Leaf Node Blast Radius (Test 19)
# =====================================================================

def test_isolated_leaf_node_blast_radius(golden_twin):
    """A leaf asset with zero outbound edges produces zero reachable downstream assets."""
    res_db = calculate_blast_radius(golden_twin, "prod-db")

    assert res_db.compromised_seed == "prod-db"
    assert res_db.reachable_assets == ()
    assert res_db.credential_aware_count == 0
    assert res_db.network_upper_bound == ()
    assert res_db.network_upper_bound_count == 0
    assert res_db.divergence == 0


# =====================================================================
# 20. AttackerState Conversion and Canonical Alias (Test 20)
# =====================================================================

def test_attacker_state_conversion_and_alias(golden_twin):
    """Verify compute_blast_radius alias and to_attacker_state() helper."""
    # Canonical alias check
    res_alias = compute_blast_radius(golden_twin, "jump-01")
    assert isinstance(res_alias, BlastRadiusResult)

    # AttackerState generation
    state = res_alias.to_attacker_state()
    assert isinstance(state, AttackerState)
    assert state.current_node == "jump-01"
    assert "session:jump-01" in state.capabilities
    assert "creds:id-user-admin" in state.capabilities
    assert "admin" in state.privileges
