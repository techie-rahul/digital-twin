"""
Digital Twin Import/Export, Parsing, and Validation Service.

Supports:
  1. JSON canonical import and export.
  2. CSV multi-table import and export (assets, identities, edges, flows, controls).
  3. Comprehensive relationship, type, and boundary validation.
  4. ZIP archive packaging for CSV bundling.
"""
from __future__ import annotations

import csv
import io
import json
import zipfile
from typing import Any, Dict, List, Optional, Set, Tuple
from pydantic import ValidationError

from backend.core.models import Asset, Control, Edge, Identity, ServiceFlow, Twin
from backend.core.twin import CyberDigitalTwin, compute_twin_hash


MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB limit


class TwinValidationError(Exception):
    """Structured validation failure for Digital Twin import operations."""

    def __init__(self, message: str, errors: Optional[List[str]] = None):
        super().__init__(message)
        self.message = message
        self.errors = errors or [message]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": "error",
            "message": self.message,
            "errors": self.errors,
        }


# =====================================================================
# 1. Structural & Referential Validation Engine
# =====================================================================

def validate_twin_semantics(twin: Twin) -> List[str]:
    """
    Perform deep domain and referential integrity checks on a Twin instance.
    Returns a list of human-readable error messages (empty if completely valid).
    """
    errors: List[str] = []

    # 1. Duplicate Asset IDs
    seen_asset_ids: Set[str] = set()
    for a in twin.assets:
        if a.id in seen_asset_ids:
            errors.append(f"Duplicate asset ID found: '{a.id}'")
        seen_asset_ids.add(a.id)

    # 2. Duplicate Identity IDs
    seen_identity_ids: Set[str] = set()
    for i in twin.identities:
        if i.id in seen_identity_ids:
            errors.append(f"Duplicate identity ID found: '{i.id}'")
        seen_identity_ids.add(i.id)

    # ID overlap check between assets and identities
    common_ids = seen_asset_ids.intersection(seen_identity_ids)
    if common_ids:
        for cid in sorted(common_ids):
            errors.append(f"Collision: entity ID '{cid}' exists in both assets and identities.")

    valid_nodes = seen_asset_ids.union(seen_identity_ids)

    # 3. Edges referential integrity & duplicates
    seen_edges: Set[Tuple[str, str, str]] = set()
    for idx, e in enumerate(twin.edges, start=1):
        if e.src not in valid_nodes:
            errors.append(f"Edge #{idx} ({e.src} -> {e.dst}) references unknown source '{e.src}'.")
        if e.dst not in valid_nodes:
            errors.append(f"Edge #{idx} ({e.src} -> {e.dst}) references unknown target '{e.dst}'.")
        
        edge_key = (e.src, e.dst, e.technique)
        if edge_key in seen_edges:
            errors.append(f"Duplicate edge definition found: {e.src} -> {e.dst} via '{e.technique}'.")
        seen_edges.add(edge_key)

    # 4. Flows referential integrity & duplicates
    seen_flow_ids: Set[str] = set()
    for f in twin.flows:
        if f.id in seen_flow_ids:
            errors.append(f"Duplicate service flow ID found: '{f.id}'")
        seen_flow_ids.add(f.id)

        if f.src not in seen_asset_ids:
            errors.append(f"Service flow '{f.id}' references unknown source asset '{f.src}'.")
        if f.dst not in seen_asset_ids:
            errors.append(f"Service flow '{f.id}' references unknown target asset '{f.dst}'.")
        if f.criticality < 1 or f.criticality > 5:
            errors.append(f"Service flow '{f.id}' criticality must be between 1 and 5, got {f.criticality}.")

    # 5. Controls referential integrity & duplicates
    seen_control_ids: Set[str] = set()
    for c in twin.controls:
        if c.id in seen_control_ids:
            errors.append(f"Duplicate control ID found: '{c.id}'")
        seen_control_ids.add(c.id)

        if not (0.0 <= c.efficacy <= 1.0):
            errors.append(f"Control '{c.id}' efficacy must be between 0.0 and 1.0, got {c.efficacy}.")
        if c.cost < 0:
            errors.append(f"Control '{c.id}' cost cannot be negative, got {c.cost}.")

        # Scopes should target recognized assets or identities
        for scope_target in c.scope:
            if scope_target not in valid_nodes:
                errors.append(f"Control '{c.id}' scope references unknown target '{scope_target}'.")

    # 6. Asset Criticality validation
    for a in twin.assets:
        if a.criticality < 1 or a.criticality > 5:
            errors.append(f"Asset '{a.id}' criticality must be between 1 and 5, got {a.criticality}.")

    return errors


