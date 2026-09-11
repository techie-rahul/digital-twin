import { ChangeVerdict, ServiceFlow } from './api';

export type DemoPresetId =
  | 'preset-baseline'
  | 'preset-full-seg'
  | 'preset-mfa'
  | 'preset-scoped-seg'
  | 'preset-sync-drift';

export type DecisionVerdictType = 'DEPLOY' | 'BLOCK' | 'REVIEW' | 'STANDBY';

export interface DecisionHeroData {
  proposedChange: {
    title: string;
    description: string;
    securityImpact: string;
    securityImpactDetail?: string;
    businessImpact: string;
    isBusinessOutage: boolean;
    businessOutageLabel?: string;
    confidenceLevel: 'High' | 'Medium' | 'Low';
    confidenceScore: number;
    confidenceDetail: string;
    verdict: DecisionVerdictType;
    verdictLabel: string;
    verdictSubtext: string;
    pathReductionPct: number;
    effortDeltaPct: number | null;
    pSuccess: number;
  };
  suggestedAlternative: {
    title: string;
    securityImpact: string;
    businessImpact: string;
    residualRoute: string;
    verdict: DecisionVerdictType;
    verdictLabel: string;
    canApply: boolean;
    targetPresetId?: DemoPresetId;
  };
}

export interface DemoPresetConfig {
  id: DemoPresetId;
  index: number;
  label: string;
  shortLabel: string;
  tagline: string;
  description: string;
  controlIds: string[];
  heroData: DecisionHeroData;
  activeAttackerRoute: 'baseline' | 'blocked' | 'rerouted-route-d' | 'neutralized' | 'drift-regression';
  activeBrokenFlowIds: string[];
  isReroutingActive: boolean;
  reroutingCaption?: string;
  isDriftActive: boolean;
  isP1OutageActive: boolean;
  riskScorePct: number;
}
