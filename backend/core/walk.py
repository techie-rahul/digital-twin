"""Plan-then-execute adversary walk simulation (Algorithm B) for cyber digital twins."""

from typing import Any, Dict, List, Optional, Sequence, Tuple, Union
import random
from pydantic import BaseModel, Field

from backend.core.models import Agent, Twin
from backend.core.search import AttackPath, Inventory, search
from backend.core.twin import CyberDigitalTwin
from backend.rules.compile import CompiledEdge, CompiledTwin, compile_twin


# =====================================================================
# 1. Models & Result Contracts
# =====================================================================

class EvaluatedRoute(BaseModel, frozen=True):
    """Route policy evaluation for a candidate attack path."""

    route_id: str
    path: AttackPath
    p_edge_eff: tuple[float, ...]
    p_route: float
    effort_score: float  # modelled attacker-effort score: sum(cost / p)
    noise: float         # sum(edge.noise)
    utility: float       # p_route / effort_score
    selection_weight: float
    selection_prob: float


class TrialRecord(BaseModel, frozen=True):
    """Outcome record of a single simulated adversary execution trial."""

    trial_id: int
    route_id: str
    success: bool
    realized_effort: float
    realized_noise: float
    detected: bool
    edges_executed: tuple[Union[CompiledEdge, str], ...] = ()
    attempts_by_edge: tuple[int, ...] = ()
    reason: str = ""

    @property
    def total_attempts(self) -> int:
        return sum(self.attempts_by_edge)


class Result(BaseModel, frozen=True):
    """Phase 4 simulation result container for adversary walk trials."""

    twin_id: str
    agent_id: str
    target: Optional[str] = None
    n: int = 0
    seed: int = 0
    candidate_routes: tuple[EvaluatedRoute, ...] = ()
    trials: tuple[TrialRecord, ...] = ()
    p_success: float = 0.0
    mean_effort: float = 0.0
    mean_noise: float = 0.0
    detection_rate: float = 0.0

    @property
    def success_count(self) -> int:
        return sum(1 for t in self.trials if t.success)

    @property
    def failure_count(self) -> int:
        return sum(1 for t in self.trials if not t.success)


SimulationResult = Result


# =====================================================================
# 2. Route Policy Primitives
# =====================================================================

def compute_p_edge_eff(p: float, max_attempts: int = 3) -> float:
    """Calculate the route-policy effective probability that an edge succeeds within max_attempts.

    Formula:
        p_edge_eff = 1 - (1 - p)^max_attempts
    """
    if p <= 0.0:
        return 0.0
    if p >= 1.0:
        return 1.0
    return 1.0 - ((1.0 - p) ** max_attempts)


def compute_p_route(edge_effs: Sequence[float]) -> float:
    """Calculate the route success probability as the product of effective edge probabilities."""
    if not edge_effs:
        return 1.0
    p = 1.0
    for eff in edge_effs:
        p *= eff
    return p


def compute_modelled_effort_score(edges: Sequence[CompiledEdge]) -> float:
    """Calculate the modelled attacker-effort score: sum(cost_i / p_i).

    IMPORTANT: This is a modelled route-selection metric, NOT realized execution effort.
    """
    total: float = 0.0
    for e in edges:
        p = e.p_success
        cost = e.cost
        if p <= 0.0:
            total += 1000.0 * max(cost, 1.0)
        else:
            total += cost / p
    return total


def compute_route_noise(edges: Sequence[CompiledEdge]) -> float:
    """Calculate cumulative route noise: sum(edge.noise)."""
    return round(sum(e.noise for e in edges), 6)


def compute_route_utility(p_route: float, effort_score: float) -> float:
    """Calculate route utility: u = p_route / effort_score."""
    if effort_score <= 0.0 or p_route <= 0.0:
        return 0.0
    return p_route / effort_score


