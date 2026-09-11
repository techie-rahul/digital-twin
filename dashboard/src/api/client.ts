import {
  Twin,
  Asset,
  Edge,
  ServiceFlow,
  Control,
  Identity,
  SimulateResponse,
  ChangeVerdict,
  OptimizationResult,
  BlastRadiusResponse,
  CrawlAuditRequest,
  CrawlAuditResult,
  LineageOut,
} from '../types/api';
import { BENCHMARK_FALLBACK_TWINS } from '../data/benchmarkFallbacks';

const API_BASE = '/api';

export const apiClient = {
  async getTwin(twinId?: string): Promise<Twin> {
    try {
      const url = twinId ? `${API_BASE}/twin/${twinId}` : `${API_BASE}/twin`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn(`Falling back to local twin fixture for ${twinId || 'golden'}:`, e);
      return getFallbackTwin(twinId);
    }
  },

  async getTwins(): Promise<string[]> {
    try {
      const res = await fetch(`${API_BASE}/twins`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch {
      return ['twin-finbank-golden', 'twin-cloudapp-easy', 'twin-neobank-medium', 'twin-globalbank-hard', 'twin-medicare-hospital'];
    }
  },

  async importTwin(payload: any): Promise<Twin> {
    try {
      const res = await fetch(`${API_BASE}/twin/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let errDetail = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          if (body.detail) {
            errDetail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
          }
        } catch {
          // fallback
        }
        throw new Error(errDetail);
      }
      return await res.json();
    } catch (e: any) {
      if (e.message && (e.message.includes('Schema mismatch') || e.message.includes('Invalid digital twin') || e.message.includes('cannot be empty'))) {
        throw e;
      }
      console.warn('Backend import unavailable or network error, applying local normalization:', e);
      return clientNormalizeTwin(payload);
    }
  },

  async exportTwin(twinId: string): Promise<Twin> {
    try {
      const res = await fetch(`${API_BASE}/twin/${twinId}/export`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch {
      return apiClient.getTwin(twinId);
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
        agent_id: params.agent_id || 'agent-external',
        n: params.n_walks || 100,
        seed: params.seed || 42,
        control_ids: params.control_ids || [],
      };
      const res = await fetch(`${API_BASE}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      if (data.candidate_routes && Array.isArray(data.candidate_routes)) {
        const topRoute = data.candidate_routes.length > 0 ? data.candidate_routes[0] : null;
        const nodes: string[] = topRoute ? topRoute.nodes : [];
        const isBlocked = !!(params.control_ids && params.control_ids.length > 0 && data.p_success === 0);
        return {
          twin_id: data.twin_id,
          agent_id: data.agent_id,
          p_success: data.p_success,
          mean_effort: data.mean_effort ?? 0,
          p90_effort: null,
          compromised_nodes: isBlocked && nodes.length > 1 ? nodes.slice(0, -1) : nodes,
          choke_points: {},
          exemplar_paths: topRoute ? [topRoute.nodes] : [],
          attack_trajectory: nodes.map((nodeId, idx) => {
            const isLastNode = idx === nodes.length - 1;
            const stepBlocked = isBlocked && isLastNode && nodes.length > 1;
            return {
              step_index: idx + 1,
              asset_id: nodeId,
              asset_name: nodeId,
              zone: idx === 0 ? 'dmz' : (isLastNode ? 'prod' : 'corp'),
              technique: idx === 0 ? 'ingress' : (stepBlocked ? 'lateral_attempt' : 'lateral_movement'),
              status: stepBlocked ? 'blocked' : 'compromised',
              cost: idx * 2 + 1,
              noise: Number(((idx + 1) * 0.18).toFixed(2)),
              src_asset_id: idx > 0 ? nodes[idx - 1] : undefined,
              notes: stepBlocked
                ? 'BLOCKED: Lateral traversal denied by active security controls'
                : (idx === 0 ? 'Adversary perimeter ingress' : 'Adversary foothold expanded laterally'),
            };
          }),
        };
      }
      return data;
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
        control_ids: params.control_ids || [],
        agent_ids: [params.agent_id || 'agent-external'],
        seed: params.seed || 42,
        n: params.n_walks || 100,
      };
      const res = await fetch(`${API_BASE}/evaluate-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      if (!data.broken_flows && data.broken_flow_details) {
        data.broken_flows = data.broken_flow_details.map((f: any) => ({
          id: f.flow_id,
          name: f.flow_name,
          src: f.src,
          dst: f.dst,
          technique: f.technique,
          criticality: f.criticality,
        }));
      }
      return data;
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

  async crawlAudit(params: CrawlAuditRequest): Promise<CrawlAuditResult> {
    try {
      const payload = {
        twin_id: params.twin_id || 'twin-finbank-golden',
        start_node: params.start_node || 'internet',
        target_node: params.target_node || null,
        active_control_ids: params.active_control_ids || [],
        max_paths: params.max_paths || 20,
        max_depth: params.max_depth || 8,
      };
      const res = await fetch(`${API_BASE}/crawl-audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Falling back to local crawl audit mock:', e);
      return getFallbackCrawlAudit(params);
    }
  },

  async getLineage(twinId: string = 'twin-finbank-golden'): Promise<LineageOut> {
    try {
      const res = await fetch(`${API_BASE}/lineage/${twinId}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Falling back to local lineage mock:', e);
      return getFallbackLineage(twinId);
    }
  },
};

// -----------------------------------------------------------------------------
// Fallback Mocks
// -----------------------------------------------------------------------------

function getFallbackTwin(twinId?: string): Twin {
  if (twinId && BENCHMARK_FALLBACK_TWINS[twinId]) {
    return BENCHMARK_FALLBACK_TWINS[twinId];
  }
  if (BENCHMARK_FALLBACK_TWINS['twin-finbank-golden']) {
    return BENCHMARK_FALLBACK_TWINS['twin-finbank-golden'];
  }
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
      { src: "web-dmz", dst: "jump-01", technique: "ssh_lateral" },
      { src: "ws-dev", dst: "fileshare", technique: "smb_lateral" },
      { src: "ws-dev", dst: "ci-runner", technique: "ssh_lateral" },
      { src: "ws-dev", dst: "jump-01", technique: "rdp_lateral" },
      { src: "ws-hr", dst: "fileshare", technique: "smb_lateral" },
      { src: "fileshare", dst: "ws-dev", technique: "smb_lateral" },
      { src: "ci-runner", dst: "jump-01", technique: "ssh_lateral" },
      { src: "jump-01", dst: "prod-db", technique: "rdp_lateral" },
      { src: "jump-01", dst: "backup-01", technique: "rdp_lateral" },
      { src: "payroll-api", dst: "prod-db", technique: "db_login" },
    ],
    flows: [
      { id: "F1", name: "Customer Web Banking Traffic", src: "internet", dst: "web-dmz", technique: "exploit_public_app", criticality: 3 },
      { id: "F2", name: "Portal Token Verification API", src: "web-dmz", dst: "payroll-api", technique: "db_login", criticality: 4 },
      { id: "F3", name: "Payroll Transaction Ledger Commits", src: "payroll-api", dst: "prod-db", technique: "db_login", criticality: 5 },
      { id: "F4", name: "Developer CI Build Artifact Push", src: "ws-dev", dst: "ci-runner", technique: "ssh_lateral", criticality: 3 },
      { id: "F5", name: "HR Document Archival Sync", src: "ws-hr", dst: "fileshare", technique: "smb_lateral", criticality: 3 },
      { id: "F6", name: "Nightly Cloud Disaster Recovery Backup", src: "jump-01", dst: "backup-01", technique: "rdp_lateral", criticality: 4 },
    ],
    controls: [
      { id: "ctrl-network-seg", name: "Core Banking Subnet Segmentation", cost: 2500, blocks: ["network_segmentation", "db_login", "ssh_lateral", "rdp_lateral", "smb_lateral", "exploit_public_app"], scope: ["prod-db", "backup-01"], efficacy: 0.95 },
      { id: "ctrl-mfa", name: "Privileged Access Multi-Factor Authentication", cost: 1500, blocks: ["mfa", "ssh_lateral", "rdp_lateral", "db_login"], scope: ["jump-01", "payroll-api"], efficacy: 0.85 },
      { id: "ctrl-edr", name: "Host Endpoint Detection and Response", cost: 2000, blocks: ["edr", "exploit_public_app", "cred_dump"], scope: ["ws-dev", "ws-hr", "ci-runner"], efficacy: 0.80 },
      { id: "ctrl-credguard", name: "Windows Credential Guard Protection", cost: 1000, blocks: ["credential_guard", "cred_dump", "creds_in_files"], scope: ["ws-dev", "jump-01"], efficacy: 0.90 },
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
        { step_index: 1, asset_id: "ws-dev", asset_name: "Developer Workstation", zone: "corp", technique: "phish", status: "compromised", cost: 2, noise: 0.1, notes: "Initial foothold via spear-phishing credential harvesting" },
        { step_index: 2, asset_id: "ci-runner", asset_name: "Internal CI Build Agent", zone: "corp", technique: "ssh_lateral", status: "compromised", cost: 4, noise: 0.25, src_asset_id: "ws-dev", notes: "Lateral pivot via SSH developer build agent keys" },
        { step_index: 3, asset_id: "jump-01", asset_name: "Privileged Admin Jumpbox", zone: "mgmt", technique: "ssh_lateral", status: "compromised", cost: 6, noise: 0.4, src_asset_id: "ci-runner", notes: "Tier-0 management jumpbox compromised" },
        { step_index: 4, asset_id: "prod-db", asset_name: "Core Banking Ledger Database", zone: "prod", technique: "rdp_lateral", status: "blocked", cost: 10, noise: 0.8, src_asset_id: "jump-01", notes: "BLOCKED BY NETWORK SEGMENTATION: Ingress policy blocked lateral movement to Core Database" },
        { step_index: 5, asset_id: "backup-01", asset_name: "Disaster Recovery Storage Vault", zone: "mgmt", technique: "rdp_lateral", status: "blocked", cost: 14, noise: 0.95, src_asset_id: "jump-01", is_pivot: true, notes: "ATTACKER PIVOT: Adversary re-plans to alternate Tier-0 target backup-01, blocked by Network Segmentation" },
      ],
      choke_points: { "ci-runner->jump-01": 0.85, "jump-01->prod-db": 0.12, "jump-01->backup-01": 0.08 },
      exemplar_paths: [["ws-dev", "ci-runner", "jump-01", "prod-db"], ["ws-dev", "ci-runner", "jump-01", "backup-01"]],
    };
  }

  if (hasMfa) {
    return {
      twin_id: "twin-finbank-golden",
      agent_id: "adv-admin",
      p_success: 0.14,
      mean_effort: 21.0,
      p90_effort: 28.5,
      compromised_nodes: ["ws-dev", "fileshare", "ci-runner"],
      attack_trajectory: [
        { step_index: 1, asset_id: "ws-dev", asset_name: "Developer Workstation", zone: "corp", technique: "phish", status: "compromised", cost: 2, noise: 0.1, notes: "Initial foothold via spear-phishing" },
        { step_index: 2, asset_id: "jump-01", asset_name: "Privileged Admin Jumpbox", zone: "mgmt", technique: "rdp_lateral", status: "blocked", cost: 5, noise: 0.35, src_asset_id: "ws-dev", notes: "BLOCKED BY MFA: Hardware token requirement blocked direct RDP bastion transition" },
        { step_index: 3, asset_id: "fileshare", asset_name: "Corporate File Repository", zone: "corp", technique: "smb_lateral", status: "compromised", cost: 8, noise: 0.5, src_asset_id: "ws-dev", is_pivot: true, notes: "ATTACKER PIVOT: Adversary branches into corporate fileshare to scavenge unmanaged credentials" },
        { step_index: 4, asset_id: "ci-runner", asset_name: "Internal CI Build Agent", zone: "corp", technique: "ssh_lateral", status: "compromised", cost: 11, noise: 0.65, src_asset_id: "ws-dev", notes: "Adversary compromises CI runner attempting secondary bastion breach" },
        { step_index: 5, asset_id: "jump-01", asset_name: "Privileged Admin Jumpbox", zone: "mgmt", technique: "ssh_lateral", status: "blocked", cost: 16, noise: 0.85, src_asset_id: "ci-runner", notes: "BLOCKED BY MFA: Secondary bastion SSH breach thwarted by MFA challenge" },
      ],
      choke_points: { "ws-dev->jump-01": 0.14, "ci-runner->jump-01": 0.12 },
      exemplar_paths: [["ws-dev", "fileshare", "ci-runner", "jump-01"]],
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
      { step_index: 1, asset_id: "ws-dev", asset_name: "Developer Workstation", zone: "corp", technique: "phish", status: "compromised", cost: 2, noise: 0.1, notes: "Initial foothold established via spear-phishing" },
      { step_index: 2, asset_id: "ci-runner", asset_name: "Internal CI Build Agent", zone: "corp", technique: "ssh_lateral", status: "compromised", cost: 4, noise: 0.25, src_asset_id: "ws-dev", notes: "Lateral pivot via SSH credentials discovered in bash history" },
      { step_index: 3, asset_id: "jump-01", asset_name: "Privileged Admin Jumpbox", zone: "mgmt", technique: "ssh_lateral", status: "compromised", cost: 6, noise: 0.4, src_asset_id: "ci-runner", notes: "Tier-0 management bastion host compromised" },
      { step_index: 4, asset_id: "prod-db", asset_name: "Core Banking Ledger Database", zone: "prod", technique: "rdp_lateral", status: "compromised", cost: 9, noise: 0.65, src_asset_id: "jump-01", notes: "CRITICAL BREACH: Adversary achieves full database administrator compromise via unrestricted RDP" },
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

function getFallbackCrawlAudit(params: CrawlAuditRequest): CrawlAuditResult {
  const startNode = params.start_node || 'internet';
  const targetNode = params.target_node || 'prod-db';

  return {
    start_node: startNode,
    target_node: targetNode,
    total_paths: 2,
    paths: [
      {
        path: ['internet', 'web-dmz', 'jump-01', 'prod-db'],
        total_hops: 3,
        node_audits: [
          {
            step_index: 0,
            asset_id: 'internet',
            asset_name: 'External Internet Gateway',
            zone: 'dmz',
            criticality: 1,
            crown_jewel: false,
            entry_technique: null,
            entry_from: null,
            vulnerabilities: [
              {
                type: 'technique_exposure',
                severity: 'MEDIUM',
                title: 'Perimeter Ingress Point',
                description: 'Public routing exposes edge services to unauthenticated network probing.',
                mitre_id: 'T1190',
                affected_asset_id: 'internet',
              },
            ],
            risk_score: 2.1,
            recommended_fix: {
              control_id: 'ctrl-edr',
              control_name: 'Edge Rate Limiting & EDR Filtering',
              cost: 1200,
              vulnerabilities_fixed: 1,
              description: 'Throttle unsolicited inbound sweep attempts at perimeter gateway.',
            },
            outgoing_edges: [
              {
                dst: 'web-dmz',
                dst_name: 'Online Banking Web Portal',
                technique: 'exploit_public_app',
                mitre_id: 'T1190',
                crosses_zone: false,
                dst_zone: 'dmz',
              },
            ],
            flows_through: [
              {
                flow_id: 'F1',
                flow_name: 'Customer Web Banking Traffic',
                criticality: 3,
                role: 'source',
              },
            ],
            crown_jewels_reachable: ['prod-db', 'backup-01'],
          },
          {
            step_index: 1,
            asset_id: 'web-dmz',
            asset_name: 'Online Banking Web Portal',
            zone: 'dmz',
            criticality: 3,
            crown_jewel: false,
            entry_technique: 'exploit_public_app',
            entry_from: 'internet',
            vulnerabilities: [
              {
                type: 'technique_exposure',
                severity: 'HIGH',
                title: 'Unauthenticated Public Application Surface',
                description: 'Exposed to remote code execution and SSRF via Spring Boot actuator flaw.',
                mitre_id: 'T1190',
                affected_asset_id: 'web-dmz',
              },
              {
                type: 'missing_control',
                severity: 'MEDIUM',
                title: 'Missing Web Application Firewall WAF Inspection',
                description: 'HTTP payload inspection missing before reaching web worker nodes.',
                affected_asset_id: 'web-dmz',
              },
            ],
            risk_score: 6.8,
            recommended_fix: {
              control_id: 'ctrl-edr',
              control_name: 'Host Endpoint Detection and Response',
              cost: 2000,
              vulnerabilities_fixed: 2,
              description: 'Detects in-memory shellcode execution and kills unauthorized child processes.',
            },
            outgoing_edges: [
              {
                dst: 'jump-01',
                dst_name: 'Privileged Admin Jumpbox',
                technique: 'ssh_lateral',
                mitre_id: 'T1021.004',
                crosses_zone: true,
                dst_zone: 'mgmt',
              },
              {
                dst: 'payroll-api',
                dst_name: 'SWIFT Payment Clearing Microservice',
                technique: 'db_login',
                mitre_id: 'T1078',
                crosses_zone: true,
                dst_zone: 'prod',
              },
            ],
            flows_through: [
              {
                flow_id: 'F1',
                flow_name: 'Customer Web Banking Traffic',
                criticality: 3,
                role: 'destination',
              },
              {
                flow_id: 'F2',
                flow_name: 'Portal Token Verification API',
                criticality: 4,
                role: 'source',
              },
            ],
            crown_jewels_reachable: ['prod-db', 'backup-01'],
          },
          {
            step_index: 2,
            asset_id: 'jump-01',
            asset_name: 'Privileged Admin Jumpbox',
            zone: 'mgmt',
            criticality: 4,
            crown_jewel: false,
            entry_technique: 'ssh_lateral',
            entry_from: 'web-dmz',
            vulnerabilities: [
              {
                type: 'credential_exposure',
                severity: 'CRITICAL',
                title: 'Cached Kerberos Admin Tickets in LSASS Memory',
                description: 'Domain admin credentials left persistent after automated IT scheduled run.',
                mitre_id: 'T1003.001',
                affected_asset_id: 'jump-01',
              },
              {
                type: 'missing_control',
                severity: 'HIGH',
                title: 'Lack of Hardware FIDO2 MFA on Management Ingress',
                description: 'Standard single-factor SSH key accepted without hardware token assertion.',
                mitre_id: 'T1078',
                affected_asset_id: 'jump-01',
              },
            ],
            risk_score: 9.2,
            recommended_fix: {
              control_id: 'ctrl-mfa',
              control_name: 'Privileged Access Multi-Factor Authentication',
              cost: 1500,
              vulnerabilities_fixed: 2,
              description: 'Enforces hardware token challenge, preventing credential replay lateral movement.',
            },
            outgoing_edges: [
              {
                dst: 'prod-db',
                dst_name: 'Core Banking Ledger Database',
                technique: 'rdp_lateral',
                mitre_id: 'T1021.001',
                crosses_zone: true,
                dst_zone: 'prod',
              },
              {
                dst: 'backup-01',
                dst_name: 'Disaster Recovery Storage Vault',
                technique: 'rdp_lateral',
                mitre_id: 'T1021.001',
                crosses_zone: false,
                dst_zone: 'mgmt',
              },
            ],
            flows_through: [
              {
                flow_id: 'F6',
                flow_name: 'Nightly Cloud Disaster Recovery Backup',
                criticality: 4,
                role: 'source',
              },
            ],
            crown_jewels_reachable: ['prod-db', 'backup-01'],
          },
          {
            step_index: 3,
            asset_id: 'prod-db',
            asset_name: 'Core Banking Ledger Database',
            zone: 'prod',
            criticality: 5,
            crown_jewel: true,
            entry_technique: 'rdp_lateral',
            entry_from: 'jump-01',
            vulnerabilities: [
              {
                type: 'crown_jewel_proximity',
                severity: 'CRITICAL',
                title: 'Crown Jewel Database Compromised',
                description: 'Full write access to account balance ledger and ledger transaction history.',
                mitre_id: 'T1565.001',
                affected_asset_id: 'prod-db',
              },
            ],
            risk_score: 10.0,
            recommended_fix: {
              control_id: 'ctrl-network-seg',
              control_name: 'Core Banking Subnet Segmentation',
              cost: 2500,
              vulnerabilities_fixed: 1,
              description: 'Isolates database to internal VPC peering only, blocking jumpbox interactive shells.',
            },
            outgoing_edges: [],
            flows_through: [
              {
                flow_id: 'F3',
                flow_name: 'Payroll Transaction Ledger Commits',
                criticality: 5,
                role: 'destination',
              },
            ],
            crown_jewels_reachable: ['prod-db'],
          },
        ],
      },
    ],
    summary: {
      total_vulnerabilities: 5,
      critical_count: 2,
      high_count: 2,
      medium_count: 1,
      low_count: 0,
      weakest_node: 'jump-01',
      weakest_node_score: 9.2,
      flows_at_risk: ['F1', 'F2', 'F6', 'F3'],
      crown_jewel_reached: true,
      prioritized_fixes: [
        {
          control_id: 'ctrl-mfa',
          control_name: 'Privileged Access Multi-Factor Authentication',
          cost: 1500,
          protects_nodes: ['jump-01', 'payroll-api'],
        },
        {
          control_id: 'ctrl-edr',
          control_name: 'Host Endpoint Detection and Response',
          cost: 2000,
          protects_nodes: ['web-dmz', 'internet'],
        },
        {
          control_id: 'ctrl-network-seg',
          control_name: 'Core Banking Subnet Segmentation',
          cost: 2500,
          protects_nodes: ['prod-db'],
        },
      ],
      total_fix_cost: 6000,
    },
  };
}

function getFallbackLineage(twinId: string): LineageOut {
  return {
    twin_id: twinId,
    lineage: [
      {
        twin_id: 'twin-finbank-golden',
        parent_id: null,
        hash: '7f3a9e2d5c1b8401',
      },
      {
        twin_id: 'twin-finbank-mfa-eval',
        parent_id: 'twin-finbank-golden',
        hash: 'a9b2c3d4e5f60718',
      },
      {
        twin_id: 'twin-finbank-seg-eval',
        parent_id: 'twin-finbank-golden',
        hash: 'e8f1d2c3b4a59687',
      },
    ],
  };
}

export function clientNormalizeTwin(payload: any): Twin {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Expected a valid JSON object at root.');
  }

  const data = (payload.data && typeof payload.data === 'object') ? payload.data :
               (payload.twin && typeof payload.twin === 'object') ? payload.twin : payload;

  const rawAssets = Array.isArray(data.assets) ? data.assets : (Array.isArray(data.nodes) ? data.nodes : null);
  if (!rawAssets) {
    const keys = Object.keys(data).slice(0, 8).join(', ');
    throw new Error(`Schema mismatch: missing required 'assets' (or 'nodes') array. Keys found: ${keys}`);
  }

  if (rawAssets.length === 0) {
    throw new Error("Invalid digital twin: 'assets' array cannot be empty.");
  }

  const validKinds: ('server' | 'workstation' | 'database' | 'cloud_role' | 'share')[] =
    ['server', 'workstation', 'database', 'cloud_role', 'share'];

  const normalizedAssets: Asset[] = rawAssets.map((item: any, idx: number) => {
    if (!item || typeof item !== 'object') {
      return {
        id: `asset-${idx + 1}`,
        name: `Asset ${idx + 1}`,
        kind: 'server',
        zone: 'corp',
        criticality: 2,
        crown_jewel: false,
      };
    }

    const id = String(item.id || item.name || `asset-${idx + 1}`).trim();
    const name = String(item.name || id);

    let rawKind = String(item.kind || item.type || item.asset_type || 'server').toLowerCase();
    let kind: 'server' | 'workstation' | 'database' | 'cloud_role' | 'share' = 'server';
    if (rawKind.includes('data') || rawKind.includes('db') || rawKind.includes('sql') || rawKind.includes('ledger')) {
      kind = 'database';
    } else if (rawKind.includes('workstation') || rawKind.includes('pc') || rawKind.includes('laptop') || rawKind.includes('tablet')) {
      kind = 'workstation';
    } else if (rawKind.includes('role') || rawKind.includes('iam') || rawKind.includes('cloud')) {
      kind = 'cloud_role';
    } else if (rawKind.includes('share') || rawKind.includes('file') || rawKind.includes('storage') || rawKind.includes('s3')) {
      kind = 'share';
    }

    let rawZone = String(item.zone || 'corp').toLowerCase();
    let zone: 'dmz' | 'corp' | 'prod' | 'mgmt' = 'corp';
    if (rawZone.includes('dmz') || rawZone.includes('public') || rawZone.includes('ext')) {
      zone = 'dmz';
    } else if (rawZone.includes('prod') || rawZone.includes('secure') || rawZone.includes('data')) {
      zone = 'prod';
    } else if (rawZone.includes('mgmt') || rawZone.includes('admin') || rawZone.includes('jump')) {
      zone = 'mgmt';
    }

    let crit = 2;
    if (typeof item.criticality === 'string') {
      const c = item.criticality.toLowerCase();
      crit = c === 'critical' ? 5 : c === 'severe' ? 4 : c === 'high' ? 3 : c === 'low' ? 1 : 2;
    } else if (typeof item.criticality === 'number') {
      crit = Math.max(1, Math.min(5, Math.round(item.criticality)));
    }

    return {
      id,
      name,
      kind,
      zone,
      criticality: crit,
      crown_jewel: Boolean(item.crown_jewel),
    };
  });

  const rawEdges = Array.isArray(data.edges) ? data.edges : (Array.isArray(data.relationships) ? data.relationships : (Array.isArray(data.links) ? data.links : []));
  const normalizedEdges: Edge[] = rawEdges.map((e: any) => ({
    src: String(e.src || e.source || ''),
    dst: String(e.dst || e.target || ''),
    technique: String(e.technique || e.relation_type || e.type || 'network_access'),
  })).filter((e: Edge) => e.src && e.dst);

  const rawIdentities = Array.isArray(data.identities) ? data.identities : [];
  const normalizedIdentities: Identity[] = rawIdentities.map((i: any, idx: number) => ({
    id: String(i.id || `id-${idx + 1}`),
    name: String(i.name || i.id || `Identity ${idx + 1}`),
    kind: (['user', 'admin', 'service_account', 'cloud_role'].includes(String(i.kind || i.role || '').toLowerCase())
      ? String(i.kind || i.role || '').toLowerCase()
      : 'user') as 'user' | 'admin' | 'service_account' | 'cloud_role',
    tier: typeof i.tier === 'number' ? Math.max(0, Math.round(i.tier)) : 1,
  }));

  const rawFlows = Array.isArray(data.flows) ? data.flows : [];
  const normalizedFlows: ServiceFlow[] = rawFlows.map((f: any, idx: number) => ({
    id: String(f.id || `F${idx + 1}`),
    name: String(f.name || `Flow ${f.id || idx + 1}`),
    src: String(f.src || f.source || ''),
    dst: String(f.dst || f.target || ''),
    technique: String(f.technique || 'service_request'),
    criticality: typeof f.criticality === 'number' ? Math.max(1, Math.min(5, Math.round(f.criticality))) : 3,
  })).filter((f: ServiceFlow) => f.src && f.dst);

  const rawControls = Array.isArray(data.controls) ? data.controls : [];
  const normalizedControls: Control[] = rawControls.map((c: any, idx: number) => ({
    id: String(c.id || `ctrl-${idx + 1}`),
    name: String(c.name || `Control ${c.id || idx + 1}`),
    cost: typeof c.cost === 'number' ? Math.max(0, Math.round(c.cost)) : 1000,
    blocks: Array.isArray(c.blocks) ? c.blocks.map(String) : (typeof c.blocks === 'string' ? [c.blocks] : []),
    scope: Array.isArray(c.scope) ? c.scope.map(String) : (Array.isArray(c.covered_entities) ? c.covered_entities.map(String) : []),
    efficacy: typeof c.efficacy === 'number' ? Math.max(0, Math.min(1, c.efficacy)) : 0.9,
  }));

  const twinId = String(data.id || data.scenario_id || `twin-imported-${Math.random().toString(36).substring(2, 8)}`).trim();

  return {
    id: twinId,
    assets: normalizedAssets,
    identities: normalizedIdentities,
    edges: normalizedEdges,
    flows: normalizedFlows,
    controls: normalizedControls,
    parent_id: data.parent_id ? String(data.parent_id) : null,
  };
}


