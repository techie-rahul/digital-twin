"""Phase 5: Structured simulation results, metrics, and before/after comparative deltas (v2.1)."""

from typing import Any, Dict, List, Optional, Sequence, Set, Tuple, Union
import math
from pydantic import BaseModel, Field, model_validator

from backend.core.models import Agent, Asset, Edge, Twin
from backend.core.search import AttackPath, Inventory
from backend.core.walk import (
    EvaluatedRoute,
    Result as WalkResult,
    SimulationResult,
    TrialRecord,
    simulate,
)
from backend.rules.compile import CompiledEdge


# =====================================================================
# 1. Models
# =====================================================================

class RouteStat(BaseModel, frozen=True):
    """Route policy evaluation and observed simulation statistics for a candidate attack path."""

    route_id: str
    p_select: float
    observed_frequency: float
    p_route: float = 0.0
    effort_score: float = 0.0
    noise: float = 0.0
    utility: float = 0.0
    trial_count: int = 0
    success_count: int = 0
    path: Optional[AttackPath] = None

    @model_validator(mode="before")
    @classmethod
    def check_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "selection_prob" in data and "p_select" not in data:
                data["p_select"] = data["selection_prob"]
            elif "p_select" in data and "selection_prob" not in data:
                data["selection_prob"] = data["p_select"]
            if "observed_freq" in data and "observed_frequency" not in data:
                data["observed_frequency"] = data["observed_freq"]
        return data

    @property
    def selection_prob(self) -> float:
        return self.p_select

    @property
    def observed_freq(self) -> float:
        return self.observed_frequency


TopRouteStats = RouteStat


class Result(BaseModel, frozen=True):
    """Phase 5 consolidated simulation result container with statistical metrics (v2.1)."""

    twin_id: str = ""
    agent_id: str = ""
    target: Optional[str] = None
    n: int = 0
    seed: int = 0

    # Probabilistic and confidence metrics
    p_success: float = 0.0
    wilson_ci: tuple[float, float] = (0.0, 0.0)

    # Effort statistics (calculated strictly over SUCCESSFUL trials)
    effort_distribution: dict[str, int] = Field(default_factory=dict)
    mean_effort: float = 0.0
    p90_effort: float = 0.0

    # Choke-point edge frequencies across all trials
    edge_frequency: dict[str, float] = Field(default_factory=dict)

    # Top-K candidate routes with selection probability and observed frequency
    top_routes: tuple[RouteStat, ...] = ()

    # Target asset criticality-weighted risk score
    weighted_risk: float = 0.0

    # Execution counts
    success_count: int = 0
    failure_count: int = 0

    # Raw trials and candidate routes for complete Phase 4 backward compatibility
    trials: tuple[TrialRecord, ...] = ()
    naive_path_count: Optional[int] = None

    # Noise & detection metrics from Phase 4
    mean_noise: float = 0.0
    detection_rate: float = 0.0

    @property
    def wilson_confidence(self) -> tuple[float, float]:
        return self.wilson_ci

    @property
    def confidence_interval(self) -> tuple[float, float]:
        return self.wilson_ci

    @property
    def candidate_routes(self) -> tuple[RouteStat, ...]:
        return self.top_routes

    @property
    def top_k_routes(self) -> tuple[RouteStat, ...]:
        return self.top_routes

    @property
    def exemplar_paths(self) -> tuple[RouteStat, ...]:
        return self.top_routes


class Delta(BaseModel, frozen=True):
    """Comparative delta between before and after security digital twin simulation states."""

    naive_path_reduction_pct: float = 0.0
    effort_increase_pct: Optional[float] = None
    route_eliminated: tuple[str, ...] = ()
    p_success_delta: float = 0.0
    substituted_paths: tuple[str, ...] = ()

    @model_validator(mode="before")
    @classmethod
    def handle_delta_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "routes_eliminated" in data and "route_eliminated" not in data:
                data["route_eliminated"] = data["routes_eliminated"]
        return data

    @property
    def routes_eliminated(self) -> tuple[str, ...]:
        return self.route_eliminated

    @property
    def p_success_reduction(self) -> float:
        return -self.p_success_delta


