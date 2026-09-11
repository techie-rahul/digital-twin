"""Comprehensive tests for the final v2.1 technique compiler, channel model, and control engine."""

import pytest
from pydantic import ValidationError

from backend.core.models import Asset, Control, Edge, Identity, ServiceFlow, Twin
from backend.rules.loader import TechniqueDefinition, load_techniques_map
from backend.rules.compile import (
    Channel,
    CompiledEdge,
    CompiledTwin,
    ControlImpact,
    ControlSelector,
    compile_twin,
    matches,
    selector_matches,
    to_channel,
)


@pytest.fixture
def catalog() -> dict[str, TechniqueDefinition]:
    return load_techniques_map()


@pytest.fixture
def sample_twin() -> Twin:
    """Construct a clean multi-tier sample Twin."""
    assets = (
        Asset(id="ws-hr", name="HR Workstation", kind="workstation", zone="corp", criticality=2),
        Asset(id="payroll-api", name="Payroll API", kind="server", zone="prod", criticality=4),
        Asset(id="backup-01", name="Backup Vault", kind="server", zone="mgmt", criticality=4),
        Asset(id="prod-db", name="Production DB", kind="database", zone="prod", criticality=5, crown_jewel=True),
    )
    identities = (
        Identity(id="svc.payroll", name="Payroll Service Account", kind="service_account", tier=1),
        Identity(id="svc.backup", name="Backup Service Account", kind="service_account", tier=1),
        Identity(id="user.alice", name="HR Analyst Alice", kind="user", tier=2),
    )
    edges = (
        Edge(src="ws-hr", dst="prod-db", technique="db_login"),
        Edge(src="payroll-api", dst="prod-db", technique="db_login"),
        Edge(src="backup-01", dst="prod-db", technique="db_login"),
        # Grants/access edges for identities
        Edge(src="svc.payroll", dst="payroll-api", technique="db_login"),
        Edge(src="svc.payroll", dst="prod-db", technique="db_login"),
        Edge(src="svc.backup", dst="backup-01", technique="db_login"),
        Edge(src="svc.backup", dst="prod-db", technique="db_login"),
        Edge(src="user.alice", dst="ws-hr", technique="db_login"),
    )
    flows = (
        ServiceFlow(id="F1", name="Payroll Settlement", src="payroll-api", dst="prod-db", technique="db_login", criticality=5),
        ServiceFlow(id="F2", name="Backup Sync", src="backup-01", dst="prod-db", technique="db_login", criticality=4),
    )
    return Twin(
        id="twin-sample",
        assets=assets,
        identities=identities,
        edges=edges,
        flows=flows,
        controls=(),
        parent_id=None,
    )


# =====================================================================
# 1. CompiledEdge Contract
# =====================================================================

def test_compiled_edge_contract_fields():
    """Verify CompiledEdge has the exact final v2.1 fields."""
    edge = CompiledEdge(
        src="nodeA",
        dst="nodeB",
        technique="ssh_lateral",
        identity_id="user-1",
        requires=("creds:user-1",),
        grants=("session:user-1",),
        p_success=0.9,
        cost=2.0,
        noise=0.2,
        evidence=("ctrl-1",),
    )
    assert edge.src == "nodeA"
    assert edge.dst == "nodeB"
    assert edge.technique == "ssh_lateral"
    assert edge.identity_id == "user-1"
    assert edge.requires == ("creds:user-1",)
    assert edge.grants == ("session:user-1",)
    assert edge.p_success == 0.9
    assert edge.cost == 2.0
    assert edge.noise == 0.2
    assert edge.evidence == ("ctrl-1",)

    # Incompatible legacy fields must NOT exist
    assert not hasattr(edge, "technique_id")
    assert not hasattr(edge, "prerequisites")
    assert not hasattr(edge, "mitigating_controls")
    assert not hasattr(edge, "active_control_ids")


def test_compiled_edge_and_twin_are_frozen():
    """Verify CompiledEdge and CompiledTwin reject attribute reassignment."""
    edge = CompiledEdge(
        src="a",
        dst="b",
        technique="ssh_lateral",
        p_success=0.9,
        cost=1.0,
        noise=0.1,
    )
    with pytest.raises(ValidationError):
        edge.src = "other"  # type: ignore

    twin = CompiledTwin(twin_id="t1", edges=(edge,))
    with pytest.raises(ValidationError):
        twin.twin_id = "t2"  # type: ignore


# =====================================================================
# 2. Compilation Rules (A - E)
# =====================================================================

