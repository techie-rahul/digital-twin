# Digital Twin Data Exchange Guide: JSON & CSV (v2.1)

This guide documents the Import, Export, and Validation specification for the FinBank Cyber Digital Twin and Change Advisory Sandbox.

---

## 1. System Overview

The Data Exchange subsystem allows security engineers, IT operations teams, and auditors to:
1. **Export** any live or cloned Digital Twin snapshot as a deterministic canonical JSON document or a relational multi-table CSV bundle (ZIP).
2. **Import** external or customer network architectures into the Digital Twin sandbox.
3. **Perform deep semantic validation** (duplicate ID detection, dangling reference checking, boundary validation) before loading into active memory.
4. **Immediately execute** the full simulation pipeline (`/simulate`, `/evaluate-change`, `/optimize`, `/blast-radius`) on the newly imported network.

---

## 2. Canonical JSON Specification

JSON is the primary hierarchical serialization format.

### Schema Structure:
```json
{
  "schema_version": "2.1",
  "id": "twin-finbank-golden",
  "parent_id": null,
  "assets": [
    {
      "id": "prod-db",
      "name": "Core Production Database",
      "kind": "database",
      "zone": "prod",
      "criticality": 5,
      "crown_jewel": true
    }
  ],
  "identities": [
    {
      "id": "id-user-admin",
      "name": "Cloud Infrastructure Administrator",
      "kind": "admin",
      "tier": 0
    }
  ],
  "edges": [
    {
      "src": "jump-01",
      "dst": "prod-db",
      "technique": "rdp_lateral"
    }
  ],
  "flows": [
    {
      "id": "F3",
      "name": "Payroll Transaction Ledger Commits",
      "src": "payroll-api",
      "dst": "prod-db",
      "technique": "db_login",
      "criticality": 5
    }
  ],
  "controls": [
    {
      "id": "ctrl-mfa",
      "name": "Privileged Access Multi-Factor Authentication",
      "cost": 1500,
      "blocks": ["mfa", "rdp_lateral"],
      "scope": ["jump-01"],
      "efficacy": 0.95
    }
  ]
}
```

### Entity Requirements:
* **Assets**:
  * `id`: String (unique across all assets and identities).
  * `kind`: `"server"` | `"workstation"` | `"database"` | `"cloud_role"` | `"share"`.
  * `zone`: String (`"dmz"`, `"corp"`, `"prod"`, `"mgmt"`, etc.).
  * `criticality`: Integer between `1` and `5`.
  * `crown_jewel`: Boolean (`true` or `false`).
* **Identities**:
  * `id`: String (unique).
  * `kind`: `"user"` | `"admin"` | `"service_account"` | `"cloud_role"`.
  * `tier`: Integer (`0`=domain admin, `1`=service account, `2`=analyst, `3`=customer).
* **Edges**:
  * `src`: Asset or Identity ID (must exist in `assets` or `identities`).
  * `dst`: Asset or Identity ID (must exist in `assets` or `identities`).
  * `technique`: MITRE ATT&CK technique name (e.g., `ssh_lateral`, `db_login`, `smb_lateral`).
* **Service Flows**:
  * `id`: Unique flow identifier (`F1`, `F2`, etc.).
  * `src`, `dst`: Must reference valid Asset IDs.
  * `criticality`: Integer `1`–`5` (Flows with criticality $\ge 4$ trigger hard CAB blocks if severed).
* **Controls**:
  * `id`: Unique control identifier (`ctrl-mfa`, `ctrl-edr`, etc.).
  * `cost`: Non-negative integer dollar budget.
  * `blocks`: List of technique strings blocked or mitigated.
  * `scope`: List of asset/identity IDs where the control is deployed.
  * `efficacy`: Float between `0.0` and `1.0`.

---

## 3. CSV Multi-Table Specification

Because relational graphs are best represented across separate tables, CSV export and import utilizes a 5-table schema packaged in a ZIP archive or processed individually.

### 1. `assets.csv`
```csv
id,name,kind,zone,criticality,crown_jewel
internet,External Internet Gateway,server,dmz,1,false
web-dmz,Online Banking Web DMZ,server,dmz,3,false
prod-db,Core Production Database,database,prod,5,true
```