# =====================================================================
# 2. Statistical Computations
# =====================================================================

def compute_wilson_ci(
    successes: int,
    n: int,
    z: float = 1.96,
) -> tuple[float, float]:
    """Compute deterministic Wilson score confidence interval for a binomial proportion.

    Parameters
    ----------
    successes : int
        Number of successful trials.
    n : int
        Total number of trials.
    z : float
        Normal distribution quantile (default 1.96 for ~95% confidence).

    Returns
    -------
    tuple[float, float]
        (lower_bound, upper_bound) clamped to [0.0, 1.0]. Returns (0.0, 0.0) if n <= 0.
    """
    if n <= 0:
        return (0.0, 0.0)

    p = successes / n
    z2 = z * z
    denominator = 1.0 + (z2 / n)
    center = (p + (z2 / (2.0 * n))) / denominator

    radicand = (p * (1.0 - p) / n) + (z2 / (4.0 * (n * n)))
    spread = (z * math.sqrt(max(0.0, radicand))) / denominator

    lower = max(0.0, center - spread)
    upper = min(1.0, center + spread)
    return (round(lower, 6), round(upper, 6))


def compute_p90(values: Sequence[float]) -> float:
    """Compute 90th percentile of values using the standard nearest-rank method."""
    if not values:
        return 0.0
    s = sorted(values)
    n = len(s)
    idx = max(0, min(n - 1, math.ceil(0.90 * n) - 1))
    return float(s[idx])


def compute_effort_distribution(
    values: Sequence[float],
    bins: int = 10,
) -> dict[str, int]:
    """Compute histogram bins of realized effort for successful trials."""
    if not values:
        return {}
    min_v = min(values)
    max_v = max(values)
    if min_v == max_v:
        return {f"[{min_v:.2f}, {max_v:.2f}]": len(values)}

    bin_width = (max_v - min_v) / bins
    distribution: dict[str, int] = {}
    bin_edges = [min_v + i * bin_width for i in range(bins + 1)]
    bin_edges[-1] = max_v

    labels = []
    for i in range(bins):
        low = bin_edges[i]
        high = bin_edges[i + 1]
        if i == bins - 1:
            label = f"[{low:.2f}, {high:.2f}]"
        else:
            label = f"[{low:.2f}, {high:.2f})"
        labels.append(label)
        distribution[label] = 0

    for v in values:
        placed = False
        for i in range(bins):
            low = bin_edges[i]
            high = bin_edges[i + 1]
            if i == bins - 1:
                if low <= v <= high:
                    distribution[labels[i]] += 1
                    placed = True
                    break
            else:
                if low <= v < high:
                    distribution[labels[i]] += 1
                    placed = True
                    break
        if not placed:
            distribution[labels[-1]] += 1

    return distribution


def compute_edge_frequencies(
    trials: Sequence[TrialRecord],
    n: int,
) -> dict[str, float]:
    """Compute occurrence frequency of each executed edge across all simulation trials."""
    if n <= 0 or not trials:
        return {}

    counts: dict[str, int] = {}
    for t in trials:
        seen_in_trial: Set[str] = set()
        for e in t.edges_executed:
            if isinstance(e, str):
                key = e
            elif hasattr(e, "src") and hasattr(e, "dst"):
                key = f"{e.src}->{e.dst}"
            else:
                key = str(e)
            seen_in_trial.add(key)
        for key in seen_in_trial:
            counts[key] = counts.get(key, 0) + 1

    return {k: round(v / n, 6) for k, v in sorted(counts.items())}


