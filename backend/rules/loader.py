"""Loader and validator for MITRE ATT&CK technique catalog."""

from pathlib import Path
import re
from typing import Dict, List, Optional, Tuple, Union
import yaml
from pydantic import BaseModel, Field, ValidationError, field_validator

# Default path to canonical techniques.yaml
DEFAULT_TECHNIQUES_PATH = Path(__file__).parent / "techniques.yaml"

# Regex strictly matching MITRE Enterprise Technique IDs (e.g. T1078 or sub-technique T1021.001)
MITRE_ID_REGEX = re.compile(r"^T\d{4}(\.\d{3})?$")


class TechniqueDefinition(BaseModel, frozen=True):
    """Immutable, validated representation of an enterprise attack technique."""
    id: str = Field(..., description="MITRE ATT&CK technique ID (e.g. T1078, T1021.001)")
    name: str = Field(..., description="Canonical technique name")
    description: str = Field(..., description="Summary description of the attack technique")
    prerequisites: tuple[str, ...] = Field(default_factory=tuple, description="Capabilities/conditions required")
    grants: tuple[str, ...] = Field(default_factory=tuple, description="Capabilities/privileges granted")
    blocks: tuple[str, ...] = Field(default_factory=tuple, description="Defensive security controls that mitigate")

    @field_validator("id")
    @classmethod
    def validate_mitre_id(cls, value: str) -> str:
        value = value.strip()
        if not MITRE_ID_REGEX.match(value):
            raise ValueError(f"Invalid MITRE ATT&CK technique ID format: '{value}'")
        return value

    @field_validator("name", "description")
    @classmethod
    def validate_non_empty(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("Field cannot be empty or whitespace only")
        return value.strip()


def load_techniques(
    filepath: Union[str, Path] = DEFAULT_TECHNIQUES_PATH
) -> tuple[TechniqueDefinition, ...]:
    """Load, validate, and return all techniques from a YAML file in deterministic order.

    Parameters
    ----------
    filepath : Union[str, Path]
        Path to the techniques YAML file.

    Returns
    -------
    tuple[TechniqueDefinition, ...]
        Immutable tuple of validated TechniqueDefinition objects.

    Raises
    ------
    FileNotFoundError
        If the technique file does not exist.
    ValueError
        If YAML is malformed, contains duplicate IDs, or fails validation.
    """
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"Techniques catalog file not found: {path}")

    try:
        with open(path, "r", encoding="utf-8") as f:
            raw_data = yaml.safe_load(f)
    except yaml.YAMLError as e:
        raise ValueError(f"Malformed YAML in technique catalog: {e}") from e

    if not isinstance(raw_data, list):
        raise ValueError("Technique catalog root must be a list of technique entries")

    if len(raw_data) == 0:
        raise ValueError("Technique catalog cannot be empty")

    seen_ids: set[str] = set()
    validated_techniques: List[TechniqueDefinition] = []

    for index, item in enumerate(raw_data):
        if not isinstance(item, dict):
            raise ValueError(f"Entry #{index} is not a valid technique dictionary: {item}")

        # Check required fields exist before validation
        required_fields = {"id", "name", "description", "prerequisites", "grants", "blocks"}
        missing_fields = required_fields - set(item.keys())
        if missing_fields:
            raise ValueError(
                f"Technique entry #{index} missing required fields: {sorted(missing_fields)}"
            )

        try:
            # Convert list fields to tuples for immutability
            prereqs = tuple(item.get("prerequisites") or [])
            grants = tuple(item.get("grants") or [])
            blocks = tuple(item.get("blocks") or [])

            tech = TechniqueDefinition(
                id=item["id"],
                name=item["name"],
                description=item["description"],
                prerequisites=prereqs,
                grants=grants,
                blocks=blocks,
            )
        except (ValidationError, ValueError) as e:
            raise ValueError(f"Validation failed for technique #{index}: {e}") from e

        if tech.id in seen_ids:
            raise ValueError(f"Duplicate technique ID found: '{tech.id}'")

        seen_ids.add(tech.id)
        validated_techniques.append(tech)

    return tuple(validated_techniques)


def load_techniques_map(
    filepath: Union[str, Path] = DEFAULT_TECHNIQUES_PATH
) -> Dict[str, TechniqueDefinition]:
    """Load and return techniques indexed by MITRE ATT&CK ID."""
    techniques = load_techniques(filepath)
    return {t.id: t for t in techniques}
