# API Interface Contracts — FinBank Cyber Digital Twin v2.1

Base URL (local): `http://localhost:8000`  
Frontend dev server: `http://localhost:5173`  
Swagger / OpenAPI: `http://localhost:8000/docs`

---

## Endpoints

### `GET /`
Health check.

**Response**
```json
{
  "status": "ok",
  "golden_twin_id": "twin-finbank-golden",
  "golden_hash": "a3f1...",
  "cache_size": 0
}
```

---

### `GET /twin/{id}`
Retrieve a full serialised Twin (assets, identities, edges, flows, controls).

**Path param**: `id` — Twin ID (e.g. `twin-finbank-golden`)

**Response**
```json
{
  "id": "twin-finbank-golden",
  "parent_id": null,
  "hash": "a3f1c7...",
  "asset_count": 10,
  "identity_count": 4,
  "edge_count": 16,
  "flow_count": 6,
  "control_count": 4,
  "assets": [...],
  "identities": [...],
  "edges": [...],
  "flows": [...],
  "controls": [...]
}
```

**Errors**: `404` if twin_id not found.

---

### `POST /twin/{id}/clone`
Clone a Twin with control mutations. The cloned Twin is registered in the session registry.

**Request body**
```json
{
  "control_ids_to_add": ["ctrl-mfa"],
  "control_ids_to_remove": [],
  "new_id": "twin-with-mfa"
}
```

**Response**
```json
{
  "original_id": "twin-finbank-golden",
  "cloned_id": "twin-with-mfa",
  "parent_id": "twin-finbank-golden",
  "hash": "b4d2...",
  "asset_count": 10,
  "edge_count": 16,
  "control_count": 5
}
```

**Errors**: `404` unknown twin, `400` unknown control ID.

---

### `POST /simulate`
Run plan-then-execute adversary simulation. Results are cached by `(twin_hash, agent_id, seed, n)`.

**Request body**
```json
{
  "twin_id": "twin-finbank-golden",
  "agent_id": "agent-external",
  "n": 100,
  "seed": 42,
  "target": "prod-db"
}
```

**Available agents** (registered at startup):
| ID | Name | Start Zone | Capabilities |
|---|---|---|---|
| `agent-external` | External Threat Actor | `dmz` | none |
| `agent-insider` | Malicious Insider | `corp` | `creds:id-user-admin` |

**Response**
```json
{
  "twin_id": "twin-finbank-golden",
  "agent_id": "agent-external",
  "target": "prod-db",
  "n": 100,
  "seed": 42,
  "p_success": 0.62,
  "mean_effort": 14.3,
  "mean_noise": 0.45,
  "detection_rate": 0.11,
  "success_count": 62,
  "failure_count": 38,
  "candidate_routes": [
    {
      "route_id": "route-abc123",
      "nodes": ["internet", "web-dmz", "payroll-api", "prod-db"],
      "p_route": 0.48,
      "effort_score": 12.1,
      "noise": 0.3,
      "utility": 0.6,
      "selection_prob": 0.72
    }
  ],
  "cached": false
}
```

**Errors**: `404` unknown twin or agent, `422` invalid request (e.g. `n < 1`).

---

### `POST /evaluate-change` ⭐ (centrepiece)
Propose security controls and receive a `ChangeVerdict`.

**CURRENT STATUS**: Stubbed (returns schema-correct mock). Wire to `backend.rules.evaluate` when Person 2 delivers.

**Request body**
```json
{
  "twin_id": "twin-finbank-golden",
  "control_ids": ["ctrl-mfa"],
  "agent_ids": ["agent-external"],
  "seed": 42,
  "n": 100
}
```

**Response**
```json
{
  "twin_id": "twin-finbank-golden",
  "control_ids": ["ctrl-mfa"],
  "verdict": "REVIEW",
  "confidence": {
    "level": "Medium",
    "score": 0.72,
    "unknowns": [...],
    "undetermined": false
  },
  "broken_flows": [
    {
      "flow_id": "F2",
      "flow_name": "Web Portal API Integration",
      "reason": "this interactive MFA policy is incompatible with these non-interactive service identities"
    }
  ],
  "delta": {
    "naive_path_reduction_pct": 58.3,
    "effort_increase_pct": 142.0,
    "route_eliminated": false,
    "p_success_delta": -0.34,
    "substituted_paths": 2
  },
  "recommendation": "...",
  "alternatives": [...]
}
```

**Verdict values**: `"BLOCK"` | `"REVIEW"` | `"DEPLOY"`

> **Terminology rule**: `broken_flows[].reason` must use  
> *"this interactive MFA policy is incompatible with these non-interactive service identities"*  
> NOT "service accounts cannot MFA."

---

### `POST /optimize`
Return optimal control portfolio under a budget constraint.

**CURRENT STATUS**: Stubbed. Wire to Phase 7 optimizer.

**Request body**
```json
{
  "twin_id": "twin-finbank-golden",
  "budget": 5000,
  "agent_ids": ["agent-external"],
  "seed": 42
}
```

**Response**
```json
{
  "twin_id": "twin-finbank-golden",
  "budget": 5000,
  "optimal_portfolio": {
    "control_ids": ["ctrl-network-seg", "ctrl-mfa"],
    "total_cost": 4000,
    "naive_path_reduction_pct": 83.3,
    "verdict": "DEPLOY"
  },
  "naive_top_n": [...],
  "alternatives": [...]
}
```

---

### `GET /matrix/{twin_id}`
Return a controls × agents risk-reduction matrix.

**CURRENT STATUS**: Stubbed.

**Response**
```json
{
  "twin_id": "twin-finbank-golden",
  "controls": ["ctrl-mfa", "ctrl-network-seg", "ctrl-edr", "ctrl-credguard"],
  "agents": ["agent-external", "agent-insider"],
  "matrix": [[0.58, 0.67, 0.25, 0.15], [0.72, 0.80, 0.30, 0.20]],
  "units": "naive_path_reduction_pct"
}
```

---

### `GET /blast-radius/{asset_id}`
Compute all nodes reachable from `asset_id` if compromised.

**Query param**: `twin_id` (default: `twin-finbank-golden`)

**Response**
```json
{
  "twin_id": "twin-finbank-golden",
  "asset_id": "payroll-api",
  "reachable": ["prod-db"],
  "reachable_count": 1,
  "crown_jewels_reachable": ["prod-db"]
}
```

**Errors**: `404` if asset not found.

---

### `GET /lineage/{twin_id}`
Walk parent_id chain from a Twin back to the root.

**Response**
```json
{
  "twin_id": "twin-with-mfa",
  "lineage": [
    {"twin_id": "twin-with-mfa", "parent_id": "twin-finbank-golden", "hash": "b4d2..."},
    {"twin_id": "twin-finbank-golden", "parent_id": null, "hash": "a3f1..."}
  ]
}
```

---

## Session Registry

Twins are registered on startup (golden) and on every `POST /twin/{id}/clone` call. The registry is in-process memory and resets on server restart. This is intentional for the hackathon demo — no database needed.

## Cache

Simulation results are cached in-process LRU with max 256 entries, keyed by `(twin_hash, agent_id, seed, n)`. Repeated identical requests return immediately with `"cached": true`.