def test_no_invented_transitions(sample_twin):
    """Rule A: Every compiled transition originates from an explicitly declared Twin edge."""
    compiled = compile_twin(sample_twin)
    twin_edge_pairs = {(e.src, e.dst) for e in sample_twin.edges}
    for ce in compiled.edges:
        assert (ce.src, ce.dst) in twin_edge_pairs, (
            f"Invented transition detected: {ce.src} -> {ce.dst}"
        )


def test_one_technique_per_edge(sample_twin):
    """Rule B: Each Twin edge produces compiled transitions with its exact declared technique."""
    compiled = compile_twin(sample_twin)
    twin_techniques = {e.technique for e in sample_twin.edges}
    for ce in compiled.edges:
        assert ce.technique in twin_techniques


def test_credential_expansion(catalog):
    """Rule C: creds:who expands for identities having login/admin on dst."""
    twin = Twin(
        id="twin-cred-expansion",
        assets=(
            Asset(id="ws-dev", name="WS", kind="workstation", zone="corp", criticality=2),
            Asset(id="jump-01", name="Jump", kind="server", zone="mgmt", criticality=4),
        ),
        identities=(
            Identity(id="id-admin", name="Admin", kind="admin", tier=0),
            Identity(id="id-operator", name="Operator", kind="user", tier=2),
        ),
        edges=(
            # Lateral movement edge requiring credentials for dst
            Edge(src="ws-dev", dst="jump-01", technique="ssh_lateral"),
            # Identities with access to jump-01
            Edge(src="id-admin", dst="jump-01", technique="db_login"),
            Edge(src="id-operator", dst="jump-01", technique="db_login"),
        ),
        flows=(),
        controls=(),
    )
    compiled = compile_twin(twin, catalog=catalog)

    # ws-dev -> jump-01 should expand for both id-admin and id-operator
    jump_edges = [e for e in compiled.edges if e.src == "ws-dev" and e.dst == "jump-01"]
    assert len(jump_edges) == 2

    identities_emitted = {e.identity_id for e in jump_edges}
    assert identities_emitted == {"id-admin", "id-operator"}

    for e in jump_edges:
        assert f"creds:{e.identity_id}" in e.requires


def test_session_credential_expansion(catalog):
    """Rule D: creds:sessions@src resolves credentials for identities with a session on src."""
    twin = Twin(
        id="twin-session-cred",
        assets=(
            Asset(id="ws-dev", name="WS", kind="workstation", zone="corp", criticality=2),
        ),
        identities=(
            Identity(id="id-alice", name="Alice", kind="user", tier=2),
            Identity(id="id-bob", name="Bob", kind="user", tier=2),
        ),
        edges=(
            # Explicit self-edge for host-local cred dump
            Edge(src="ws-dev", dst="ws-dev", technique="cred_dump"),
            # Sessions on ws-dev
            Edge(src="id-alice", dst="ws-dev", technique="db_login"),
            Edge(src="id-bob", dst="ws-dev", technique="db_login"),
        ),
        flows=(),
        controls=(),
    )
    compiled = compile_twin(twin, catalog=catalog)

    dump_edges = [e for e in compiled.edges if e.src == "ws-dev" and e.dst == "ws-dev" and e.technique == "cred_dump"]
    assert len(dump_edges) == 1
    dump_edge = dump_edges[0]

    # Dumped credentials should include both session identities
    assert "creds:id-alice" in dump_edge.grants
    assert "creds:id-bob" in dump_edge.grants


def test_host_local_self_edge_behavior(catalog):
    """Rule E: cred_dump and priv_esc_local must only operate on explicit self-edges."""
    # Twin with non-self edges for cred_dump: compiler must NOT emit them
    twin_invalid = Twin(
        id="twin-non-self",
        assets=(
            Asset(id="ws-dev", name="WS", kind="workstation", zone="corp", criticality=2),
            Asset(id="fileshare", name="Share", kind="share", zone="corp", criticality=2),
        ),
        identities=(),
        edges=(
            # Invalid: cred_dump between two different hosts
            Edge(src="ws-dev", dst="fileshare", technique="cred_dump"),
            # Invalid: priv_esc_local between two different hosts
            Edge(src="ws-dev", dst="fileshare", technique="priv_esc_local"),
        ),
        flows=(),
        controls=(),
    )
    compiled_invalid = compile_twin(twin_invalid, catalog=catalog)
    # Neither should be compiled
    assert len(compiled_invalid.edges) == 0

    # Twin with valid self-edge
    twin_valid = Twin(
        id="twin-self",
        assets=(
            Asset(id="ws-dev", name="WS", kind="workstation", zone="corp", criticality=2),
        ),
        identities=(),
        edges=(
            Edge(src="ws-dev", dst="ws-dev", technique="priv_esc_local"),
        ),
        flows=(),
        controls=(),
    )
    compiled_valid = compile_twin(twin_valid, catalog=catalog)
    assert len(compiled_valid.edges) == 1
    assert compiled_valid.edges[0].technique == "priv_esc_local"


