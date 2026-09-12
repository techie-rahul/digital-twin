import { OptimizationResult, OptimizationPortfolio } from '../types/api';

/**
 * The live /optimize endpoint returns a flat single-portfolio shape
 * ({selected_controls, total_cost, risk_before, risk_after, broken_flows, is_safe, verdict})
 * while the frontend type (and the local mock) use {constrained_portfolio, naive_portfolio}.
 * Normalise both into OptimizationResult; naive_portfolio is left undefined when the
 * backend does not compute one.
 */
export function normalizeOptimization(raw: any, budget: number, maxCrit: number): OptimizationResult {
  if (raw && raw.constrained_portfolio) return raw as OptimizationResult;

  const before = Number(raw?.risk_before ?? 0);
  const after = Number(raw?.risk_after ?? 0);
  const riskReductionPct = before > 0 ? ((before - after) / before) * 100 : 0;
  const verdict = raw?.verdict ?? {};

  const portfolio: OptimizationPortfolio = {
    control_ids: raw?.selected_control_ids ?? [],
    control_names: (raw?.selected_controls ?? []).map((c: any) => c.name ?? c.id),
    total_cost: raw?.total_cost ?? 0,
    budget: raw?.budget ?? budget,
    broken_flows: raw?.broken_flows ?? [],
    is_safe: raw?.is_safe ?? true,
    risk_reduction_pct: riskReductionPct,
    effort_increase_pct: verdict.delta?.effort_increase_pct ?? null,
    recommendation: verdict.recommendation ?? 'REVIEW',
    rationale: (verdict.reasons ?? []).join(' '),
  };

  return {
    constrained_portfolio: portfolio,
    naive_portfolio: undefined as unknown as OptimizationPortfolio,
    budget: raw?.budget ?? budget,
    max_broken_criticality: maxCrit,
    candidate_count: 0,
    subsets_evaluated: 0,
    contrast_summary: '',
  };
}
