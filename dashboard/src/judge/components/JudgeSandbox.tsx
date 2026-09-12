import React from 'react';
import { Check, XCircle, TrendingUp, CornerDownRight, Zap } from 'lucide-react';
import { Control, ChangeVerdict } from '../../types/api';
import { VerdictBadge } from './VerdictBadge';

interface JudgeSandboxProps {
  availableControls: Control[];
  selectedControlIds: string[];
  onToggleControl: (controlId: string) => void;
  verdict: ChangeVerdict | null;
  isEvaluating: boolean;
}

const RECOMMENDATION_SUBTEXT: Record<ChangeVerdict['recommendation'], string> = {
  DEPLOY: 'Safe to ship — no critical flow disruption detected.',
  BLOCK: 'Critical service disruption detected.',
  REVIEW: 'Approval required — disruption within tolerance.',
};

export const JudgeSandbox: React.FC<JudgeSandboxProps> = ({
  availableControls,
  selectedControlIds,
  onToggleControl,
  verdict,
  isEvaluating,
}) => {
  return (
    <div className="space-y-4">
      {/* Control selection */}
      <div className="p-4 rounded-xl bg-white border border-canvas-border shadow-subtle">
        <h2 className="text-sm font-bold text-ash-900">Security change sandbox</h2>
        <p className="text-xs text-ash-500 mt-0.5">
          Toggle proposed controls to see the attacker impact and any business flows they would break.
        </p>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {availableControls.map((ctrl) => {
            const isSelected = selectedControlIds.includes(ctrl.id);
            return (
              <div
                key={ctrl.id}
                onClick={() => onToggleControl(ctrl.id)}
                className={`p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  isSelected ? 'bg-brand-orange-light/40 border-brand-orange' : 'bg-white border-canvas-border hover:border-ash-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className={`text-xs font-semibold truncate ${isSelected ? 'text-brand-orange' : 'text-ash-900'}`}>{ctrl.name}</h4>
                    <span className="text-[10px] font-mono text-ash-400 block">{ctrl.id}</span>
                  </div>
                  <div className={`w-4 h-4 shrink-0 rounded flex items-center justify-center border ${isSelected ? 'bg-brand-orange border-brand-orange text-white' : 'border-ash-300 bg-white'}`}>
                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono pt-1.5 border-t border-canvas-border text-ash-500">
                  <span className="font-semibold text-ash-700">${ctrl.cost.toLocaleString()}</span>
                  <span className="text-emerald-700">{(ctrl.efficacy * 100).toFixed(0)}% efficacy</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {verdict ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            {/* Compact verdict banner */}
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-white border border-canvas-border shadow-subtle">
              <VerdictBadge verdict={verdict.recommendation} size="lg" />
              <div>
                <p className="text-xs text-ash-600">{RECOMMENDATION_SUBTEXT[verdict.recommendation]}</p>
                <p className="text-[11px] font-mono text-ash-400 mt-0.5">
                  Confidence: <strong className="text-ash-700">{verdict.confidence.level} ({(verdict.confidence.score * 100).toFixed(0)}%)</strong>
                </p>
              </div>
              {isEvaluating && <span className="ml-auto text-[10px] font-mono text-ash-400">Re-evaluating…</span>}
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-white border border-canvas-border shadow-subtle space-y-1">
                <span className="text-[10px] font-mono text-ash-400 uppercase">Path reduction (naive, industry metric)</span>
                <div className="text-xl font-bold font-mono text-ash-900">{verdict.delta.naive_path_reduction_pct.toFixed(1)}%</div>
              </div>
              <div className="p-3 rounded-xl bg-white border border-canvas-border shadow-subtle space-y-1">
                <span className="text-[10px] font-mono text-brand-orange uppercase flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Attacker cost increase (adaptive)
                </span>
                <div className="text-xl font-bold font-mono text-brand-orange">
                  {verdict.delta.effort_increase_pct !== null ? `+${verdict.delta.effort_increase_pct.toFixed(1)}%` : 'N/A (<20 trials)'}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-white border border-canvas-border shadow-subtle space-y-1">
                <span className="text-[10px] font-mono text-ash-400 uppercase">Breach probability delta</span>
                <div className={`text-xl font-bold font-mono ${verdict.delta.p_success_delta < 0 ? 'text-emerald-700' : 'text-ash-800'}`}>
                  {verdict.delta.p_success_delta > 0 ? '+' : ''}
                  {(verdict.delta.p_success_delta * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Broken flows */}
            {verdict.broken_flows.length > 0 && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 space-y-2">
                <div className="flex items-center gap-2 text-red-800 font-bold text-xs">
                  <XCircle className="w-4 h-4 text-red-600" />
                  <span>Severed operational dependencies ({verdict.broken_flows.length})</span>
                </div>
                <ul className="space-y-1 text-[11px] font-mono">
                  {verdict.broken_flows.map((flow) => (
                    <li key={flow.id} className="flex items-center justify-between p-1.5 rounded bg-white border border-red-200">
                      <span className="text-ash-900">{flow.id}: {flow.name} ({flow.src} → {flow.dst})</span>
                      <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 text-[10px] font-bold">Crit {flow.criticality}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Reasons + alternatives */}
            <div className="p-4 rounded-xl bg-white border border-canvas-border shadow-subtle space-y-3">
              <h4 className="text-xs font-mono font-bold uppercase text-ash-700">Decision rationale</h4>
              <ul className="space-y-1.5 text-xs text-ash-700">
                {verdict.reasons.map((reason, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-brand-orange mt-0.5 font-bold">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
              {verdict.alternatives.length > 0 && (
                <div className="pt-2 border-t border-canvas-border">
                  <h5 className="text-xs font-mono font-bold uppercase text-emerald-800 mb-1.5">Recommended remediation</h5>
                  <ul className="space-y-1.5 text-xs text-ash-700">
                    {verdict.alternatives.map((alt, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CornerDownRight className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{alt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-white border border-canvas-border shadow-subtle space-y-2">
              <h4 className="text-xs font-mono font-bold uppercase text-ash-800 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-brand-orange" />
                Adversary pivot routes
              </h4>
              {verdict.delta.substituted_paths.length > 0 ? (
                <ul className="space-y-1.5 text-xs font-mono text-ash-800">
                  {verdict.delta.substituted_paths.map((p, idx) => (
                    <li key={idx} className="p-2 rounded bg-ash-100 border border-ash-200">{p}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-ash-500">No emergent substitution paths — threat vector isolated.</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center rounded-xl bg-white border border-canvas-border text-ash-400 shadow-subtle">
          <p className="text-xs">Select proposed controls above to run the sandbox evaluation.</p>
        </div>
      )}
    </div>
  );
};