# =====================================================================
# 2. JSON Import / Export
# =====================================================================

def parse_and_validate_json(raw_text: str) -> Twin:
    """
    Parse a JSON string into a validated Twin model with complete domain verification.
    """
    if not raw_text or not raw_text.strip():
        raise TwinValidationError("Import failed: provided JSON payload is empty.")

    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise TwinValidationError(f"Malformed JSON: {exc.msg} at line {exc.lineno} column {exc.colno}")

    if not isinstance(data, dict):
        raise TwinValidationError("Invalid JSON format: top-level element must be an object.")

    # Support optional scenario_id / legacy keys
    if "id" not in data and "scenario_id" in data:
        data["id"] = data["scenario_id"]

    for key in ("assets", "identities", "edges", "flows", "controls"):
        if key not in data:
            data[key] = []

    try:
        twin = Twin.model_validate(data)
    except ValidationError as pydantic_err:
        formatted_errs = []
        for err in pydantic_err.errors():
            loc = " -> ".join(str(p) for p in err.get("loc", []))
            formatted_errs.append(f"Field '{loc}': {err.get('msg')}")
        raise TwinValidationError("JSON schema validation failed", formatted_errs)

    semantic_errors = validate_twin_semantics(twin)
    if semantic_errors:
        raise TwinValidationError(
            f"Twin semantic validation failed with {len(semantic_errors)} error(s)",
            semantic_errors,
        )

    return twin


def export_twin_json(twin: Twin, schema_version: str = "2.1") -> Dict[str, Any]:
    """
    Produce a clean, deterministic, JSON-serializable representation of the Twin.
    """
    return {
        "schema_version": schema_version,
        "id": twin.id,
        "parent_id": twin.parent_id,
        "assets": [
            {
                "id": a.id,
                "name": a.name,
                "kind": a.kind,
                "zone": a.zone,
                "criticality": a.criticality,
                "crown_jewel": a.crown_jewel,
            }
            for a in sorted(twin.assets, key=lambda x: x.id)
        ],
        "identities": [
            {
                "id": i.id,
                "name": i.name,
                "kind": i.kind,
                "tier": i.tier,
            }
            for i in sorted(twin.identities, key=lambda x: x.id)
        ],
        "edges": [
            {
                "src": e.src,
                "dst": e.dst,
                "technique": e.technique,
            }
            for e in sorted(twin.edges, key=lambda x: (x.src, x.dst, x.technique))
        ],
        "flows": [
            {
                "id": f.id,
                "name": f.name,
                "src": f.src,
                "dst": f.dst,
                "technique": f.technique,
                "criticality": f.criticality,
            }
            for f in sorted(twin.flows, key=lambda x: x.id)
        ],
        "controls": [
            {
                "id": c.id,
                "name": c.name,
                "cost": c.cost,
                "blocks": sorted(c.blocks),
                "scope": sorted(c.scope),
                "efficacy": c.efficacy,
            }
            for c in sorted(twin.controls, key=lambda x: x.id)
        ],
    }


# =====================================================================
# 3. CSV Multi-Table Import / Export
# =====================================================================

CSV_HEADERS = {
    "assets.csv": ["id", "name", "kind", "zone", "criticality", "crown_jewel"],
    "identities.csv": ["id", "name", "kind", "tier"],
    "edges.csv": ["src", "dst", "technique"],
    "flows.csv": ["id", "name", "src", "dst", "technique", "criticality"],
    "controls.csv": ["id", "name", "cost", "blocks", "scope", "efficacy"],
}


