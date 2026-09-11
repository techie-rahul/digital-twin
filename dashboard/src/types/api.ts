export type AssetKind = 'server' | 'workstation' | 'database' | 'cloud_role' | 'share';
export type AssetZone = 'dmz' | 'corp' | 'prod' | 'mgmt';

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  zone: AssetZone;
  criticality: number; // 1-5
  crown_jewel: boolean;
}

export interface Identity {
  id: string;
  name: string;
  kind: 'user' | 'admin' | 'service_account' | 'cloud_role';
  tier: number;
}

export interface Edge {
  src: string;
  dst: string;
  technique: string;
}

export interface ServiceFlow {
  id: string;
  name: string;
  src: string;
  dst: string;
  technique: string;
  criticality: number; // 1-5, >=4 must never be broken
}

export interface Control {
  id: string;
  name: string;
  cost: number;
  blocks: string[];
  scope: string[];
  efficacy: number;
}

export interface Twin {
  id: string;
  assets: Asset[];
  identities: Identity[];
  edges: Edge[];
  flows: ServiceFlow[];
  controls: Control[];
  parent_id?: string | null;
}

export interface SimulationStep {
  step_index: number;
  asset_id: string;
  asset_name: string;
  zone: string;
  technique: string;
  status: 'targeted' | 'compromised' | 'blocked';
  cost: number;
  noise: number;
}

export interface SimulateResponse {
  twin_id: string;
  agent_id: string;
  p_success: number;
  mean_effort: number | null;
  p90_effort: number | null;
  compromised_nodes: string[];
  attack_trajectory: SimulationStep[];
  choke_points: Record<string, number>;
  exemplar_paths: string[][];
}

export interface FlowBreakageDetail {
  flow_id: string;
  flow_name: string;
  criticality: number;
  src: string;
  dst: string;
  broken_by_control: string;
  reason: string;
}

export interface Confidence {
  level: 'High' | 'Medium' | 'Low';
  score: number;
  unknowns: string[];
  undetermined: boolean;
}

export interface Delta {
  naive_path_reduction_pct: number;
  effort_increase_pct: number | null;
  p_success_delta: number;
  route_eliminated: string[];
  substituted_paths: string[];
}

export interface ChangeVerdict {
  recommendation: 'DEPLOY' | 'BLOCK' | 'REVIEW';
  delta: Delta;
  broken_flows: ServiceFlow[];
  broken_flow_details?: FlowBreakageDetail[];
  cost: number;
  confidence: Confidence;
  unknowns: string[];
  undetermined: boolean;
  reasons: string[];
  alternatives: string[];
  verdict?: 'DEPLOY' | 'BLOCK' | 'REVIEW';
}

export interface OptimizationPortfolio {
  control_ids: string[];
  control_names: string[];
  total_cost: number;
  budget: number;
  broken_flows: ServiceFlow[];
  is_safe: boolean;
  risk_reduction_pct: number;
  effort_increase_pct?: number | null;
  recommendation: 'DEPLOY' | 'BLOCK' | 'REVIEW';
  rationale: string;
}

export interface OptimizationResult {
  constrained_portfolio: OptimizationPortfolio;
  naive_portfolio: OptimizationPortfolio;
  budget: number;
  max_broken_criticality: number;
  candidate_count: number;
  subsets_evaluated: number;
  contrast_summary: string;
}

export interface BlastRadiusResponse {
  source_asset_id: string;
  source_asset_name: string;
  source_criticality: number;
  reachable_asset_ids: string[];
  compromised_crown_jewels: string[];
  total_downstream_criticality: number;
  direct_dependencies: string[];
}

export interface ImportSummary {
  status: 'success';
  message: string;
  twin_id: string;
  parent_id?: string | null;
  hash: string;
  asset_count: number;
  identity_count: number;
  edge_count: number;
  flow_count: number;
  control_count: number;
}

export interface ValidationErrorResponse {
  status: 'error';
  message: string;
  errors: string[];
}