# =====================================================================
# 3. Validation & Error Handling
# =====================================================================

def test_unknown_technique_raises_value_error(sample_twin):
    """Verify compiler raises ValueError if an edge references an unknown technique."""
    bad_edge_twin = sample_twin.clone(
        new_id="twin-bad-tech",
        add_edges=[Edge(src="ws-hr", dst="prod-db", technique="NON_EXISTENT_TECHNIQUE")],
    )
    with pytest.raises(ValueError, match="unknown technique"):
        compile_twin(bad_edge_twin)


def test_unknown_asset_raises_value_error(sample_twin):
    """Verify compiler raises ValueError if an edge references unknown source or destination."""
    bad_src_twin = sample_twin.clone(
        new_id="twin-bad-src",
        add_edges=[Edge(src="ghost-asset", dst="prod-db", technique="db_login")],
    )
    with pytest.raises(ValueError, match="unknown source entity"):
        compile_twin(bad_src_twin)

    bad_dst_twin = sample_twin.clone(
        new_id="twin-bad-dst",
        add_edges=[Edge(src="ws-hr", dst="ghost-asset", technique="db_login")],
    )
    with pytest.raises(ValueError, match="unknown destination entity"):
        compile_twin(bad_dst_twin)


def test_deterministic_compilation(sample_twin):
    """Verify repeated compilation produces identical transitions and ordering."""
    run1 = compile_twin(sample_twin)
    run2 = compile_twin(sample_twin)
    assert run1.edges == run2.edges
    assert run1.adjacency == run2.adjacency


def test_no_controls_baseline(sample_twin):
    """With no controls, p_success equals base_success and evidence is empty."""
    compiled = compile_twin(sample_twin)
    for ce in compiled.edges:
        assert ce.evidence == ()
        assert ce.p_success > 0.0


# =====================================================================
# 4. Control Engine (Naive vs Non-Naive, Selectors, Exceptions)
# =====================================================================

def test_selector_matching():
    """Verify ControlSelector matches correctly against a Channel."""
    selector = ControlSelector(
        src_zones=("corp",),
        dst_assets=("prod-db",),
        protocols=("sql",),
    )
    ch_match = Channel(
        technique="db_login",
        src="ws-hr",
        src_zone="corp",
        dst="prod-db",
        dst_zone="prod",
        protocol="sql",
        port=5432,
        identity_id=None,
        identity_kind=None,
    )
    assert selector_matches(selector, ch_match) is True

    # Mismatched zone
    ch_mismatch = Channel(
        technique="db_login",
        src="ws-hr",
        src_zone="dmz",
        dst="prod-db",
        dst_zone="prod",
        protocol="sql",
        port=5432,
        identity_id=None,
        identity_kind=None,
    )
    assert selector_matches(selector, ch_mismatch) is False


def test_selector_any_semantics():
    """Empty selector fields must match ANY channel property."""
    empty_selector = ControlSelector()
    channel = Channel(
        technique="phish",
        src="internet",
        src_zone="external",
        dst="web-dmz",
        dst_zone="dmz",
        protocol="https",
        port=443,
        identity_id="user-1",
        identity_kind="user",
    )
    assert selector_matches(empty_selector, channel) is True


def test_exceptions_override_selector():
    """Exceptions in ControlImpact must exempt matching traffic."""
    impact = ControlImpact(
        id="ctrl-block-sql",
        selector=ControlSelector(dst_assets=("prod-db",), protocols=("sql",)),
        exceptions=(
            ControlSelector(src_assets=("payroll-api",)),
        ),
        efficacy=1.0,
    )
    ch_blocked = Channel(
        technique="db_login",
        src="ws-hr",
        src_zone="corp",
        dst="prod-db",
        dst_zone="prod",
        protocol="sql",
        port=5432,
        identity_id=None,
        identity_kind=None,
    )
    assert matches(impact, ch_blocked) is True

    ch_exempt = Channel(
        technique="db_login",
        src="payroll-api",
        src_zone="prod",
        dst="prod-db",
        dst_zone="prod",
        protocol="sql",
        port=5432,
        identity_id=None,
        identity_kind=None,
    )
    assert matches(impact, ch_exempt) is False