### 2. `identities.csv`
```csv
id,name,kind,tier
id-user-customer,Retail Banking Customer,user,3
id-user-admin,Cloud Infrastructure Administrator,admin,0
```

### 3. `edges.csv`
```csv
src,dst,technique
internet,web-dmz,exploit_public_app
web-dmz,jump-01,ssh_lateral
jump-01,prod-db,rdp_lateral
```

### 4. `flows.csv`
```csv
id,name,src,dst,technique,criticality
F1,Customer Web Banking Traffic,internet,web-dmz,exploit_public_app,3
F3,Payroll Transaction Ledger Commits,payroll-api,prod-db,db_login,5
```

### 5. `controls.csv`
Multi-valued fields (`blocks` and `scope`) use semicolons (`;`) as delimiters within the cell.
```csv
id,name,cost,blocks,scope,efficacy
ctrl-mfa,Privileged Access Multi-Factor Authentication,1500,mfa;rdp_lateral,jump-01,0.95
ctrl-edr,Endpoint Detection & Response Sensor Agent,2000,cred_dump;rdp_lateral;ssh_lateral,ci-runner;jump-01;payroll-api;ws-dev;ws-hr,0.85
```

---

## 4. Validation Rules & Error Diagnostics

When a file is uploaded, the parser does not fail silently. It aggregates all structural and relational inconsistencies:

1. **Duplicate Asset / Identity / Flow / Control IDs**:
   `"Duplicate asset ID found: 'prod-db'"`
2. **ID Namespace Collisions**:
   `"Collision: entity ID 'admin-node' exists in both assets and identities."`
3. **Dangling Edge References**:
   `"Edge #14 (ws-dev -> unknown-db) references unknown target 'unknown-db'."`
4. **Dangling Service Flow References**:
   `"Service flow 'F2' references unknown source asset 'billing-api'."`
5. **Dangling Control Scope References**:
   `"Control 'ctrl-waf' scope references unknown target 'legacy-proxy'."`
6. **Range Violations**:
   `"Asset 'db-01' criticality must be between 1 and 5, got 99."`
   `"Control 'ctrl-edr' efficacy must be between 0.0 and 1.0, got 1.5."`

---

## 5. REST API Endpoints

### 1. `POST /twin/import/json`
* **Request**: Upload JSON file (`multipart/form-data`) or raw JSON string (`application/json`).
* **Success (200)**:
  ```json
  {
    "status": "success",
    "message": "Digital Twin 'twin-custom' imported and validated successfully.",
    "twin_id": "twin-custom",
    "parent_id": null,
    "hash": "8a3f9e...",
    "asset_count": 10,
    "identity_count": 4,
    "edge_count": 16,
    "flow_count": 6,
    "control_count": 4
  }
  ```
* **Failure (400)**:
  ```json
  {
    "status": "error",
    "message": "Twin semantic validation failed with 1 error(s)",
    "errors": [
      "Edge #12 (jump-01 -> ghost-host) references unknown target 'ghost-host'."
    ]
  }
  ```

### 2. `POST /twin/import/csv`
* **Request**: Upload ZIP archive containing CSV files (`multipart/form-data`).
* **Optional Query Param**: `?twin_id=custom-id`.
* **Responses**: Identical to JSON import.

### 3. `GET /twin/{twin_id}/export/json`
* **Response**: Downloadable `.json` file attachment.

### 4. `GET /twin/{twin_id}/export/csv`
* **Response**: Downloadable `.zip` archive containing the 5 canonical CSV tables.

---

## 6. Security Guarantees

* **File Size Caps**: Uploads are restricted to 10 MB maximum to guard against denial-of-service.
* **Safe Parsing**: Uses Python `json.loads` and standard `csv.reader`. **No** `eval()`, `pickle`, or unsafe object deserialization.
* **Path Traversal Shield**: ZIP filenames are stripped of directories (`name.split('/')[-1]`) to prevent path traversal when extracting.
* **In-Memory Operation**: All parsing happens in RAM; untrusted files are never written to the server's disk root.