def _parse_bool(val: Any) -> bool:
    if isinstance(val, bool):
        return val
    s = str(val).strip().lower()
    return s in ("true", "1", "yes", "t", "y")


def _split_list(val: Any) -> List[str]:
    """Parse comma- or semicolon-separated tokens inside a quoted CSV cell."""
    if not val:
        return []
    raw = str(val).strip()
    if not raw:
        return []
    delimiter = ";" if ";" in raw else ","
    return [item.strip() for item in raw.split(delimiter) if item.strip()]


def export_twin_csv_files(twin: Twin) -> Dict[str, str]:
    """
    Export the Twin into 5 deterministic CSV strings with standard headers.
    """
    result: Dict[str, str] = {}

    # 1. assets.csv
    out_assets = io.StringIO()
    w_assets = csv.writer(out_assets, lineterminator="\n")
    w_assets.writerow(CSV_HEADERS["assets.csv"])
    for a in sorted(twin.assets, key=lambda x: x.id):
        w_assets.writerow([a.id, a.name, a.kind, a.zone, a.criticality, str(a.crown_jewel).lower()])
    result["assets.csv"] = out_assets.getvalue()

    # 2. identities.csv
    out_ids = io.StringIO()
    w_ids = csv.writer(out_ids, lineterminator="\n")
    w_ids.writerow(CSV_HEADERS["identities.csv"])
    for i in sorted(twin.identities, key=lambda x: x.id):
        w_ids.writerow([i.id, i.name, i.kind, i.tier])
    result["identities.csv"] = out_ids.getvalue()

    # 3. edges.csv
    out_edges = io.StringIO()
    w_edges = csv.writer(out_edges, lineterminator="\n")
    w_edges.writerow(CSV_HEADERS["edges.csv"])
    for e in sorted(twin.edges, key=lambda x: (x.src, x.dst, x.technique)):
        w_edges.writerow([e.src, e.dst, e.technique])
    result["edges.csv"] = out_edges.getvalue()

    # 4. flows.csv
    out_flows = io.StringIO()
    w_flows = csv.writer(out_flows, lineterminator="\n")
    w_flows.writerow(CSV_HEADERS["flows.csv"])
    for f in sorted(twin.flows, key=lambda x: x.id):
        w_flows.writerow([f.id, f.name, f.src, f.dst, f.technique, f.criticality])
    result["flows.csv"] = out_flows.getvalue()

    # 5. controls.csv (blocks and scopes are semicolon-joined)
    out_ctrls = io.StringIO()
    w_ctrls = csv.writer(out_ctrls, lineterminator="\n")
    w_ctrls.writerow(CSV_HEADERS["controls.csv"])
    for c in sorted(twin.controls, key=lambda x: x.id):
        blocks_str = ";".join(sorted(c.blocks))
        scope_str = ";".join(sorted(c.scope))
        w_ctrls.writerow([c.id, c.name, c.cost, blocks_str, scope_str, c.efficacy])
    result["controls.csv"] = out_ctrls.getvalue()

    return result


def export_twin_csv_zip(twin: Twin) -> bytes:
    """Bundle all 5 exported CSV files into an in-memory ZIP archive."""
    csv_dict = export_twin_csv_files(twin)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for filename, content in sorted(csv_dict.items()):
            zf.writestr(filename, content.encode("utf-8"))
    return buf.getvalue()


