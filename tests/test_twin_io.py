"""Comprehensive unit and API integration tests for Twin JSON & CSV Import/Export."""

import io
import json
import zipfile
import pytest
from fastapi.testclient import TestClient

from backend.api.main import create_app
from backend.api.twin_io import (
    TwinValidationError,
    export_twin_csv_files,
    export_twin_csv_zip,
    export_twin_json,
    parse_and_validate_json,
    parse_csv_files_to_twin,
    parse_csv_zip_to_twin,
)
from backend.core.twin import CyberDigitalTwin


@pytest.fixture
def client():
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def golden_twin(client):
    app = client.app
    return app.state.golden_twin.twin


# =====================================================================
# 1. JSON Import & Export Unit Tests
# =====================================================================

def test_json_export_and_import_roundtrip(golden_twin):
    """Exporting a Twin to JSON and importing it back must yield an identical Twin."""
    exported_data = export_twin_json(golden_twin)
    exported_str = json.dumps(exported_data)

    reconstructed = parse_and_validate_json(exported_str)

    assert reconstructed.id == golden_twin.id
    assert len(reconstructed.assets) == len(golden_twin.assets)
    assert len(reconstructed.edges) == len(golden_twin.edges)
    assert len(reconstructed.identities) == len(golden_twin.identities)
    assert len(reconstructed.flows) == len(golden_twin.flows)
    assert len(reconstructed.controls) == len(golden_twin.controls)

    dt_orig = CyberDigitalTwin(golden_twin)
    dt_recon = CyberDigitalTwin(reconstructed)
    assert dt_orig.hash() == dt_recon.hash()


def test_json_import_malformed_json():
    """Malformed JSON syntax must raise a descriptive TwinValidationError."""
    with pytest.raises(TwinValidationError) as exc:
        parse_and_validate_json("{\"assets\": [broken json")
    assert "Malformed JSON" in str(exc.value)


def test_json_import_empty_payload():
    """Empty JSON payload must be caught cleanly."""
    with pytest.raises(TwinValidationError) as exc:
        parse_and_validate_json("   ")
    assert "empty" in str(exc.value)


def test_json_import_duplicate_asset_ids(golden_twin):
    """Duplicate asset IDs must be rejected."""
    data = export_twin_json(golden_twin)
    # Duplicate first asset
    data["assets"].append(data["assets"][0])
    with pytest.raises(TwinValidationError) as exc:
        parse_and_validate_json(json.dumps(data))
    assert "Duplicate asset ID" in str(exc.value.errors)


def test_json_import_dangling_edge_reference(golden_twin):
    """Edge referencing a non-existent asset/identity must fail validation."""
    data = export_twin_json(golden_twin)
    data["edges"].append({
        "src": "unknown-phantom-node",
        "dst": "prod-db",
        "technique": "db_login",
    })
    with pytest.raises(TwinValidationError) as exc:
        parse_and_validate_json(json.dumps(data))
    assert any("unknown source 'unknown-phantom-node'" in e for e in exc.value.errors)


def test_json_import_invalid_criticality(golden_twin):
    """Asset criticality outside 1-5 must fail validation."""
    data = export_twin_json(golden_twin)
    data["assets"][0]["criticality"] = 99
    with pytest.raises(TwinValidationError) as exc:
        parse_and_validate_json(json.dumps(data))
    assert any("criticality must be between 1 and 5" in e for e in exc.value.errors)


# =====================================================================
# 2. CSV Multi-Table Import & Export Unit Tests
# =====================================================================

def test_csv_export_and_import_roundtrip(golden_twin):
    """Exporting a Twin to CSV tables and importing it back must preserve all entities."""
    csv_dict = export_twin_csv_files(golden_twin)

    assert "assets.csv" in csv_dict
    assert "identities.csv" in csv_dict
    assert "edges.csv" in csv_dict
    assert "flows.csv" in csv_dict
    assert "controls.csv" in csv_dict

    reconstructed = parse_csv_files_to_twin(csv_dict, twin_id=golden_twin.id)

    assert reconstructed.id == golden_twin.id
    assert len(reconstructed.assets) == len(golden_twin.assets)
    assert len(reconstructed.edges) == len(golden_twin.edges)
    assert len(reconstructed.identities) == len(golden_twin.identities)
    assert len(reconstructed.flows) == len(golden_twin.flows)
    assert len(reconstructed.controls) == len(golden_twin.controls)

    dt_orig = CyberDigitalTwin(golden_twin)
    dt_recon = CyberDigitalTwin(reconstructed)
    assert dt_orig.hash() == dt_recon.hash()


def test_csv_zip_export_and_import_roundtrip(golden_twin):
    """Exporting to ZIP and parsing from ZIP must work end-to-end."""
    zip_bytes = export_twin_csv_zip(golden_twin)
    assert len(zip_bytes) > 0

    reconstructed = parse_csv_zip_to_twin(zip_bytes, twin_id=golden_twin.id)
    assert reconstructed.id == golden_twin.id
    assert len(reconstructed.assets) == len(golden_twin.assets)


def test_csv_import_missing_headers():
    """CSV with missing required headers must report exact missing fields."""
    broken_csv = {
        "assets.csv": "id,name\nserver-1,Server 1\n",
        "edges.csv": "src,dst,technique\nserver-1,server-2,ssh\n",
    }
    with pytest.raises(TwinValidationError) as exc:
        parse_csv_files_to_twin(broken_csv)
    assert any("assets.csv missing required headers" in e for e in exc.value.errors)


