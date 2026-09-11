import { Twin, SimulateResponse, ChangeVerdict, OptimizationResult, BlastRadiusResponse } from '../types/api';

const API_BASE = '/api';

export const apiClient = {
  async getTwin(twinId?: string): Promise<Twin> {
    try {
      const url = twinId ? `${API_BASE}/twin/${encodeURIComponent(twinId)}` : `${API_BASE}/twin`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Falling back to local golden twin fixture:', e);
      return getFallbackTwin();
    }
  },

  async listTwins(): Promise<Array<{ id: string; asset_count: number; edge_count: number; flow_count: number }>> {
    try {
      const res = await fetch(`${API_BASE}/twins`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (e) {
      return [];
    }
  },

  async simulate(params: {
    twin_id?: string;
    agent_id?: string;
    seed?: number;
    n_walks?: number;
    control_ids?: string[];
  }): Promise<SimulateResponse> {
    try {
      const payload = {
        twin_id: params.twin_id || 'twin-finbank-golden',
        agent_id: params.agent_id || 'adv-admin',
        seed: params.seed ?? 42,
        n: params.n_walks ?? 200,
        n_walks: params.n_walks ?? 200,
        control_ids: params.control_ids || [],
      };
      const res = await fetch(`${API_BASE}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Falling back to local simulate mock:', e);
      return getFallbackSimulate(params.control_ids || []);
    }
  },

  async evaluateChange(params: {
    twin_id?: string;
    control_ids: string[];
    agent_id?: string;
    seed?: number;
    n_walks?: number;
  }): Promise<ChangeVerdict> {
    try {
      const payload = {
        twin_id: params.twin_id || 'twin-finbank-golden',
        control_ids: params.control_ids,
        agent_ids: params.agent_id ? [params.agent_id] : [],
        seed: params.seed ?? 42,
        n: params.n_walks ?? 200,
      };
      const res = await fetch(`${API_BASE}/evaluate-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Falling back to local evaluate change mock:', e);
      return getFallbackVerdict(params.control_ids);
    }
  },

  async optimize(params: {
    twin_id?: string;
    budget: number;
    max_broken_criticality?: number;
    seed?: number;
    n_walks?: number;
  }): Promise<OptimizationResult> {
    try {
      const res = await fetch(`${API_BASE}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Falling back to local optimizer mock:', e);
      return getFallbackOptimization(params.budget);
    }
  },

  async getBlastRadius(assetId: string): Promise<BlastRadiusResponse> {
    try {
      const res = await fetch(`${API_BASE}/blast-radius/${assetId}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Falling back to local blast radius mock:', e);
      return getFallbackBlastRadius(assetId);
    }
  },

  async importTwinJson(file: File): Promise<{ ok: boolean; data?: any; error?: string; errors?: string[] }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/twin/import/json`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.message || 'JSON Import failed', errors: data.errors || [] };
      }
      return { ok: true, data };
    } catch (e: any) {
      return { ok: false, error: e.message || 'Failed to communicate with import API' };
    }
  },

  async importTwinCsv(file: File, twinId?: string): Promise<{ ok: boolean; data?: any; error?: string; errors?: string[] }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const url = twinId ? `${API_BASE}/twin/import/csv?twin_id=${encodeURIComponent(twinId)}` : `${API_BASE}/twin/import/csv`;
      const res = await fetch(url, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.message || 'CSV Import failed', errors: data.errors || [] };
      }
      return { ok: true, data };
    } catch (e: any) {
      return { ok: false, error: e.message || 'Failed to communicate with import API' };
    }
  },

  getExportJsonUrl(twinId: string): string {
    return `${API_BASE}/twin/${twinId}/export/json`;
  },

  getExportCsvUrl(twinId: string): string {
    return `${API_BASE}/twin/${twinId}/export/csv`;
  },
};


// -----------------------------------------------------------------------------
// Fallback Mocks
// -----------------------------------------------------------------------------

function getFallbackTwin(): Twin {
  return {
    id: "twin-finbank-golden",
    assets: [
      { id: "internet", name: "Public Internet Gateway", kind: "server", zone: "dmz", criticality: 1, crown_jewel: false },
      { id: "web-dmz", name: "Online Banking Web Portal", kind: "server", zone: "dmz", criticality: 3, crown_jewel: false },
      { id: "ws-dev", name: "Developer Workstation", kind: "workstation", zone: "corp", criticality: 2, crown_jewel: false },
      { id: "ws-hr", name: "HR Operations Laptop", kind: "workstation", zone: "corp", criticality: 2, crown_jewel: false },
      { id: "fileshare", name: "Corporate File Repository", kind: "share", zone: "corp", criticality: 3, crown_jewel: false },
      { id: "ci-runner", name: "Internal CI Build Agent", kind: "server", zone: "corp", criticality: 3, crown_jewel: false },
      { id: "jump-01", name: "Privileged Admin Jumpbox", kind: "server", zone: "mgmt", criticality: 4, crown_jewel: false },
      { id: "payroll-api", name: "SWIFT Payment Clearing Microservice", kind: "server", zone: "prod", criticality: 4, crown_jewel: false },
      { id: "backup-01", name: "Disaster Recovery Storage Vault", kind: "server", zone: "mgmt", criticality: 4, crown_jewel: true },
      { id: "prod-db", name: "Core Banking Ledger Database", kind: "database", zone: "prod", criticality: 5, crown_jewel: true },
    ],
    identities: [
      { id: "id-user-customer", name: "Retail Customer", kind: "user", tier: 3 },
      { id: "id-user-analyst", name: "Ops Analyst", kind: "user", tier: 2 },
      { id: "id-user-admin", name: "Lead Cloud Infrastructure Admin", kind: "admin", tier: 0 },
      { id: "id-svc-payroll", name: "Core Payment Service Identity", kind: "service_account", tier: 1 },
    ],
    edges: [
      { src: "internet", dst: "web-dmz", technique: "exploit_public_app" },
      { src: "web-dmz", dst: "payroll-api", technique: "db_login" },
      { src: "payroll-api", dst: "prod-db", technique: "db_login" },
      { src: "ws-dev", dst: "ci-runner", technique: "ssh_lateral" },
      { src: "ci-runner", dst: "jump-01", technique: "ssh_lateral" },
      { src: "jump-01", dst: "prod-db", technique: "rdp_lateral" },
      { src: "jump-01", dst: "backup-01", technique: "ssh_lateral" },
      { src: "ws-hr", dst: "fileshare", technique: "smb_lateral" },
    ],
    flows: [
      { id: "F1", name: "Customer Web Banking Traffic", src: "internet", dst: "web-dmz", technique: "exploit_public_app", criticality: 3 },
      { id: "F2", name: "Portal Token Verification API", src: "web-dmz", dst: "payroll-api", technique: "db_login", criticality: 4 },
      { id: "F3", name: "Payroll Transaction Ledger Commits", src: "payroll-api", dst: "prod-db", technique: "db_login", criticality: 5 },
      { id: "F4", name: "Developer CI Build Artifact Push", src: "ws-dev", dst: "ci-runner", technique: "ssh_lateral", criticality: 3 },
      { id: "F5", name: "HR Document Archival Sync", src: "ws-hr", dst: "fileshare", technique: "smb_lateral", criticality: 3 },
      { id: "F6", name: "Nightly Cloud Disaster Recovery Backup", src: "jump-01", dst: "backup-01", technique: "ssh_lateral", criticality: 4 },
    ],
    controls: [
      { id: "ctrl-network-seg", name: "Core Banking Subnet Segmentation", cost: 2500, blocks: ["db_login", "ssh_lateral"], scope: ["prod-db", "backup-01"], efficacy: 0.95 },
      { id: "ctrl-mfa", name: "Privileged Access Multi-Factor Authentication", cost: 1500, blocks: ["ssh_lateral", "rdp_lateral"], scope: ["jump-01", "payroll-api"], efficacy: 0.85 },
      { id: "ctrl-edr", name: "Host Endpoint Detection and Response", cost: 2000, blocks: ["exploit_public_app", "cred_dump"], scope: ["ws-dev", "ws-hr", "ci-runner"], efficacy: 0.80 },
      { id: "ctrl-credguard", name: "Windows Credential Guard Protection", cost: 1000, blocks: ["cred_dump", "creds_in_files"], scope: ["ws-dev", "jump-01"], efficacy: 0.90 },
    ],
  };
}

function getFallbackSimulate(controlIds: string[]): SimulateResponse {
  const hasSeg = controlIds.includes('ctrl-network-seg');
  const hasMfa = controlIds.includes('ctrl-mfa');

  if (hasSeg) {
    return {
      twin_id: "twin-finbank-golden",
      agent_id: "adv-admin",
      p_success: 0.08,
      mean_effort: 24.5,
      p90_effort: 32.0,
      compromised_nodes: ["ws-dev", "ci-runner", "jump-01"],
      attack_trajectory: [
        { step_index: 1, asset_id: "ws-dev", asset_name: "Developer Workstation", zone: "corp", technique: "phish", status: "compromised", cost: 2, noise: 0.1 },
        { step_index: 2, asset_id: "ci-runner", asset_name: "Internal CI Build Agent", zone: "corp", technique: "ssh_lateral", status: "compromised", cost: 4, noise: 0.25 },
        { step_index: 3, asset_id: "jump-01", asset_name: "Privileged Admin Jumpbox", zone: "mgmt", technique: "ssh_lateral", status: "compromised", cost: 6, noise: 0.4 },
        { step_index: 4, asset_id: "prod-db", asset_name: "Core Banking Ledger Database", zone: "prod", technique: "db_login", status: "blocked", cost: 10, noise: 0.8 },
      ],
      choke_points: { "ci-runner->jump-01": 0.85, "jump-01->prod-db": 0.12 },
      exemplar_paths: [["ws-dev", "ci-runner", "jump-01", "prod-db"]],
    };
  }

  return {
    twin_id: "twin-finbank-golden",
    agent_id: "adv-admin",
    p_success: 0.82,
    mean_effort: 7.2,
    p90_effort: 11.0,
    compromised_nodes: ["ws-dev", "ci-runner", "jump-01", "prod-db"],
    attack_trajectory: [
      { step_index: 1, asset_id: "ws-dev", asset_name: "Developer Workstation", zone: "corp", technique: "phish", status: "compromised", cost: 2, noise: 0.1 },
      { step_index: 2, asset_id: "ci-runner", asset_name: "Internal CI Build Agent", zone: "corp", technique: "ssh_lateral", status: "compromised", cost: 4, noise: 0.25 },
      { step_index: 3, asset_id: "jump-01", asset_name: "Privileged Admin Jumpbox", zone: "mgmt", technique: "ssh_lateral", status: "compromised", cost: 6, noise: 0.4 },
      { step_index: 4, asset_id: "prod-db", asset_name: "Core Banking Ledger Database", zone: "prod", technique: "rdp_lateral", status: "compromised", cost: 9, noise: 0.65 },
    ],
    choke_points: { "ci-runner->jump-01": 0.85, "jump-01->prod-db": 0.82 },
    exemplar_paths: [["ws-dev", "ci-runner", "jump-01", "prod-db"]],
  };
}

function getFallbackVerdict(controlIds: string[]): ChangeVerdict {
  const twin = getFallbackTwin();
  const hasSeg = controlIds.includes('ctrl-network-seg');
  const hasMfa = controlIds.includes('ctrl-mfa');
  const hasEdr = controlIds.includes('ctrl-edr');

  if (hasSeg) {
    const brokenF3 = twin.flows.find(f => f.id === 'F3')!;
    return {
      recommendation: "BLOCK",
      verdict: "BLOCK",
      cost: 2500,
      delta: {
        naive_path_reduction_pct: 80.0,
        effort_increase_pct: 185.0,
        p_success_delta: -0.74,
        route_eliminated: ["route-corp-db-direct"],
        substituted_paths: ["route-via-jumpbox-mgmt"],
      },
      broken_flows: [brokenF3],
      broken_flow_details: [{
        flow_id: "F3",
        flow_name: "Payroll Transaction Ledger Commits",
        criticality: 5,
        src: "payroll-api",
        dst: "prod-db",
        broken_by_control: "ctrl-network-seg",
        reason: "Network segmentation blocks direct TCP:5432 ledger updates between Application and Data Secure zones.",
      }],
      confidence: {
        level: "High",
        score: 0.94,
        unknowns: [],
        undetermined: false,
      },
      unknowns: [],
      undetermined: false,
      reasons: [
        "CAB BLOCKED: Proposed Network Segmentation severs mission-critical flow F3 (Payroll Transaction Ledger Commits, Criticality 5). Operational banking transactions will fail.",
      ],
      alternatives: [
        "Deploy application-aware microsegmentation with an explicit scoped exception for service account id-svc-payroll on port 5432.",
        "Consider defense-in-depth: Host EDR on workstations + Privileged MFA on Bastion Jumpbox (0 broken flows).",
      ],
    };
  }

  if (hasMfa && !hasSeg && !hasEdr) {
    const brokenF2 = twin.flows.find(f => f.id === 'F2')!;
    return {
      recommendation: "BLOCK",
      verdict: "BLOCK",
      cost: 1500,
      delta: {
        naive_path_reduction_pct: 50.0,
        effort_increase_pct: 65.0,
        p_success_delta: -0.42,
        route_eliminated: ["route-jumpbox-direct"],
        substituted_paths: [],
      },
      broken_flows: [brokenF2],
      broken_flow_details: [{
        flow_id: "F2",
        flow_name: "Portal Token Verification API",
        criticality: 4,
        src: "web-dmz",
        dst: "payroll-api",
        broken_by_control: "ctrl-mfa",
        reason: "this interactive MFA policy is incompatible with these non-interactive service identities",
      }],
      confidence: {
        level: "High",
        score: 0.91,
        unknowns: [],
        undetermined: false,
      },
      unknowns: [],
      undetermined: false,
      reasons: [
        "CAB BLOCKED: this interactive MFA policy is incompatible with these non-interactive service identities (Flow F2, Criticality 4).",
      ],
      alternatives: [
        "Exclude automated backend service principals from interactive TOTP/FIDO2 MFA policies and enforce mTLS certificate binding instead.",
      ],
    };
  }

  return {
    recommendation: "DEPLOY",
    verdict: "DEPLOY",
    cost: 3000,
    delta: {
      naive_path_reduction_pct: 66.7,
      effort_increase_pct: 120.0,
      p_success_delta: -0.65,
      route_eliminated: ["route-ws-ci-pivot"],
      substituted_paths: [],
    },
    broken_flows: [],
    broken_flow_details: [],
    confidence: {
      level: "High",
      score: 0.95,
      unknowns: [],
      undetermined: false,
    },
    unknowns: [],
    undetermined: false,
    reasons: [
      "CAB APPROVED: Proposed controls achieve 66.7% attack path reduction and 120% attacker effort increase with ZERO severed business flows.",
    ],
    alternatives: [
      "No alternatives required. Change meets all Change Advisory Board safety requirements.",
    ],
  };
}

function getFallbackOptimization(budget: number): OptimizationResult {
  return {
    budget,
    max_broken_criticality: 3,
    candidate_count: 4,
    subsets_evaluated: 15,
    constrained_portfolio: {
      control_ids: ["ctrl-mfa", "ctrl-edr", "ctrl-credguard"],
      control_names: ["Privileged Access MFA", "Host EDR", "Windows Credential Guard"],
      total_cost: 4500,
      budget,
      broken_flows: [],
      is_safe: true,
      risk_reduction_pct: 75.0,
      effort_increase_pct: 140.0,
      recommendation: "DEPLOY",
      rationale: "Maximizes risk reduction ($4,500 total cost) with zero severed business service flows.",
    },
    naive_portfolio: {
      control_ids: ["ctrl-network-seg"],
      control_names: ["Core Banking Subnet Segmentation"],
      total_cost: 2500,
      budget,
      broken_flows: [
        { id: "F3", name: "Payroll Transaction Ledger Commits", src: "payroll-api", dst: "prod-db", technique: "db_login", criticality: 5 }
      ],
      is_safe: false,
      risk_reduction_pct: 80.0,
      effort_increase_pct: 185.0,
      recommendation: "BLOCK",
      rationale: "Selects coarse segmentation for raw path count reduction, but severs F3 Payroll Commits (Crit 5).",
    },
    contrast_summary: `The Naive Portfolio recommends Core Banking Subnet Segmentation achieving 80.0% path reduction, but causes an operational outage by severing F3 Payroll Commits (Crit 5). Verdict: BLOCK.\nThe Constrained Portfolio recommends Privileged Access MFA, Host EDR, Windows Credential Guard achieving 75.0% path reduction while strictly preserving all mission-critical operational flows. Verdict: DEPLOY.`,
  };
}

function getFallbackBlastRadius(assetId: string): BlastRadiusResponse {
  if (assetId === 'jump-01') {
    return {
      source_asset_id: "jump-01",
      source_asset_name: "Privileged Admin Jumpbox",
      source_criticality: 4,
      reachable_asset_ids: ["prod-db", "backup-01"],
      compromised_crown_jewels: ["prod-db", "backup-01"],
      total_downstream_criticality: 9,
      direct_dependencies: ["prod-db", "backup-01"],
    };
  }
  return {
    source_asset_id: assetId,
    source_asset_name: assetId,
    source_criticality: 3,
    reachable_asset_ids: ["ci-runner", "jump-01", "prod-db"],
    compromised_crown_jewels: ["prod-db"],
    total_downstream_criticality: 12,
    direct_dependencies: ["ci-runner"],
  };
}
