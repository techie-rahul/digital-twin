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
  name?: string;
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
  src_asset_id?: string;
  is_pivot?: boolean;
  notes?: string;
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

// =====================================================================
// Crawl Security Auditor (Chess Piece Feature) Types
// =====================================================================

export type VulnerabilityType =
  | 'technique_exposure'
  | 'missing_control'
  | 'credential_exposure'
  | 'zone_crossing'
  | 'flow_risk'
  | 'crown_jewel_proximity';

export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface Vulnerability {
  type: VulnerabilityType;
  severity: SeverityLevel;
  title: string;
  description: string;
  mitre_id?: string | null;
  affected_asset_id: string;
  related_entity_id?: string | null;
}

export interface RecommendedFix {
  control_id: string;
  control_name: string;
  cost: number;
  vulnerabilities_fixed: number;
  description: string;
  paths_eliminated?: number;
  is_safe?: boolean;
  broken_flows?: string[];
}

export interface OutgoingEdgeInfo {
  dst: string;
  dst_name: string;
  technique: string;
  mitre_id?: string | null;
  crosses_zone: boolean;
  dst_zone: string;
  is_critical_path?: boolean;
  crown_jewel_distance?: number;
  threat_level?: SeverityLevel;
  threat_rationale?: string;
}

export interface FlowAtRisk {
  flow_id: string;
  flow_name: string;
  criticality: number;
  role: 'source' | 'destination';
}

export interface NodeAudit {
  step_index: number;
  asset_id: string;
  asset_name: string;
  zone: string;
  criticality: number;
  crown_jewel: boolean;
  entry_technique?: string | null;
  entry_from?: string | null;
  vulnerabilities: Vulnerability[];
  risk_score: number;
  recommended_fix?: RecommendedFix | null;
  outgoing_edges: OutgoingEdgeInfo[];
  flows_through: FlowAtRisk[];
  crown_jewels_reachable: string[];
}

export interface PrioritizedFix {
  control_id: string;
  control_name: string;
  cost: number;
  protects_nodes: string[];
  paths_eliminated?: number;
  is_safe?: boolean;
  broken_flows?: string[];
}

export interface AuditSummary {
  total_vulnerabilities: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  weakest_node?: string | null;
  weakest_node_score: number;
  flows_at_risk: string[];
  crown_jewel_reached: boolean;
  prioritized_fixes: PrioritizedFix[];
  total_fix_cost: number;
}

export interface CrawlAuditPath {
  path: string[];
  total_hops: number;
  node_audits: NodeAudit[];
}

export interface CrawlAuditResult {
  start_node: string;
  target_node: string;
  total_paths: number;
  paths: CrawlAuditPath[];
  summary: AuditSummary;
}

export interface CrawlAuditRequest {
  twin_id?: string;
  start_node?: string;
  target_node?: string | null;
  active_control_ids?: string[];
  max_paths?: number;
  max_depth?: number;
}

// =====================================================================
// Twin Lineage & Provenance Types
// =====================================================================

export interface LineageNodeOut {
  twin_id: string;
  parent_id?: string | null;
  hash: string;
}

export interface LineageOut {
  twin_id: string;
  lineage: LineageNodeOut[];
}

// =====================================================================
// Dataset Management & Dynamic Ingestion Types
// =====================================================================

export interface TwinSummaryOut {
  id: string;
  parent_id?: string | null;
  hash: string;
  asset_count: number;
  edge_count: number;
  flow_count: number;
  control_count: number;
  is_golden: boolean;
}

export interface ImportTwinOut {
  status: string;
  twin_id: string;
  hash: string;
  asset_count: number;
  identity_count: number;
  edge_count: number;
  flow_count: number;
  control_count: number;
  assets: Asset[];
}


