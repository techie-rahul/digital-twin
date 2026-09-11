"""Focused tests for the MITRE ATT&CK technique catalog loader and validation."""

import pytest
import tempfile
from pathlib import Path

from backend.rules.loader import (
    load_techniques,
    load_techniques_map,
    TechniqueDefinition,
    DEFAULT_TECHNIQUES_PATH,
    MITRE_ID_REGEX,
)


def test_yaml_loads_successfully():
    """Verify techniques.yaml can be loaded without error."""
    techniques = load_techniques()
    assert isinstance(techniques, tuple)
    assert len(techniques) >= 10
    assert len(techniques) <= 12


def test_every_technique_has_required_fields():
    """Verify all loaded techniques populate id, name, description, prerequisites, grants, blocks."""
    techniques = load_techniques()
    for tech in techniques:
        assert isinstance(tech, TechniqueDefinition)
        assert bool(tech.id and tech.id.strip())
        assert bool(tech.name and tech.name.strip())
        assert bool(tech.description and tech.description.strip())
        assert isinstance(tech.prerequisites, tuple)
        assert isinstance(tech.grants, tuple)
        assert isinstance(tech.blocks, tuple)


def test_technique_ids_are_unique():
    """Verify there are zero duplicate technique IDs in the catalog."""
    techniques = load_techniques()
    id_list = [t.id for t in techniques]
    id_set = set(id_list)
    assert len(id_list) == len(id_set), f"Duplicate IDs detected: {len(id_list) - len(id_set)}"


def test_technique_ids_have_mitre_format():
    """Verify every technique ID follows canonical MITRE Enterprise ATT&CK format."""
    techniques = load_techniques()
    for tech in techniques:
        assert MITRE_ID_REGEX.match(tech.id), f"Invalid MITRE ID format: {tech.id}"


def test_loader_returns_deterministic_ordering():
    """Verify repeated loads produce identical sequence and contents."""
    run1 = load_techniques()
    run2 = load_techniques()
    assert run1 == run2
    assert [t.id for t in run1] == [t.id for t in run2]


def test_expected_baseline_techniques_present():
    """Verify core enterprise techniques needed by the prototype are in the catalog."""
    tech_map = load_techniques_map()
    expected_ids = {
        "T1046",      # Network Service Scanning
        "T1087",      # Account Discovery
        "T1078",      # Valid Accounts
        "T1021.001",  # Remote Services: RDP
        "T1021.002",  # Remote Services: SMB
        "T1021.004",  # Remote Services: SSH
        "T1059.001",  # Command & Scripting: PowerShell
        "T1003",      # OS Credential Dumping
        "T1550.002",  # Pass the Hash
        "T1560",      # Archive Collected Data
        "T1041",      # Exfiltration Over C2 Channel
    }
    for tid in expected_ids:
        assert tid in tech_map, f"Expected baseline technique {tid} missing from catalog"


def test_reject_missing_required_fields():
    """Verify loader raises ValueError if an entry misses required keys."""
    invalid_yaml = """
- id: "T1078"
  name: "Valid Accounts"
  # missing description, prerequisites, grants, blocks
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
- id: "T1078"
  name: "Valid Accounts"
  description: "Desc 1"
  prerequisites: []
  grants: []
  blocks: []

- id: "T1078"
  name: "Valid Accounts Duplicate"
  description: "Desc 2"
  prerequisites: []
  grants: []
  blocks: []
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
    """Verify loader rejects fake or malformed MITRE technique IDs."""
    malformed_id_yaml = """
- id: "FAKE_TECHNIQUE_123"
  name: "Fake Technique"
  description: "Desc"
  prerequisites: []
  grants: []
  blocks: []
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
        load_techniques("backend/rules/non_existent_techniques.yaml")