def compute_weighted_risk(
    routes: Sequence[Union[EvaluatedRoute, RouteStat]],
    target_criticality: int,
) -> float:
    """Compute target_criticality * sum(p_select * p_route)."""
    if not routes or target_criticality <= 0:
        return 0.0
    total = sum(
        (getattr(r, "p_select", None) or getattr(r, "selection_prob", 0.0))
        * getattr(r, "p_route", 0.0)
        for r in routes
    )
    return round(target_criticality * total, 6)


# =====================================================================
# 3. Primary API: compute_results and diff
# =====================================================================

def compute_results(
    sim_result: Union[WalkResult, Result],
    twin: Optional[Twin] = None,
    *,
    target_criticality: Optional[int] = None,
    naive_path_count: Optional[int] = None,
) -> Result:
    """Compute Phase 5 Result metrics from raw simulation walk records.

    SEARCH MUST NOT RUN INSIDE THIS FUNCTION.
    """
    n = sim_result.n
    seed = sim_result.seed
    twin_id = sim_result.twin_id
    agent_id = sim_result.agent_id
    target = sim_result.target
    trials = tuple(sim_result.trials)

    # 1. Success metrics
    if n <= 0:
        p_success = 0.0
        success_count = 0
        failure_count = 0
    else:
        success_count = sum(1 for t in trials if t.success)
        failure_count = len(trials) - success_count
        p_success = round(success_count / n, 6)

    # 2. Wilson confidence interval
    wilson_ci = compute_wilson_ci(success_count, n)

    # 3. Effort metrics (strictly over SUCCESSFUL trials)
    successful_trials = [t for t in trials if t.success]
    successful_efforts = [t.realized_effort for t in successful_trials]

    if not successful_efforts:
        mean_effort = 0.0
        p90_effort = 0.0
        effort_distribution: dict[str, int] = {}
    else:
        mean_effort = round(sum(successful_efforts) / len(successful_efforts), 6)
        p90_effort = round(compute_p90(successful_efforts), 6)
        effort_distribution = compute_effort_distribution(successful_efforts, bins=10)

    # 4. Edge frequencies
    edge_frequency = compute_edge_frequencies(trials, n)

    # 5. Route statistics
    route_trial_counts: dict[str, int] = {}
    route_success_counts: dict[str, int] = {}
    for t in trials:
        route_trial_counts[t.route_id] = route_trial_counts.get(t.route_id, 0) + 1
        if t.success:
            route_success_counts[t.route_id] = route_success_counts.get(t.route_id, 0) + 1

    candidate_routes = getattr(sim_result, "candidate_routes", ())
    top_routes_list: list[RouteStat] = []
    for r in candidate_routes:
        rid = getattr(r, "route_id", "")
        p_sel = getattr(r, "p_select", None)
        if p_sel is None:
            p_sel = getattr(r, "selection_prob", 0.0)
        t_cnt = route_trial_counts.get(rid, 0)
        s_cnt = route_success_counts.get(rid, 0)
        obs_freq = round(t_cnt / n, 6) if n > 0 else 0.0

        top_routes_list.append(
            RouteStat(
                route_id=rid,
                p_select=p_sel,
                observed_frequency=obs_freq,
                p_route=getattr(r, "p_route", 0.0),
                effort_score=getattr(r, "effort_score", 0.0),
                noise=getattr(r, "noise", 0.0),
                utility=getattr(r, "utility", 0.0),
                trial_count=t_cnt,
                success_count=s_cnt,
                path=getattr(r, "path", None),
            )
        )
    top_routes = tuple(top_routes_list)

    # 6. Target criticality and weighted risk
    crit: int = 1
    if target_criticality is not None:
        crit = target_criticality
    elif twin is not None:
        target_asset = next((a for a in twin.assets if a.id == target), None)
        if target_asset is not None:
            crit = target_asset.criticality
        else:
            crown_jewels = [a for a in twin.assets if getattr(a, "crown_jewel", False)]
            if crown_jewels:
                crit = max(a.criticality for a in crown_jewels)

    weighted_risk = compute_weighted_risk(top_routes, crit)

    # 7. Preserved noise & detection metrics
    mean_noise = getattr(sim_result, "mean_noise", 0.0)
    detection_rate = getattr(sim_result, "detection_rate", 0.0)

    # 8. Path count
    resolved_paths = naive_path_count
    if resolved_paths is None:
        resolved_paths = getattr(sim_result, "naive_path_count", None)

    return Result(
        twin_id=twin_id,
        agent_id=agent_id,
        target=target,
        n=n,
        seed=seed,
        p_success=p_success,
        wilson_ci=wilson_ci,
        effort_distribution=effort_distribution,
        mean_effort=mean_effort,
        p90_effort=p90_effort,
        edge_frequency=edge_frequency,
        top_routes=top_routes,
        weighted_risk=weighted_risk,
        success_count=success_count,
        failure_count=failure_count,
        trials=trials,
        naive_path_count=resolved_paths,
        mean_noise=mean_noise,
        detection_rate=detection_rate,
    )


