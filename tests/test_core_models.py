"""Contract verification tests for v2.1 core Pydantic models."""

import pytest
from pydantic import ValidationError

from backend.core.models import (
    Asset,
    Identity,
    Edge,
    ServiceFlow,
    Control,
    Agent,
    Twin,
)


def test_import_all_models():
    """Verify all 7 canonical models can be imported from backend.core."""
    assert Asset is not None
    assert Identity is not None
    assert Edge is not None
    assert ServiceFlow is not None
    assert Control is not None
    assert Agent is not None
    assert Twin is not None


def test_create_valid_instances():
    """Verify valid instances of all 7 models can be instantiated."""
    asset = Asset(
        id="srv-1",
        name="App Server",
        kind="server",
        zone="prod",
        criticality=4,
        crown_jewel=True,
    )
    assert asset.id == "srv-1"
    assert asset.crown_jewel is True

    identity = Identity(
        id="usr-1",
        name="Admin User",
        kind="admin",
        tier=0,
    )
    assert identity.tier == 0

    edge = Edge(
        src="srv-1",
        dst="srv-2",
        technique="ssh_lateral",
    )
    assert edge.src == "srv-1"

    flow = ServiceFlow(
        id="flow-1",
        name="DB Sync",
        src="srv-1",
        dst="srv-2",
        technique="tls_api",
        criticality=5,
    )
    assert flow.criticality == 5

    control = Control(
        id="ctrl-1",
        name="Network Segmentation",
        cost=5000,
        blocks=("ssh_lateral", "rdp_lateral"),
        scope=("srv-1", "srv-2"),
        efficacy=0.95,
    )
    assert control.cost == 5000
    assert isinstance(control.blocks, tuple)

    agent = Agent(
        id="agt-1",
        name="External APT",
        start_zones=("dmz",),
        capabilities=frozenset(["port_scan", "credential_dump"]),
        objective="specific_target",
        noise_budget=0.8,
        skill=0.9,
    )
    assert agent.objective == "specific_target"
    assert isinstance(agent.capabilities, frozenset)

    twin = Twin(
        id="twin-1",
        assets=(asset,),
        identities=(identity,),
        edges=(edge,),
        flows=(flow,),
        controls=(control,),
        parent_id=None,
    )
    assert twin.id == "twin-1"
    assert len(twin.assets) == 1
    assert twin.parent_id is None


def test_reject_invalid_literal_values():
    """Verify models validate and reject invalid Literal values."""
    with pytest.raises(ValidationError):
        Asset(
            id="a1",
            name="Invalid Asset",
            kind="mainframe",  # Not in Literal
            zone="prod",
            criticality=3,
        )

    with pytest.raises(ValidationError):
        Identity(
            id="i1",
            name="Invalid Identity",
            kind="superuser",  # Not in Literal
            tier=1,
        )

    with pytest.raises(ValidationError):
        Agent(
            id="ag1",
            name="Invalid Agent",
            start_zones=("dmz",),
            capabilities=frozenset(),
            objective="destroy_everything",  # Not in Literal
            noise_budget=0.5,
            skill=0.5,
        )


def test_frozen_models_prevent_mutation():
    """Verify models are frozen and reject in-place attribute mutations."""
    asset = Asset(
        id="a1",
        name="Server 1",
        kind="server",
        zone="dmz",
        criticality=2,
    )
    with pytest.raises(ValidationError):
        asset.criticality = 5

    identity = Identity(
        id="i1",
        name="User 1",
        kind="user",
        tier=2,
    )
    with pytest.raises(ValidationError):
        identity.tier = 0


def test_immutable_collection_types():
    """Verify tuple and frozenset collections remain immutable."""
    control = Control(
        id="c1",
        name="MFA",
        cost=1000,
        blocks=("credential_access",),
        scope=("asset-1",),
        efficacy=0.9,
    )
    assert isinstance(control.blocks, tuple)
    assert isinstance(control.scope, tuple)
    with pytest.raises(AttributeError):
        control.blocks.append("new_technique")

    agent = Agent(
        id="a1",
        name="Agent",
        start_zones=("dmz",),
        capabilities=frozenset(["scan"]),
        objective="max_breadth",
        noise_budget=0.5,
        skill=0.5,
    )
    assert isinstance(agent.capabilities, frozenset)
    with pytest.raises(AttributeError):
        agent.capabilities.add("exploit")


def test_twin_parent_id_supports_none_and_str():
    """Verify Twin.parent_id accepts both None and a valid string lineage ID."""
    twin_root = Twin(
        id="twin-root",
        assets=(),
        identities=(),
        edges=(),
        flows=(),
        controls=(),
        parent_id=None,
    )
    assert twin_root.parent_id is None

    twin_child = Twin(
        id="twin-child",
        assets=(),
        identities=(),
        edges=(),
        flows=(),
        controls=(),
        parent_id="twin-root",
    )
    assert twin_child.parent_id == "twin-root"


def test_json_schema_generation():
    """Verify model_json_schema() succeeds for Twin and nested models."""
    schema = Twin.model_json_schema()
    assert schema["title"] == "Twin"
    assert "assets" in schema["properties"]
    assert "identities" in schema["properties"]
    assert "edges" in schema["properties"]
    assert "flows" in schema["properties"]
    assert "controls" in schema["properties"]
    assert "parent_id" in schema["properties"]


def test_expected_model_field_names():
    """Verify expected field names match the contract specifications exactly."""
    assert set(Asset.model_fields.keys()) == {
        "id", "name", "kind", "zone", "criticality", "crown_jewel"
    }
    assert set(Identity.model_fields.keys()) == {
        "id", "name", "kind", "tier"
    }
    assert set(Edge.model_fields.keys()) == {
        "src", "dst", "technique"
    }
    assert set(ServiceFlow.model_fields.keys()) == {
        "id", "name", "src", "dst", "technique", "criticality"
    }
    assert set(Control.model_fields.keys()) == {
        "id", "name", "cost", "blocks", "scope", "efficacy"
    }
    assert set(Agent.model_fields.keys()) == {
        "id", "name", "start_zones", "capabilities", "objective", "noise_budget", "skill"
    }
    assert set(Twin.model_fields.keys()) == {
        "id", "assets", "identities", "edges", "flows", "controls", "parent_id"
    }
