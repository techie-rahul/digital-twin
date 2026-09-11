"""
Temporary stubs for endpoints that depend on Person 1 (results.py)
and Person 2 (evaluate.py, optimize.py).

IMPORTANT: These stubs return SCHEMA-CORRECT mock data that exactly
matches the API contract. Person 3 (frontend) can develop against these.

When Person 1/2 deliver their modules, replace the stub call with the
real integration — the external API contract DOES NOT change.

Stubs are clearly marked with # STUB comments.
"""
from __future__ import annotations

from typing import Any, Dict, List


def stub_evaluate_change(
    twin_id: str,
    control_ids: List[str],
    agent_ids: List[str],
    seed: int = 42,
) -> Dict[str, Any]:
    """
    # STUB — replace with backend.rules.evaluate.evaluate_change() when Person 2 delivers.

    Returns a ChangeVerdict-shaped dict matching INTERFACES.md §evaluate-change.
    """
    # Realistic placeholder values so the UI renders meaningful demo output
    return {
        "twin_id": twin_id,
        "control_ids": control_ids,
        "agent_ids": agent_ids,
        "seed": seed,
        "verdict": "REVIEW",                   # BLOCK | REVIEW | DEPLOY
        "confidence": {
            "level": "Medium",                 # High | Medium | Low
            "score": 0.72,
            "unknowns": ["svc.backup admin grant on prod-db is inferred, not observed"],
            "undetermined": False,
        },
        "broken_flows": [
            {
                "flow_id": "F2",
                "flow_name": "Web Portal API Integration",
                "src": "web-dmz",
                "dst": "payroll-api",
                "technique": "db_login",
                "criticality": 4,
                "reason": (
                    "this interactive MFA policy is incompatible with these "
                    "non-interactive service identities"
                ),
            }
        ],
        "delta": {
            "naive_path_reduction_pct": 58.3,
            "effort_increase_pct": 142.0,
            "route_eliminated": False,
            "p_success_delta": -0.34,
            "substituted_paths": 2,
        },
        "recommendation": (
            "Apply scoped segmentation first; address non-interactive identity "
            "compatibility before enabling MFA on payroll-api."
        ),
        "reasons": [
            "Control reduces naive attack path count by ~58%",
            "Modelled attacker-effort score increases by 142%",
            "Flow F2 (criticality 4) is broken — requires exception for svc.payroll",
        ],
        "alternatives": [
            {
                "control_ids": ["ctrl-network-seg"],
                "verdict": "DEPLOY",
                "naive_path_reduction_pct": 66.7,
                "effort_increase_pct": 210.0,
                "cost": 2500,
                "broken_flows": [],
            }
        ],
        "_stub": True,  # Remove this field when real integration is wired
    }


def stub_optimize(
    twin_id: str,
    budget: int,
    agent_ids: List[str],
) -> Dict[str, Any]:
    """
    # STUB — replace with backend.core.optimizer.optimize() when Person 2+4 deliver Phase 7.

    Returns an optimizer Portfolio-shaped dict matching INTERFACES.md §optimize.
    """
    return {
        "twin_id": twin_id,
        "budget": budget,
        "agent_ids": agent_ids,
        "optimal_portfolio": {
            "control_ids": ["ctrl-network-seg", "ctrl-mfa"],
            "total_cost": 4000,
            "naive_path_reduction_pct": 83.3,
            "effort_increase_pct": 310.0,
            "broken_flows": [],
            "verdict": "DEPLOY",
        },
        "naive_top_n": [
            {
                "rank": 1,
                "control_ids": ["ctrl-network-seg"],
                "paths_eliminated": 8,
                "cost": 2500,
            },
            {
                "rank": 2,
                "control_ids": ["ctrl-mfa"],
                "paths_eliminated": 6,
                "cost": 1500,
            },
        ],
        "alternatives": [
            {
                "control_ids": ["ctrl-network-seg"],
                "total_cost": 2500,
                "naive_path_reduction_pct": 66.7,
                "verdict": "DEPLOY",
                "broken_flows": [],
            }
        ],
        "_stub": True,
    }


def stub_matrix(twin_id: str) -> Dict[str, Any]:
    """
    # STUB — replace with real controls×agents matrix computation when Person 2/4 deliver.

    Returns a matrix-shaped dict matching INTERFACES.md §matrix.
    """
    return {
        "twin_id": twin_id,
        "controls": ["ctrl-mfa", "ctrl-network-seg", "ctrl-edr", "ctrl-credguard"],
        "agents": ["agent-external", "agent-insider"],
        "matrix": [
            # [ctrl-mfa, ctrl-network-seg, ctrl-edr, ctrl-credguard]
            [0.58, 0.67, 0.25, 0.15],   # agent-external risk reduction
            [0.72, 0.80, 0.30, 0.20],   # agent-insider risk reduction
        ],
        "units": "naive_path_reduction_pct",
        "_stub": True,
    }