def diff(
    before: Union[Result, WalkResult],
    after: Union[Result, WalkResult],
    *,
    before_paths: Optional[int] = None,
    after_paths: Optional[int] = None,
    before_inventory: Optional[Inventory] = None,
    after_inventory: Optional[Inventory] = None,
    twin: Optional[Twin] = None,
) -> Delta:
    """Compute comparative Delta metrics between before and after simulation results."""
    # Convert WalkResult to Phase 5 Result if needed
    before_res: Result = (
        before if isinstance(before, Result) else compute_results(before, twin=twin)
    )
    after_res: Result = (
        after if isinstance(after, Result) else compute_results(after, twin=twin)
    )

    # 1. Naive path reduction percentage
    n_before: int
    if before_paths is not None:
        n_before = before_paths
    elif before_inventory is not None:
        n_before = len(before_inventory.paths)
    elif before_res.naive_path_count is not None:
        n_before = before_res.naive_path_count
    elif before_res.top_routes:
        n_before = len(before_res.top_routes)
    else:
        n_before = len(getattr(before, "candidate_routes", ()))

    n_after: int
    if after_paths is not None:
        n_after = after_paths
    elif after_inventory is not None:
        n_after = len(after_inventory.paths)
    elif after_res.naive_path_count is not None:
        n_after = after_res.naive_path_count
    elif after_res.top_routes:
        n_after = len(after_res.top_routes)
    else:
        n_after = len(getattr(after, "candidate_routes", ()))

    if n_before <= 0:
        naive_path_reduction_pct = 0.0
    else:
        naive_path_reduction_pct = round(((n_before - n_after) / n_before) * 100.0, 6)

    # 2. Effort increase percentage
    # Return None when there are fewer than 20 successful trials in either before or after
    effort_increase_pct: Optional[float] = None
    if before_res.success_count >= 20 and after_res.success_count >= 20:
        if before_res.mean_effort == 0.0:
            effort_increase_pct = 0.0 if after_res.mean_effort == 0.0 else round(after_res.mean_effort * 100.0, 6)
        else:
            effort_increase_pct = round(
                ((after_res.mean_effort - before_res.mean_effort) / before_res.mean_effort) * 100.0,
                6,
            )

    # 3. Route elimination and substitution
    before_routes = {r.route_id for r in before_res.top_routes}
    after_routes = {r.route_id for r in after_res.top_routes}

    route_eliminated = tuple(sorted(before_routes - after_routes))
    substituted_paths = tuple(sorted(after_routes - before_routes))

    # 4. Success probability delta
    p_success_delta = round(after_res.p_success - before_res.p_success, 6)

    return Delta(
        naive_path_reduction_pct=naive_path_reduction_pct,
        effort_increase_pct=effort_increase_pct,
        route_eliminated=route_eliminated,
        p_success_delta=p_success_delta,
        substituted_paths=substituted_paths,
    )