def parse_csv_files_to_twin(
    csv_contents: Dict[str, str],
    twin_id: str = "imported-twin",
    parent_id: Optional[str] = None,
) -> Twin:
    """
    Parse a dictionary of filename -> CSV text into a validated Twin model.
    Checks headers, field types, row numbers, and cross-file relationships.
    """
    errors: List[str] = []

    assets: List[Asset] = []
    identities: List[Identity] = []
    edges: List[Edge] = []
    flows: List[ServiceFlow] = []
    controls: List[Control] = []

    # 1. Parse assets.csv
    if "assets.csv" in csv_contents and csv_contents["assets.csv"].strip():
        reader = csv.DictReader(io.StringIO(csv_contents["assets.csv"]))
        if not reader.fieldnames or not set(["id", "name", "kind", "zone", "criticality"]).issubset(set(reader.fieldnames)):
            errors.append("assets.csv missing required headers. Expected: id, name, kind, zone, criticality, [crown_jewel]")
        else:
            for row_num, row in enumerate(reader, start=2):
                try:
                    aid = (row.get("id") or "").strip()
                    aname = (row.get("name") or "").strip()
                    akind = (row.get("kind") or "").strip().lower()
                    azone = (row.get("zone") or "").strip().lower()
                    acrit = int((row.get("criticality") or "1").strip())
                    acrown = _parse_bool(row.get("crown_jewel", False))
                    if not aid:
                        errors.append(f"assets.csv row {row_num}: asset id is empty")
                        continue
                    assets.append(Asset(
                        id=aid,
                        name=aname or aid,
                        kind=akind,  # type: ignore
                        zone=azone,
                        criticality=acrit,
                        crown_jewel=acrown,
                    ))
                except Exception as exc:
                    errors.append(f"assets.csv row {row_num}: {str(exc)}")

    # 2. Parse identities.csv
    if "identities.csv" in csv_contents and csv_contents["identities.csv"].strip():
        reader = csv.DictReader(io.StringIO(csv_contents["identities.csv"]))
        if not reader.fieldnames or not set(["id", "name", "kind", "tier"]).issubset(set(reader.fieldnames)):
            errors.append("identities.csv missing required headers. Expected: id, name, kind, tier")
        else:
            for row_num, row in enumerate(reader, start=2):
                try:
                    iid = (row.get("id") or "").strip()
                    iname = (row.get("name") or "").strip()
                    ikind = (row.get("kind") or "").strip().lower()
                    itier = int((row.get("tier") or "1").strip())
                    if not iid:
                        errors.append(f"identities.csv row {row_num}: identity id is empty")
                        continue
                    identities.append(Identity(
                        id=iid,
                        name=iname or iid,
                        kind=ikind,  # type: ignore
                        tier=itier,
                    ))
                except Exception as exc:
                    errors.append(f"identities.csv row {row_num}: {str(exc)}")

    # 3. Parse edges.csv
    if "edges.csv" in csv_contents and csv_contents["edges.csv"].strip():
        reader = csv.DictReader(io.StringIO(csv_contents["edges.csv"]))
        if not reader.fieldnames or not set(["src", "dst", "technique"]).issubset(set(reader.fieldnames)):
            errors.append("edges.csv missing required headers. Expected: src, dst, technique")
        else:
            for row_num, row in enumerate(reader, start=2):
                try:
                    src = (row.get("src") or "").strip()
                    dst = (row.get("dst") or "").strip()
                    tech = (row.get("technique") or "").strip()
                    if not src or not dst or not tech:
                        errors.append(f"edges.csv row {row_num}: src, dst, and technique are all required")
                        continue
                    edges.append(Edge(src=src, dst=dst, technique=tech))
                except Exception as exc:
                    errors.append(f"edges.csv row {row_num}: {str(exc)}")

    # 4. Parse flows.csv
    if "flows.csv" in csv_contents and csv_contents["flows.csv"].strip():
        reader = csv.DictReader(io.StringIO(csv_contents["flows.csv"]))
        if not reader.fieldnames or not set(["id", "name", "src", "dst", "technique", "criticality"]).issubset(set(reader.fieldnames)):
            errors.append("flows.csv missing required headers. Expected: id, name, src, dst, technique, criticality")
        else:
            for row_num, row in enumerate(reader, start=2):
                try:
                    fid = (row.get("id") or "").strip()
                    fname = (row.get("name") or "").strip()
                    src = (row.get("src") or "").strip()
                    dst = (row.get("dst") or "").strip()
                    tech = (row.get("technique") or "").strip()
                    crit = int((row.get("criticality") or "1").strip())
                    if not fid:
                        errors.append(f"flows.csv row {row_num}: flow id is empty")
                        continue
                    flows.append(ServiceFlow(
                        id=fid,
                        name=fname or fid,
                        src=src,
                        dst=dst,
                        technique=tech,
                        criticality=crit,
                    ))
                except Exception as exc:
                    errors.append(f"flows.csv row {row_num}: {str(exc)}")

    # 5. Parse controls.csv
    if "controls.csv" in csv_contents and csv_contents["controls.csv"].strip():
        reader = csv.DictReader(io.StringIO(csv_contents["controls.csv"]))
        if not reader.fieldnames or not set(["id", "name", "cost", "blocks", "scope", "efficacy"]).issubset(set(reader.fieldnames)):
            errors.append("controls.csv missing required headers. Expected: id, name, cost, blocks, scope, efficacy")
        else:
            for row_num, row in enumerate(reader, start=2):
                try:
                    cid = (row.get("id") or "").strip()
                    cname = (row.get("name") or "").strip()
                    cost = int((row.get("cost") or "0").strip())
                    blocks = tuple(_split_list(row.get("blocks", "")))
                    scope = tuple(_split_list(row.get("scope", "")))
                    efficacy = float((row.get("efficacy") or "1.0").strip())
                    if not cid:
                        errors.append(f"controls.csv row {row_num}: control id is empty")
                        continue
                    controls.append(Control(
                        id=cid,
                        name=cname or cid,
                        cost=cost,
                        blocks=blocks,
                        scope=scope,
                        efficacy=efficacy,
                    ))
                except Exception as exc:
                    errors.append(f"controls.csv row {row_num}: {str(exc)}")

    if errors:
        raise TwinValidationError(f"CSV import encountered {len(errors)} error(s)", errors)

    # Build Pydantic model
    try:
        twin = Twin(
            id=twin_id,
            parent_id=parent_id,
            assets=tuple(assets),
            identities=tuple(identities),
            edges=tuple(edges),
            flows=tuple(flows),
            controls=tuple(controls),
        )
    except ValidationError as pydantic_err:
        for err in pydantic_err.errors():
            loc = " -> ".join(str(p) for p in err.get("loc", []))
            errors.append(f"Field '{loc}': {err.get('msg')}")
        raise TwinValidationError("CSV data model validation failed", errors)

    # Cross-table referential semantics
    semantic_errors = validate_twin_semantics(twin)
    if semantic_errors:
        raise TwinValidationError(f"CSV semantic validation failed with {len(semantic_errors)} error(s)", semantic_errors)

    return twin


def parse_csv_zip_to_twin(zip_bytes: bytes, twin_id: Optional[str] = None) -> Twin:
    """
    Extract and parse a ZIP archive containing assets.csv, edges.csv, etc.
    """
    if len(zip_bytes) > MAX_UPLOAD_BYTES:
        raise TwinValidationError(f"File size exceeds maximum allowed limit ({MAX_UPLOAD_BYTES // (1024*1024)} MB).")

    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
            namelist = zf.namelist()
            csv_contents: Dict[str, str] = {}
            for name in namelist:
                basename = name.split("/")[-1].split("\\")[-1].lower()
                if basename in CSV_HEADERS:
                    with zf.open(name) as f:
                        csv_contents[basename] = f.read().decode("utf-8-sig")

            if not csv_contents:
                raise TwinValidationError(
                    "Uploaded ZIP archive contains no recognizable Digital Twin CSV files. "
                    "Expected at least assets.csv and edges.csv."
                )

            target_id = twin_id or "twin-imported-csv"
            return parse_csv_files_to_twin(csv_contents, twin_id=target_id)
    except zipfile.BadZipFile:
        raise TwinValidationError("Invalid or corrupted ZIP archive.")
