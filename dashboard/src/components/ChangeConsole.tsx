import React from 'react';
import { ShieldCheck, ShieldAlert, AlertTriangle, Check, XCircle, TrendingUp, Info, CornerDownRight, Zap } from 'lucide-react';
import { Control, ChangeVerdict } from '../types/api';

interface ChangeConsoleProps {
  availableControls: Control[];
  selectedControlIds: string[];
  onToggleControl: (controlId: string) => void;
  verdict: ChangeVerdict | null;
  isEvaluating: boolean;
}

export const ChangeConsole: React.FC<ChangeConsoleProps> = ({
  availableControls,
  selectedControlIds,
  onToggleControl,
  verdict,
  isEvaluating,
}) => {
  const getVerdictBadge = () => {
    if (!verdict) return null;

    switch (verdict.recommendation) {
      case 'DEPLOY':
        return (
          <div className="flex items-center gap-3.5 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
            <div className="w-11 h-11 rounded-lg bg-emerald-100 flex items-center justify-center border border-emerald-300">
              <ShieldCheck className="w-6 h-6 text-emerald-700" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold tracking-wider text-emerald-700 uppercase">
                CAB Policy Recommendation
              </span>
              <h2 className="text-xl font-bold text-emerald-950 tracking-tight flex items-center gap-2">
                <span>DEPLOY</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-emerald-200/60 text-emerald-800">
                  SAFE TO SHIP • ZERO HIGH-CRIT OUTAGES
                </span>
              </h2>
            </div>
          </div>
        );

      case 'BLOCK':
        return (
          <div className="flex items-center gap-3.5 p-4 rounded-xl bg-red-50 border border-red-200">
            <div className="w-11 h-11 rounded-lg bg-red-100 flex items-center justify-center border border-red-300">
              <ShieldAlert className="w-6 h-6 text-red-700" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold tracking-wider text-red-700 uppercase">
                CAB Policy Recommendation
              </span>
              <h2 className="text-xl font-bold text-red-950 tracking-tight flex items-center gap-2">
                <span>BLOCK</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-red-200/70 text-red-800">
                  CRITICAL SERVICE DISRUPTION DETECTED
                </span>
              </h2>
            </div>
          </div>
        );

      case 'REVIEW':
      default:
        return (
          <div className="flex items-center gap-3.5 p-4 rounded-xl bg-amber-50 border border-amber-200">
            <div className="w-11 h-11 rounded-lg bg-amber-100 flex items-center justify-center border border-amber-300">
              <AlertTriangle className="w-6 h-6 text-amber-700" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold tracking-wider text-amber-700 uppercase">
                CAB Policy Recommendation
              </span>
              <h2 className="text-xl font-bold text-amber-950 tracking-tight flex items-center gap-2">
                <span>REVIEW</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-200/70 text-amber-800">
                  APPROVAL REQUIRED • DISRUPTION WITHIN TOLERANCE
                </span>
              </h2>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Configuration Header */}
      <div className="p-5 rounded-xl bg-white border border-canvas-border shadow-subtle">
        <h2 className="text-base font-bold text-ash-900 tracking-tight">
          Security Change Sandbox & CAB Evaluation
        </h2>
        <p className="text-xs text-ash-500 mt-0.5 max-w-3xl">
          Dual-model evaluation: quantifies attacker path obstruction while verifying business flow continuity before deployment.
        </p>

        {/* Proposed Control Selection Grid */}
        <div className="mt-4">
          <label className="text-[11px] font-mono font-bold uppercase text-ash-500 block mb-2">
            Proposed Defensive Controls to Sandbox:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {availableControls.map((ctrl) => {
              const isSelected = selectedControlIds.includes(ctrl.id);

              return (
                <div
                  key={ctrl.id}
                  onClick={() => onToggleControl(ctrl.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all duration-150 select-none active:scale-[0.98] ${
                    isSelected
                      ? 'bg-brand-orange-light/40 border-brand-orange shadow-subtle ring-1 ring-brand-orange/30'
                      : 'bg-white border-canvas-border hover:border-ash-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className={`text-xs font-semibold ${isSelected ? 'text-brand-orange' : 'text-ash-900'}`}>
                        {ctrl.name}
                      </h4>
                      <span className="text-[10px] font-mono text-ash-400 block mt-0.5">
                        {ctrl.id}
                      </span>
                    </div>

                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                        isSelected
                          ? 'bg-brand-orange border-brand-orange text-white'
                          : 'border-ash-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[10px] font-mono pt-1.5 border-t border-canvas-border text-ash-500">
                    <span className="font-semibold text-ash-700">${ctrl.cost.toLocaleString()}</span>
                    <span className="text-emerald-700 font-medium">{(ctrl.efficacy * 100).toFixed(0)}% efficacy</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Verdict & Comparative Metrics */}
      {verdict ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: Verdict + Metrics */}
          <div className="lg:col-span-2 space-y-6">
            {/* The Verdict Badge */}
            {getVerdictBadge()}

            {/* Metrics Comparison */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {/* Metric 1: Static Path Reduction % */}
              <div className="p-4 rounded-xl bg-white border border-canvas-border shadow-subtle space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-ash-400">
                  <span>Static Reachability</span>
                  <Info className="w-3 h-3 text-ash-300" />
                </div>
                <div className="text-2xl font-bold font-mono text-ash-900">
                  {verdict.delta.naive_path_reduction_pct.toFixed(1)}%
                </div>
                <p className="text-[11px] text-ash-500 font-sans">
                  Shortest-path obstruction assuming static adversary
                </p>
              </div>

              {/* Metric 2: Adaptive Attacker Effort Δ */}
              <div className="p-4 rounded-xl bg-white border border-canvas-border shadow-subtle space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-brand-orange">
                  <span className="flex items-center gap-1 font-semibold">
                    <TrendingUp className="w-3 h-3" />
                    <span>Adversary Effort Δ</span>
                  </span>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-brand-orange-light font-bold">
                    ADAPTIVE
                  </span>
                </div>
                <div className="text-2xl font-bold font-mono text-brand-orange">
                  {verdict.delta.effort_increase_pct !== null
                    ? `+${verdict.delta.effort_increase_pct.toFixed(1)}%`
                    : 'N/A (<20 trials)'}
                </div>
                <p className="text-[11px] text-ash-500 font-sans">
                  Measured work factor increase with dynamic re-planning
                </p>
              </div>

              {/* Metric 3: Target Breach Probability Δ */}
              <div className="p-4 rounded-xl bg-white border border-canvas-border shadow-subtle space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-ash-400">
                  <span>Breach Probability Δ</span>
                  <span className="text-[9px] text-ash-400 font-mono">p_success</span>
                </div>
                <div className={`text-2xl font-bold font-mono ${verdict.delta.p_success_delta < 0 ? 'text-emerald-700' : 'text-ash-800'}`}>
                  {verdict.delta.p_success_delta > 0 ? '+' : ''}
                  {(verdict.delta.p_success_delta * 100).toFixed(1)}%
                </div>
                <p className="text-[11px] text-ash-500 font-sans">
                  Shift in probability of reaching crown jewel targets
                </p>
              </div>
            </div>

            {/* Severed Business Flows Alert */}
            {verdict.broken_flows.length > 0 && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 space-y-2">
                <div className="flex items-center gap-2 text-red-800 font-bold text-xs">
                  <XCircle className="w-4 h-4 text-red-600" />
                  <span>Severed Operational Dependencies ({verdict.broken_flows.length}):</span>
                </div>
                <ul className="space-y-1.5 text-xs text-ash-800">
                  {verdict.broken_flows.map((flow) => (
                    <li key={flow.id} className="flex items-center justify-between p-2 rounded bg-white border border-red-200 font-mono text-[11px]">
                      <span className="font-semibold text-ash-900">{flow.id}: {flow.name} ({flow.src} → {flow.dst})</span>
                      <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 text-[10px] font-bold border border-red-200">
                        Criticality {flow.criticality} (MUST NOT BREAK)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Decision Rationale & Root-Cause Breakdown */}
            <div className="p-5 rounded-xl bg-white border border-canvas-border shadow-subtle space-y-3">
              <h4 className="text-xs font-mono font-bold uppercase text-ash-700 tracking-wider">
                Decision Rationale & Root-Cause Analysis:
              </h4>
              <ul className="space-y-1.5 text-xs text-ash-700">
                {verdict.reasons.map((reason, idx) => (
                  <li key={idx} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-brand-orange mt-0.5 font-bold">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>

              {/* Actionable Alternatives */}
              {verdict.alternatives.length > 0 && (
                <div className="mt-4 pt-3 border-t border-canvas-border">
                  <h5 className="text-xs font-mono font-bold uppercase text-emerald-800 tracking-wider mb-2">
                    Recommended Remediation Guidance:
                  </h5>
                  <ul className="space-y-1.5 text-xs text-ash-700">
                    {verdict.alternatives.map((alt, idx) => (
                      <li key={idx} className="flex items-start gap-2 leading-relaxed">
                        <CornerDownRight className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                        <span>{alt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Confidence & Attacker Substitutions */}
          <div className="space-y-6">
            {/* Confidence Container */}
            <div className="p-5 rounded-xl bg-white border border-canvas-border shadow-subtle space-y-4">
              <h4 className="text-xs font-mono font-bold uppercase text-ash-700 tracking-wider">
                Evidence Provenance & Confidence
              </h4>

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-3xl font-bold font-mono text-ash-900">
                    {(verdict.confidence.score * 100).toFixed(1)}%
                  </span>
                  <span className="text-xs font-mono text-ash-500 block mt-0.5">
                    Confidence Level: <strong className="text-brand-orange">{verdict.confidence.level}</strong>
                  </span>
                </div>

                <div className="w-12 h-12 rounded-full border-2 border-ash-200 flex items-center justify-center bg-ash-50">
                  <span className="text-xs font-mono font-bold text-ash-700">
                    {verdict.confidence.level[0]}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-ash-500 space-y-1 pt-2 border-t border-canvas-border font-sans">
                <p>Weighting based on source veracity:</p>
                <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-ash-600 pt-0.5">
                  <span>Observed: 1.0</span>
                  <span>Inventory: 0.9</span>
                  <span>Inferred: 0.5</span>
                  <span>Assumed: 0.0</span>
                </div>
              </div>
            </div>

            {/* Substituted Paths (Attacker Re-planning) */}
            <div className="p-5 rounded-xl bg-white border border-canvas-border shadow-subtle space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-mono font-bold uppercase text-ash-800 tracking-wider flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-brand-orange" />
                  <span>Adversary Pivot Routes</span>
                </h4>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ash-100 text-ash-600 border border-ash-200">
                  {verdict.delta.substituted_paths.length} detected
                </span>
              </div>

              {verdict.delta.substituted_paths.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-ash-600">
                    When primary pathways were obstructed, lateral movement substituted through:
                  </p>
                  <ul className="space-y-1.5 text-xs font-mono text-ash-800">
                    {verdict.delta.substituted_paths.map((p, idx) => (
                      <li key={idx} className="p-2 rounded bg-ash-50 border border-ash-200">
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-ash-500">
                  Zero emergent substitution pathways identified. Threat vector isolated.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-10 text-center rounded-xl bg-white border border-canvas-border text-ash-400 font-sans shadow-subtle">
          <p className="text-xs">Select proposed controls above to initiate sandbox evaluation.</p>
        </div>
      )}
    </div>
  );
};
