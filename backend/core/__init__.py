"""Core domain models and digital twin primitives for v2.1."""

from backend.core.models import (
    Asset,
    Identity,
    Edge,
    ServiceFlow,
    Control,
    Agent,
    Twin,
)
from backend.core.attacker import AttackerState
from backend.core.twin import (
    CyberDigitalTwin,
    FinBankTwin,
    compute_twin_hash,
    canonical_twin_dict,
    clone,
)

from backend.core.search import (
    search,
    Inventory,
    AttackPath,
    SearchBudgetExceeded,
    SearchCache,
    GLOBAL_SEARCH_CACHE,
)

from backend.core.walk import (
    simulate,
    Result as WalkResult,
    SimulationResult,
    EvaluatedRoute,
    TrialRecord,
    evaluate_routes,
    compute_p_edge_eff,
    compute_p_route,
    compute_modelled_effort_score,
    compute_route_noise,
    compute_route_utility,
    execute_trial,
)

from backend.core.results import (
    Result,
    Delta,
    RouteStat,
    TopRouteStats,
    compute_results,
    diff,
    compute_wilson_ci,
    compute_p90,
    compute_effort_distribution,
    compute_edge_frequencies,
    compute_weighted_risk,
)

__all__ = [
    "Asset",
    "Identity",
    "Edge",
    "ServiceFlow",
    "Control",
    "Agent",
    "Twin",
    "AttackerState",
    "CyberDigitalTwin",
    "FinBankTwin",
    "compute_twin_hash",
    "canonical_twin_dict",
    "clone",
    "search",
    "Inventory",
    "AttackPath",
    "SearchBudgetExceeded",
    "SearchCache",
    "GLOBAL_SEARCH_CACHE",
    "simulate",
    "WalkResult",
    "Result",
    "SimulationResult",
    "EvaluatedRoute",
    "TrialRecord",
    "evaluate_routes",
    "compute_p_edge_eff",
    "compute_p_route",
    "compute_modelled_effort_score",
    "compute_route_noise",
    "compute_route_utility",
    "execute_trial",
    "Delta",
    "RouteStat",
    "TopRouteStats",
    "compute_results",
    "diff",
    "compute_wilson_ci",
    "compute_p90",
    "compute_effort_distribution",
    "compute_edge_frequencies",
    "compute_weighted_risk",
]


