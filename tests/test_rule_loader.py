"""Focused tests for the final v2.1 MITRE ATT&CK technique catalog loader and validation."""

from pathlib import Path
import tempfile
import pytest

from backend.rules.loader import (
    load_techniques,
    load_techniques_map,
    TechniqueDefinition,
    DEFAULT_TECHNIQUES_PATH,
    MITRE_ID_REGEX,
)


def test_yaml_loads_all_10_techniques():
    """Verify techniques.yaml loads the exact 10 final v2.1 techniques."""
    techniques = load_techniques()
    assert isinstance(techniques, tuple)
    assert len(techniques) == 10


def test_every_technique_has_required_v21_fields():
    """Verify all loaded techniques populate id, attck, requires, grants, base_success, cost, noise."""
    techniques = load_techniques()
    for tech in techniques:
        assert isinstance(tech, TechniqueDefinition)
        assert bool(tech.id and tech.id.strip())
        assert bool(tech.attck and tech.attck.strip())
        assert MITRE_ID_REGEX.match(tech.attck)
        assert isinstance(tech.requires, tuple)
        assert isinstance(tech.grants, tuple)
        assert 0.0 <= tech.base_success <= 1.0
        assert tech.cost >= 0.0
        assert 0.0 <= tech.noise <= 1.0


def test_technique_ids_and_attck_are_unique():
    """Verify there are zero duplicate IDs or ATT&CK IDs in the catalog."""
    techniques = load_techniques()
    id_list = [t.id for t in techniques]
    attck_list = [t.attck for t in techniques]
    assert len(id_list) == len(set(id_list)), "Duplicate technique ID detected"
    assert len(attck_list) == len(set(attck_list)), "Duplicate ATT&CK ID detected"


def test_loader_returns_deterministic_ordering():
    """Verify repeated loads produce identical sequence and contents."""
    run1 = load_techniques()
    run2 = load_techniques()
    assert run1 == run2
    assert [t.id for t in run1] == [t.id for t in run2]


def test_expected_10_canonical_techniques_present():
    """Verify all 10 final techniques are present with expected MITRE IDs."""
    tech_map = load_techniques_map()
    expected = {
        "phish": "T1566",
        "exploit_public_app": "T1190",
        "cred_dump": "T1003",
        "priv_esc_local": "T1068",
        "creds_in_files": "T1552.001",
        "rdp_lateral": "T1021.001",
        "ssh_lateral": "T1021.004",
        "smb_lateral": "T1021.002",
        "db_login": "T1078",
        "exfil_c2": "T1041",
    }
    for tech_id, expected_attck in expected.items():
        assert tech_id in tech_map, f"Technique '{tech_id}' missing from catalog"
        assert tech_map[tech_id].attck == expected_attck
        # Also indexed by ATT&CK ID
        assert expected_attck in tech_map
        assert tech_map[expected_attck].id == tech_id


def test_reject_missing_required_fields():
    """Verify loader raises ValueError if an entry misses required keys."""
    invalid_yaml = """
- id: "db_login"
  attck: "T1078"
  # missing requires, grants, base_success, cost, noise
"""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        f.write(invalid_yaml)
        temp_path = f.name

    try:
        with pytest.raises(ValueError, match="missing required fields"):
            load_techniques(temp_path)
    finally:
        Path(temp_path).unlink(missing_ok=True)


def test_reject_duplicate_ids():
    """Verify loader raises ValueError if duplicate IDs are present."""
    duplicate_yaml = """
- id: "db_login"
  attck: "T1078"
  requires: []
  grants: []
  base_success: 0.9
  cost: 1.0
  noise: 0.1

- id: "db_login"
  attck: "T1078.001"
  requires: []
  grants: []
  base_success: 0.8
  cost: 2.0
  noise: 0.2
"""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        f.write(duplicate_yaml)
        temp_path = f.name

    try:
        with pytest.raises(ValueError, match="Duplicate technique ID"):
            load_techniques(temp_path)
    finally:
        Path(temp_path).unlink(missing_ok=True)


def test_reject_invalid_mitre_id_format():
    """Verify loader rejects malformed MITRE ATT&CK technique IDs."""
    malformed_id_yaml = """
- id: "bad_tech"
  attck: "INVALID_MITRE_ID"
  requires: []
  grants: []
  base_success: 0.5
  cost: 1.0
  noise: 0.1
"""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        f.write(malformed_id_yaml)
        temp_path = f.name

    try:
        with pytest.raises(ValueError, match="Invalid MITRE ATT&CK technique ID format"):
            load_techniques(temp_path)
    finally:
        Path(temp_path).unlink(missing_ok=True)


def test_reject_empty_or_non_list_yaml():
    """Verify loader rejects empty files or non-list YAML root structures."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        f.write("key: value\n")
        temp_path = f.name

    try:
        with pytest.raises(ValueError, match="must be a list"):
            load_techniques(temp_path)
    finally:
        Path(temp_path).unlink(missing_ok=True)


def test_file_not_found_raises():
    """Verify loader raises FileNotFoundError when path does not exist."""
    with pytest.raises(FileNotFoundError):
        load_techniques("rules/non_existent_techniques.yaml")