def evaluate_routes(
    inventory: Inventory,
    agent: Agent,
    k: int = 5,
) -> tuple[EvaluatedRoute, ...]:
    """Filter by noise budget, compute utilities, and select top-K routes with selection probabilities."""
    if not inventory.paths:
        return ()

    raw_evaluated: List[Dict[str, Any]] = []

    for path in inventory.paths:
        edge_effs = tuple(compute_p_edge_eff(e.p_success) for e in path.edges)
        p_route = compute_p_route(edge_effs)
        effort_score = compute_modelled_effort_score(path.edges)
        noise = compute_route_noise(path.edges)

        # Section 3: Discard routes where route_noise > agent.noise_budget
        if noise > agent.noise_budget:
            continue

        utility = compute_route_utility(p_route, effort_score)
        raw_evaluated.append({
            "path": path,
            "edge_effs": edge_effs,
            "p_route": p_route,
            "effort_score": effort_score,
            "noise": noise,
            "utility": utility,
        })

    if not raw_evaluated:
        return ()

    # Section 4: Deterministic sort by (-utility, path.id) and select top-K
    raw_evaluated.sort(key=lambda r: (-r["utility"], r["path"].id))
    top_k = raw_evaluated[:k]

    # Section 5: Route selection weighting proportional to u ^ (1 + 4 * skill)
    exponent = 1.0 + 4.0 * agent.skill
    weights: List[float] = []
    for r in top_k:
        w = (r["utility"] ** exponent) if r["utility"] > 0.0 else 0.0
        weights.append(w)

    total_weight = sum(weights)
    if total_weight > 0.0:
        probs = [w / total_weight for w in weights]
    else:
        # Fallback to uniform distribution
        probs = [1.0 / len(top_k)] * len(top_k)

    evaluated_routes: List[EvaluatedRoute] = []
    for r, w, p_sel in zip(top_k, weights, probs):
        evaluated_routes.append(
            EvaluatedRoute(
                route_id=r["path"].id,
                path=r["path"],
                p_edge_eff=r["edge_effs"],
                p_route=r["p_route"],
                effort_score=r["effort_score"],
                noise=r["noise"],
                utility=r["utility"],
                selection_weight=w,
                selection_prob=p_sel,
            )
        )

    return tuple(evaluated_routes)


# =====================================================================
# 3. Execution Simulation (Plan-Then-Execute)
# =====================================================================

def execute_trial(
    trial_id: int,
    candidate_routes: Sequence[EvaluatedRoute],
    agent: Agent,
    rng: Optional[random.Random] = None,
) -> TrialRecord:
    """Execute a single simulation trial using local deterministic RNG."""
    if not candidate_routes:
        raise ValueError("No candidate routes provided for execution trial.")

    if rng is None:
        rng = random.Random()

    # 1. Select one route according to selection probabilities
    route_probs = [r.selection_prob for r in candidate_routes]
    selected_route: EvaluatedRoute = rng.choices(candidate_routes, weights=route_probs, k=1)[0]

    realized_effort: float = 0.0
    realized_noise: float = 0.0
    detected: bool = False
    edges_executed: List[CompiledEdge] = []
    attempts_by_edge: List[int] = []
    route_succeeded: bool = True
    failure_reason: str = "target_reached"

    # 2. Execute edges sequentially
    for edge in selected_route.path.edges:
        edges_executed.append(edge)
        edge_succeeded: bool = False
        attempts: int = 0

        # 3. Up to 3 attempts per edge
        while attempts < 3 and not edge_succeeded:
            attempts += 1
            # 4. Each attempt incurs edge cost and edge noise
            realized_effort += edge.cost
            realized_noise += edge.noise

            # 6. Cumulative noise check
            if realized_noise > agent.noise_budget:
                detected = True
                route_succeeded = False
                failure_reason = "noise_budget_exceeded"
                break

            # 7. Sample attempt success using actual edge.p_success
            roll = rng.random()
            if roll < edge.p_success:
                edge_succeeded = True

        attempts_by_edge.append(attempts)

        if detected:
            break

        if not edge_succeeded:
            # 8. Edge failed after 3 attempts
            route_succeeded = False
            failure_reason = f"edge_failed:{edge.src}->{edge.dst}@{edge.technique}"
            break

    return TrialRecord(
        trial_id=trial_id,
        route_id=selected_route.route_id,
        success=route_succeeded,
        realized_effort=round(realized_effort, 6),
        realized_noise=round(realized_noise, 6),
        detected=detected,
        edges_executed=tuple(edges_executed),
        attempts_by_edge=tuple(attempts_by_edge),
        reason=failure_reason,
    )


