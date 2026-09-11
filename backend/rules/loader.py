"""Loader and validator for MITRE ATT&CK technique catalog."""

from pathlib import Path
import re
from typing import Dict, List, Optional, Tuple, Union
import yaml
from pydantic import BaseModel, Field, ValidationError, field_validator

# Default paths to canonical techniques.yaml
DEFAULT_TECHNIQUES_PATH = Path(__file__).parent / "techniques.yaml"
DEFAULT_TECHNIQUES_PATHS = [
    Path("rules/techniques.yaml"),
    DEFAULT_TECHNIQUES_PATH,
]


# Regex strictly matching MITRE Enterprise Technique IDs (e.g. T1078 or sub-technique T1021.001)
MITRE_ID_REGEX = re.compile(r"^T\d{4}(\.\d{3})?$")


class TechniqueDefinition(BaseModel, frozen=True):
    """Immutable, validated representation of an enterprise attack technique in v2.1."""

    id: str = Field(..., description="Canonical technique identifier (e.g. 'phish', 'rdp_lateral')")
    attck: str = Field(..., description="MITRE ATT&CK technique ID (e.g. 'T1566', 'T1021.001')")
    name: Optional[str] = None
    description: Optional[str] = ""
    protocol: Optional[str] = Field(default=None, description="Transport/application protocol")
    port: Optional[int] = Field(default=None, description="Default network port")
    requires: tuple[str, ...] = Field(default_factory=tuple, description="Prerequisites/capabilities required")
    grants: tuple[str, ...] = Field(default_factory=tuple, description="Capabilities/privileges granted")
    base_success: float = Field(default=1.0, ge=0.0, le=1.0, description="Base success probability (0-1)")
    cost: float = Field(default=1.0, ge=0.0, description="Attacker effort cost (>=0)")
    noise: float = Field(default=0.0, ge=0.0, le=1.0, description="Detection noise (0-1)")

    @field_validator("attck")
    @classmethod
    def validate_attck_id(cls, value: str) -> str:
        value = value.strip()
        if not MITRE_ID_REGEX.match(value):
            raise ValueError(f"Invalid MITRE ATT&CK technique ID format: '{value}'")
        return value

    @field_validator("id")
    @classmethod
    def validate_id(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("Technique id cannot be empty or whitespace only")
        return value.strip()


def resolve_techniques_path(filepath: Optional[Union[str, Path]] = None) -> Path:
    """Resolve the techniques.yaml file path, checking canonical locations."""
    if filepath is not None:
        p = Path(filepath)
        if p.exists():
            return p
        raise FileNotFoundError(f"Techniques catalog file not found: {filepath}")

    for p in DEFAULT_TECHNIQUES_PATHS:
        if p.exists():
            return p

    raise FileNotFoundError(
        f"Techniques catalog file not found at any default location: {DEFAULT_TECHNIQUES_PATHS}"
    )


def load_techniques(
    filepath: Optional[Union[str, Path]] = None
) -> tuple[TechniqueDefinition, ...]:
    """Load, validate, and return all techniques from a YAML file in deterministic order.

    Parameters
    ----------
    filepath : Optional[Union[str, Path]]
        Path to the techniques YAML file. If None, checks default canonical paths.

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
    path = resolve_techniques_path(filepath)

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
    seen_attck: set[str] = set()
    validated_techniques: List[TechniqueDefinition] = []

    for index, item in enumerate(raw_data):
        if not isinstance(item, dict):
            raise ValueError(f"Entry #{index} is not a valid technique dictionary: {item}")

        # Required fields in final v2.1 structure
        required_fields = {"id", "attck", "requires", "grants", "base_success", "cost", "noise"}
        missing_fields = required_fields - set(item.keys())
        if missing_fields:
            raise ValueError(
                f"Technique entry #{index} missing required fields: {sorted(missing_fields)}"
            )

        try:
            requires = tuple(item.get("requires") or [])
            grants = tuple(item.get("grants") or [])

            tech = TechniqueDefinition(
                id=item["id"],
                attck=item["attck"],
                name=item.get("name"),
                description=item.get("description", ""),
                protocol=item.get("protocol"),
                port=item.get("port"),
                requires=requires,
                grants=grants,
                base_success=float(item["base_success"]),
                cost=float(item["cost"]),
                noise=float(item["noise"]),
            )
        except (ValidationError, ValueError) as e:
            raise ValueError(f"Validation failed for technique #{index}: {e}") from e

        if tech.id in seen_ids:
            raise ValueError(f"Duplicate technique ID found: '{tech.id}'")
        if tech.attck in seen_attck:
            raise ValueError(f"Duplicate MITRE ATT&CK ID found: '{tech.attck}'")

        seen_ids.add(tech.id)
        seen_attck.add(tech.attck)
        validated_techniques.append(tech)

    return tuple(validated_techniques)


def load_techniques_map(
    filepath: Optional[Union[str, Path]] = None
) -> Dict[str, TechniqueDefinition]:
    """Load and return techniques indexed by BOTH canonical ID and MITRE ATT&CK ID."""
    techniques = load_techniques(filepath)
    mapping: Dict[str, TechniqueDefinition] = {}
    for t in techniques:
        mapping[t.id] = t
        mapping[t.attck] = t
    return mapping
