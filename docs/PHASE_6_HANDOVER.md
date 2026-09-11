# Phase 6 Handover: Security Control Evaluation & Decision Engine

**Owner:** Person 2 (Track B — Rules & Decisions)  
**Status:** Completed & Validated (16/16 Phase 6 tests passing, 162/162 project tests passing)  
**Target Audience:** Person 2 & 4 (Phase 7 Optimizer), Person 4 (FastAPI API Integration), Person 3 (Frontend Dashboard)

---

## 1. Executive Summary & The Product Differentiator

Phase 6 implements the **Security Change Sandbox** decision engine. 

Standard attack-path discovery tools tell security teams that a control eliminates attack paths. Cloud policy analyzers tell infrastructure teams that a control breaks traffic. Neither joins both perspectives on the same model.

`evaluate_change()` joins:
1. **Security Risk Reduction** (Path count reduction % and adaptive attacker effort increase %)
2. **Business Flow Breakage** (Mission-critical operational dependencies severed by proposed policies)
3. **Statistical Confidence** (Wilson score intervals, sample trial power, and control efficacy)
4. **Actionable Governance** (Unambiguous `BLOCK`, `REVIEW`, or `DEPLOY` verdicts with explainability reasons and alternatives)

---

## 2. Directory Ownership & Modules

In accordance with `docs/GOVERNANCE.md`:
- **Owned Files:**
  - `backend/rules/evaluate.py` (Core Phase 6 evaluation engine)
  - `backend/rules/__init__.py` (Module exports)
  - `tests/test_evaluate.py` (16 test suites)
  - `verify_phase6.py` (Visual CLI demo script)
- **Untouched Frozen Contracts:**
  - `backend/core/models.py` (Zero changes, 100% compliant)
  - `backend/rules/techniques.yaml` (Zero changes, 100% compliant)

---

## 3. Public API & Import Reference

```python
from backend.rules.evaluate import (
    evaluate_change,
    detect_broken_flows,
    compute_confidence,
    ChangeVerdict,
    Confidence,
    FlowBreakageDetail,
    EXACT_MFA_SERVICE_IDENTITY_MSG,
)
```

### `evaluate_change(...)`
```python
def evaluate_change(
    twin: Twin,
    control_ids: Sequence[Union[Control, ControlImpact, str]] = (),
    agent_ids: Optional[Union[Agent, str, Sequence[Union[Agent, str]]]] = (),
    *,
    seed: int = 1,
    n: int = 1000,
    target: Optional[Union[Asset, str]] = None,
    catalog: Optional[Dict[str, TechniqueDefinition]] = None,
    baseline_twin: Optional[Twin] = None,
) -> ChangeVerdict:
```
- **Consumes:**
  - `twin`: Baseline or current digital twin snapshot.
  - `control_ids`: Canonical sequence of proposed `Control` objects, `ControlImpact` objects, or control ID strings (e.g. `["ctrl-network-seg"]`).
  - `agent_ids`: Target adversary profile (`Agent` instance, agent ID string, or sequence).
  - `seed`: Deterministic seed for 100% reproducible results (default: `1`).
  - `n`: Number of Monte Carlo walk simulation trials (default: `1000`).
  - `target`: Target asset ID or Asset instance (defaults to crown-jewel resolution, e.g. `'prod-db'`).
- **Produces:**
  - Immutable `ChangeVerdict` model.

### `detect_broken_flows(...)`
```python
def detect_broken_flows(
    twin: Twin,
    controls: Sequence[Union[Control, ControlImpact, str]],
    catalog: Optional[Dict[str, TechniqueDefinition]] = None,
) -> Tuple[tuple[ServiceFlow, ...], tuple[FlowBreakageDetail, ...]]:
```
Fast algebraic check intersecting controls (via `ControlImpact` selectors and exceptions) with projected `Channel` representations of `twin.flows`. Respects `ControlImpact.exceptions` to allow exempted flows (e.g. disaster recovery backups).

---

## 4. Data Contracts

### `Confidence` (Pydantic v2, Frozen, Immutable)

```python
class Confidence(BaseModel, frozen=True):
    level: Literal["High", "Medium", "Low"]
    score: float
    unknowns: tuple[str, ...] = ()
    undetermined: bool = False
```

### `ChangeVerdict` (Pydantic v2, Frozen, JSON-serializable)

```python
class ChangeVerdict(BaseModel, frozen=True):
    delta: Any                                # Comparative metrics (Delta)
    broken_flows: tuple[ServiceFlow, ...]     # Severed business flows
    cost: int                                 # Total control cost
    confidence: Confidence                    # Frozen decisive evidence confidence model
    unknowns: tuple[str, ...]                 # Known blind spots and decisive assumed unknowns
    undetermined: bool                        # True if ANY decisive element has assumed evidence
    recommendation: RecommendationType        # "DEPLOY" | "BLOCK" | "REVIEW"
    reasons: tuple[str, ...]                  # Plain-English decision justification
    alternatives: tuple[str, ...]             # Recommended safe alternatives

    # Supplementary fields
    twin_id: str = ""
    controls_applied: tuple[Control, ...] = ()
    before_result: Optional[Result] = None
    after_result: Optional[Result] = None
    before_path_count: int = 0
    after_path_count: int = 0
    broken_flow_details: tuple[FlowBreakageDetail, ...] = ()
    assumptions: tuple[str, ...] = ()
```

