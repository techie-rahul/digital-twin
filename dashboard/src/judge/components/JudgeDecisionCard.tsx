import React from 'react';
import { ShieldAlert, CheckCircle2, XCircle, Compass, ArrowRight } from 'lucide-react';
import { DecisionHeroData, DemoPresetId } from '../../types/presets';
import { VerdictBadge } from './VerdictBadge';

interface JudgeDecisionCardProps {
  heroData: DecisionHeroData;
  activePresetId?: DemoPresetId;
  onApplyAlternative?: (targetPresetId: DemoPresetId) => void;
}

export const JudgeDecisionCard: React.FC<JudgeDecisionCardProps> = ({ heroData, onApplyAlternative }) => {
  const { proposedChange, suggestedAlternative } = heroData;

  return (
    <div className="rounded-xl bg-white border border-canvas-border shadow-subtle p-5 space-y-4">
      {/* Proposed change: title + verdict */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-canvas-border">
        <div className="space-y-1">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-ash-500">
            Proposed change
          </span>
          <h2 className="text-lg font-bold text-ash-900 tracking-tight">{proposedChange.title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {proposedChange.isBusinessOutage && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-100 text-red-700 border border-red-200">
              P1 outage
            </span>
          )}
          <VerdictBadge verdict={proposedChange.verdict} label={proposedChange.verdictLabel} size="lg" />
        </div>
      </div>

      {/* Three metric tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-ash-100 border border-canvas-border space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wide text-ash-500 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-brand-orange" />
              Security impact
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-brand-orange-light text-brand-orange border border-brand-orange-border">
              {proposedChange.pathReductionPct > 0 ? `-${proposedChange.pathReductionPct.toFixed(0)}% paths` : 'Baseline'}
            </span>
          </div>
          <p className="text-xs font-semibold text-ash-900 leading-snug">{proposedChange.securityImpact}</p>
          {proposedChange.securityImpactDetail && (
            <p className="text-[11px] text-ash-500 font-mono leading-tight">{proposedChange.securityImpactDetail}</p>
          )}
        </div>

        <div className={`p-3 rounded-lg border space-y-1 ${proposedChange.isBusinessOutage ? 'bg-red-50 border-red-300' : 'bg-ash-100 border-canvas-border'}`}>
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-mono font-bold uppercase tracking-wide flex items-center gap-1.5 ${proposedChange.isBusinessOutage ? 'text-red-700' : 'text-ash-500'}`}>
              {proposedChange.isBusinessOutage ? <XCircle className="w-3.5 h-3.5 text-red-600" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
              Business impact
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${proposedChange.isBusinessOutage ? 'bg-red-200 text-red-900 border border-red-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
              {proposedChange.isBusinessOutage ? 'P1 outage' : 'Operational'}
            </span>
          </div>
          <p className={`text-xs font-semibold leading-snug ${proposedChange.isBusinessOutage ? 'text-red-900' : 'text-ash-900'}`}>
            {proposedChange.businessImpact}
          </p>
          {proposedChange.businessOutageLabel && (
            <p className="text-[11px] font-mono text-red-700">{proposedChange.businessOutageLabel}</p>
          )}
        </div>

        <div className="p-3 rounded-lg bg-ash-100 border border-canvas-border space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wide text-ash-500 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-ash-600" />
              Confidence
            </span>
          </div>
          <p className="text-xs font-semibold text-ash-900 leading-snug">
            {proposedChange.confidenceLevel} ({proposedChange.confidenceScore}%)
          </p>
          <p className="text-[11px] text-ash-500 font-mono leading-tight truncate" title={proposedChange.confidenceDetail}>
            {proposedChange.confidenceDetail}
          </p>
        </div>
      </div>

      {/* Alternative: single line */}
      <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-canvas-border text-xs">
        <span className="text-ash-500 font-mono">Alternative:</span>
        <span className="font-semibold text-ash-900">{suggestedAlternative.title}</span>
        <VerdictBadge verdict={suggestedAlternative.verdict} label={suggestedAlternative.verdictLabel} />
        <span className="font-mono text-ash-500 truncate max-w-[280px]" title={suggestedAlternative.residualRoute}>
          {suggestedAlternative.residualRoute}
        </span>
        {suggestedAlternative.canApply && suggestedAlternative.targetPresetId && onApplyAlternative && (
          <button
            onClick={() => onApplyAlternative(suggestedAlternative.targetPresetId!)}
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-mono font-bold transition-colors"
          >
            <span>Apply</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