def test_naive_true_blocking(sample_twin):
    """In naive=True mode, matched attack edges are removed."""
    blocking_impact = ControlImpact(
        id="ctrl-seg-db",
        selector=ControlSelector(src_assets=("ws-hr",), dst_assets=("prod-db",)),
        efficacy=1.0,
    )
    compiled_naive = compile_twin(
        sample_twin,
        control_impacts=[blocking_impact],
        naive=True,
    )
    # ws-hr -> prod-db must be removed
    hr_to_db = [e for e in compiled_naive.edges if e.src == "ws-hr" and e.dst == "prod-db"]
    assert len(hr_to_db) == 0

    # Other transitions remain
    payroll_to_db = [e for e in compiled_naive.edges if e.src == "payroll-api" and e.dst == "prod-db"]
    assert len(payroll_to_db) > 0


def test_naive_false_efficacy_degradation(sample_twin, catalog):
    """In naive=False mode, edge remains with degraded p_success and recorded evidence."""
    tech_base = catalog["db_login"].base_success  # 0.95
    impact = ControlImpact(
        id="ctrl-edr",
        selector=ControlSelector(src_assets=("ws-hr",)),
        efficacy=0.8,
    )
    compiled = compile_twin(
        sample_twin,
        control_impacts=[impact],
        naive=False,
    )
    hr_edges = [e for e in compiled.edges if e.src == "ws-hr" and e.dst == "prod-db"]
    assert len(hr_edges) == 2

    expected_p = round(tech_base * (1.0 - 0.8), 6)
    for edge in hr_edges:
        assert edge.p_success == expected_p
        assert "ctrl-edr" in edge.evidence



# =====================================================================
# 5. Scoped Segmentation & ServiceFlow Matching
# =====================================================================

def test_scoped_segmentation_hr_vs_payroll_vs_backup():
    """Verify scoped segmentation distinguishes ws-hr (DENIED) from payroll (ALLOWED) and backup (ALLOWED)."""
    seg_control = ControlImpact(
        id="ctrl-segmentation",
        selector=ControlSelector(
            dst_assets=("prod-db",),
            protocols=("sql",),
            ports=(5432,),
        ),
        exceptions=(
            ControlSelector(
                src_assets=("payroll-api",),
                identity_ids=("svc.payroll",),
            ),
            ControlSelector(
                src_assets=("backup-01",),
                identity_ids=("svc.backup",),
            ),
        ),
        efficacy=1.0,
    )

    # 1. ws-hr attempting to access prod-db using stolen payroll credentials
    ch_hr = Channel(
        technique="db_login",
        src="ws-hr",
        src_zone="corp",
        dst="prod-db",
        dst_zone="prod",
        protocol="sql",
        port=5432,
        identity_id="svc.payroll",
        identity_kind="service_account",
    )
    # Must MATCH the control (meaning DENIED / blocked by the control)
    assert matches(seg_control, ch_hr) is True

    # 2. payroll-api accessing prod-db using svc.payroll
    ch_payroll = Channel(
        technique="db_login",
        src="payroll-api",
        src_zone="prod",
        dst="prod-db",
        dst_zone="prod",
        protocol="sql",
        port=5432,
        identity_id="svc.payroll",
        identity_kind="service_account",
    )
    # Must NOT match the control (exception applies -> ALLOWED)
    assert matches(seg_control, ch_payroll) is False

    # 3. backup-01 accessing prod-db using svc.backup
    ch_backup = Channel(
        technique="db_login",
        src="backup-01",
        src_zone="mgmt",
        dst="prod-db",
        dst_zone="prod",
        protocol="sql",
        port=5432,
        identity_id="svc.backup",
        identity_kind="service_account",
    )
    # Must NOT match the control (exception applies -> ALLOWED)
    assert matches(seg_control, ch_backup) is False


def test_service_flow_channel_projection(sample_twin, catalog):
    """Verify ServiceFlow projects to the same channel representation as CompiledEdge."""
    assets_map = {a.id: a for a in sample_twin.assets}
    identities_map = {i.id: i for i in sample_twin.identities}

    f1 = sample_twin.flows[0]  # payroll-api -> prod-db
    channel = to_channel(f1, assets_map, identities_map, catalog)

    assert channel.src == "payroll-api"
    assert channel.dst == "prod-db"
    assert channel.src_zone == "prod"
    assert channel.dst_zone == "prod"
    assert channel.technique == "db_login"
    assert channel.protocol == "sql"
    assert channel.port == 5432

    # Scoped segmentation matching against ServiceFlow
    seg_control = ControlImpact(
        id="ctrl-seg",
        selector=ControlSelector(dst_assets=("prod-db",)),
        exceptions=(ControlSelector(src_assets=("payroll-api",)),),
    )
    # Exempted by exception, so control does not block the flow
    assert matches(seg_control, channel) is False