### `FlowBreakageDetail`

```python
class FlowBreakageDetail(BaseModel, frozen=True):
    flow_id: str                              # e.g. "F3"
    flow_name: str                            # e.g. "Payroll Transaction Ledger Commits"
    src: str                                  # Source asset / identity ID
    dst: str                                  # Destination asset ID
    technique: str                            # e.g. "db_login"
    criticality: int                          # 1 to 5
    broken_by_control_id: str                 # ID of control causing blockage
    broken_by_control_name: str               # Human-readable control name
    reason: str                               # Specific diagnostic message
```

---

## 5. Verdict Decision Logic & Rules

| Condition | Verdict | Justification |
|---|---|---|
| Broken flow with $\text{criticality} \ge 4$ | **`BLOCK`** | Proposed control breaks a mission-critical business flow. Hard stop. |
| Broken flow with $\text{criticality} < 4$ | **`REVIEW`** | Operational impact on non-critical service flows requires CAB sign-off. |
| Decisive evidence is assumed (`undetermined == True`) | **`REVIEW`** | Outcome cannot be determined safely due to assumed decisive provenance. |
| Statistical confidence is `Low` ($< 0.60$) | **`REVIEW`** | Low evidence weight across decisive path or flow transitions. |
| Zero paths discovered in baseline | **`REVIEW`** | Undetermined or unroutable baseline state. |
| Negligible security gain (`effort_increase_pct is not None and < 5` AND `p_success_delta > -0.02`) | **`REVIEW`** | Change imposes financial cost with minimal or zero tangible security benefit. |
| Zero broken flows AND validated security gain | **`DEPLOY`** | Safe to deploy immediately. |

---

## 6. Non-Negotiable Phrasing & Terminology Rules

1. **Service Identity MFA Wording (STRICT v2.1 REQUIREMENT):**
   - **MUST USE:** `"this interactive MFA policy is incompatible with these non-interactive service identities"`
   - **DO NOT USE:** `"service accounts cannot MFA."`
2. **Effort Metric Definition:**
   - `effort_increase_pct` = Increase in modeled attacker-effort score ($\sum \frac{\text{cost}}{p}$).
   - It is **NOT** financial cost or business labor cost.

---

## 7. Downstream Handover Guides

### 7.1 For Person 2 & 4 — Phase 7 (Control Optimizer)

The optimizer must select the optimal subset of candidate controls subject to:
1. **Budget constraint:** $\sum c.\text{cost} \le \text{Budget}$
2. **Operational constraint:** Never break a flow with $\text{criticality} \ge 4$.
3. **Search Space:** $\le 10$ controls $\implies \le 1024$ subsets ($2^{10}$).

**Recommended Integration Pattern in `backend/rules/optimize.py`:**
```python
from backend.rules.evaluate import detect_broken_flows, evaluate_change

def optimize_controls(twin, candidate_controls, budget):
    valid_subsets = []
    for subset in all_subsets(candidate_controls):
        if sum(c.cost for c in subset) > budget:
            continue
        # Fast filter without running simulation:
        broken_flows, _ = detect_broken_flows(twin, subset)
        if any(f.criticality >= 4 for f in broken_flows):
            continue  # Hard-pruned!
        valid_subsets.append(subset)

    # Evaluate risk reduction and pick the winner
    # Run full Monte Carlo walk ONLY for the winning subset!
    winner = pick_highest_impact(valid_subsets)
    verdict = evaluate_change(twin, winner)
    return verdict
```

### 7.2 For Person 4 — Phase 10 (FastAPI Endpoints)

Implement the endpoint according to `docs/INTERFACES.md`:
- **Route:** `POST /evaluate-change`
- **Request Body:**
  ```json
  {
    "twin_id": "twin-finbank-golden",
    "control_ids": ["ctrl-network-seg"],
    "agent_id": "adv-admin",
    "n_walks": 1000,
    "seed": 42
  }
  ```
- **Response:**
  Simply call `verdict.model_dump()` from `evaluate_change()`. All fields, including computed `@computed_field` properties (`verdict`, `cost`, `delta`, `confidence_score`), serialize cleanly.

### 7.3 For Person 3 — Phase 11 (Frontend Hero Dashboard)

The frontend **Decision Card** maps directly to `ChangeVerdict`:
- **Verdict Badge:** `verdict.verdict` (`"BLOCK"`: Red, `"REVIEW"`: Amber, `"DEPLOY"`: Green)
- **Risk & Effort Metrics:**
  - Risk Reduction: `verdict.delta.naive_path_reduction_pct` %
  - Attacker Effort Increase: `verdict.delta.effort_increase_pct` %
- **Operational Impact Alert:**
  - If `len(verdict.broken_flows) > 0`, display warning with `verdict.broken_flow_details[0].reason` and flow name.
- **Alternatives Panel:**
  - Render bullet list from `verdict.alternatives`.

---

## 8. Test Verification Run Sheet

To verify Phase 6 at any time:

```bash
# 1. Run the dedicated Phase 6 evaluation test suite (16 tests):
pytest tests/test_evaluate.py -v

# 2. Run the visual FinBank demo script:
python verify_phase6.py

# 3. Run the full repository regression suite (162 tests):
pytest
```