def test_csv_import_dangling_edge_reference():
    """CSV edge referencing a non-existent asset must produce a row-level error."""
    valid_assets = "id,name,kind,zone,criticality,crown_jewel\na1,Asset 1,server,dmz,2,false\n"
    bad_edges = "src,dst,technique\na1,unknown-target,ssh_lateral\n"

    csv_files = {
        "assets.csv": valid_assets,
        "edges.csv": bad_edges,
    }
    with pytest.raises(TwinValidationError) as exc:
        parse_csv_files_to_twin(csv_files)
    assert any("unknown target 'unknown-target'" in e for e in exc.value.errors)


def test_csv_handles_quoted_and_unicode_values():
    """CSV with quotes, commas in names, and unicode characters must be parsed cleanly."""
    unicode_assets = (
        "id,name,kind,zone,criticality,crown_jewel\n"
        'srv-tokyo,"Tokyo DC Gateway, 特殊サーバ",server,dmz,3,true\n'
        'srv-berlin,"Berlin Server (Überwachung)",server,corp,2,false\n'
    )
    edges = (
        "src,dst,technique\n"
        "srv-tokyo,srv-berlin,ssh_lateral\n"
    )
    csv_files = {
        "assets.csv": unicode_assets,
        "edges.csv": edges,
    }
    twin = parse_csv_files_to_twin(csv_files, twin_id="twin-unicode")
    assert len(twin.assets) == 2
    assert "特殊サーバ" in twin.assets[0].name
    assert "Überwachung" in twin.assets[1].name


# =====================================================================
# 3. API Endpoint Tests
# =====================================================================

def test_api_export_json(client):
    """GET /twin/{twin_id}/export/json returns valid downloadable JSON."""
    res = client.get("/twin/twin-finbank-golden/export/json")
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/json"
    assert "twin-finbank-golden.json" in res.headers["content-disposition"]

    data = res.json()
    assert data["id"] == "twin-finbank-golden"
    assert len(data["assets"]) == 10


def test_api_export_csv(client):
    """GET /twin/{twin_id}/export/csv returns a valid downloadable ZIP file."""
    res = client.get("/twin/twin-finbank-golden/export/csv")
    assert res.status_code == 200
    assert "application/zip" in res.headers["content-type"]

    with zipfile.ZipFile(io.BytesIO(res.content), "r") as zf:
        names = zf.namelist()
        assert "assets.csv" in names
        assert "edges.csv" in names
        assert "identities.csv" in names
        assert "flows.csv" in names
        assert "controls.csv" in names


def test_api_import_json_success(client, golden_twin):
    """POST /twin/import/json accepts a valid JSON payload and registers the twin."""
    data = export_twin_json(golden_twin)
    data["id"] = "twin-imported-test-1"

    res = client.post("/twin/import/json", json=data)
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "success"
    assert body["twin_id"] == "twin-imported-test-1"
    assert body["asset_count"] == 10

    # Verify it can be retrieved via GET /twin/{twin_id}
    res_get = client.get("/twin/twin-imported-test-1")
    assert res_get.status_code == 200
    assert res_get.json()["id"] == "twin-imported-test-1"


def test_api_import_json_validation_failure(client, golden_twin):
    """POST /twin/import/json with invalid references returns HTTP 400 with errors list."""
    data = export_twin_json(golden_twin)
    data["edges"].append({"src": "non-existent-src", "dst": "prod-db", "technique": "db_login"})

    res = client.post("/twin/import/json", json=data)
    assert res.status_code == 400
    err_body = res.json()
    assert err_body["status"] == "error"
    assert "errors" in err_body
    assert any("non-existent-src" in err for err in err_body["errors"])


def test_api_import_csv_success(client, golden_twin):
    """POST /twin/import/csv accepts a ZIP upload and registers the twin."""
    zip_bytes = export_twin_csv_zip(golden_twin)

    files = {"file": ("twin.zip", zip_bytes, "application/zip")}
    res = client.post("/twin/import/csv?twin_id=twin-csv-test", files=files)
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "success"
    assert body["twin_id"] == "twin-csv-test"
    assert body["asset_count"] == 10

    # Ensure twin is registered and accessible
    res_get = client.get("/twin/twin-csv-test")
    assert res_get.status_code == 200


def test_api_simulation_on_imported_twin(client, golden_twin):
    """An imported twin can immediately execute the full /simulate pipeline."""
    data = export_twin_json(golden_twin)
    data["id"] = "twin-simulation-test"

    client.post("/twin/import/json", json=data)

    sim_res = client.post("/simulate", json={
        "twin_id": "twin-simulation-test",
        "agent_id": "agent-external",
        "n": 50,
        "seed": 42,
        "target": "prod-db",
    })
    assert sim_res.status_code == 200
    sim_data = sim_res.json()
    assert sim_data["twin_id"] == "twin-simulation-test"
    assert sim_data["agent_id"] == "agent-external"
    assert sim_data["n"] == 50
    assert 0.0 <= sim_data["p_success"] <= 1.0
    assert "states_explored" in sim_data
    assert "guidance_mode" in sim_data