def simulate(
    twin_or_inventory: Union[Twin, CyberDigitalTwin, Inventory, Sequence[CompiledEdge]],
    agent: Agent,
    n: int = 100,
    seed: int = 42,
    target: Optional[str] = None,
    *,
    inventory: Optional[Inventory] = None,
) -> Result:
    """Execute plan-then-execute adversary simulation over pre-computed attack inventory.

    SEARCH MUST NOT RUN INSIDE EACH SIMULATION TRIAL.

    Parameters
    ----------
    twin_or_inventory : Union[Twin, CyberDigitalTwin, Inventory, Sequence[CompiledEdge]]
        A Twin, an already discovered Inventory, or compiled edges.
    agent : Agent
        The adversary agent specification.
    n : int
        Number of simulation trials (default 100).
    seed : int
        Seed for deterministic reproducible pseudo-random execution.
    target : Optional[str]
        Target asset ID for the attack simulation.
    inventory : Optional[Inventory]
        Pre-computed inventory if twin is passed as the first argument.

    Returns
    -------
    Result
        Simulation results with trial records and aggregate metrics.
    """
    # Initialize local seeded RNG
    rng = random.Random(seed)

    # 1. Resolve Inventory (SEARCH RUNS ONCE BEFORE THE LOOP)
    resolved_inventory: Inventory
    twin_id: str
    resolved_target: Optional[str] = target

    if isinstance(twin_or_inventory, Inventory):
        resolved_inventory = twin_or_inventory
        twin_id = twin_or_inventory.agent_id or "inventory"
        resolved_target = target or twin_or_inventory.target
    elif isinstance(twin_or_inventory, (list, tuple)):
        compiled_edges = tuple(twin_or_inventory)
        twin_id = "compiled_edges"
        if inventory is not None:
            resolved_inventory = inventory
        else:
            resolved_inventory = search(compiled_edges, agent, target=resolved_target)
    else:
        twin: Twin
        if isinstance(twin_or_inventory, CyberDigitalTwin):
            twin = twin_or_inventory.twin
        else:
            twin = twin_or_inventory
        twin_id = twin.id

        if resolved_target is None:
            crown_jewels = [a.id for a in twin.assets if getattr(a, "crown_jewel", False)]
            if "prod-db" in crown_jewels:
                resolved_target = "prod-db"
            elif crown_jewels:
                resolved_target = crown_jewels[0]
            elif any(a.id == "prod-db" for a in twin.assets):
                resolved_target = "prod-db"
            else:
                resolved_target = None

        if inventory is not None:
            resolved_inventory = inventory
        else:
            compiled = compile_twin(twin)
            # Run state-space search ONCE
            resolved_inventory = search(compiled, agent, target=resolved_target, assets=twin)

    # 2. Route Policy: filter by noise, rank top-5, compute selection weights
    candidate_routes = evaluate_routes(resolved_inventory, agent, k=5)

    if not candidate_routes or n <= 0:
        return Result(
            twin_id=twin_id,
            agent_id=agent.id,
            target=resolved_target,
            n=n,
            seed=seed,
            candidate_routes=candidate_routes,
            trials=(),
            p_success=0.0,
            mean_effort=0.0,
            mean_noise=0.0,
            detection_rate=0.0,
        )

    # 3. Execute N simulation trials using local seeded RNG
    trials: List[TrialRecord] = []
    for trial_id in range(n):
        trial_record = execute_trial(trial_id, candidate_routes, agent, rng)
        trials.append(trial_record)

    trials_tuple = tuple(trials)
    success_count = sum(1 for t in trials_tuple if t.success)
    total_effort = sum(t.realized_effort for t in trials_tuple)
    total_noise = sum(t.realized_noise for t in trials_tuple)
    detected_count = sum(1 for t in trials_tuple if t.detected)

    return Result(
        twin_id=twin_id,
        agent_id=agent.id,
        target=resolved_target,
        n=n,
        seed=seed,
        candidate_routes=candidate_routes,
        trials=trials_tuple,
        p_success=success_count / n,
        mean_effort=total_effort / n,
        mean_noise=total_noise / n,
        detection_rate=detected_count / n,
    )
