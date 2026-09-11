import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  PauseCircle,
  ArrowRight,
  TrendingUp,
  Sparkles,
  Zap,
  Lock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Compass,
} from 'lucide-react';
import { DecisionHeroData, DecisionVerdictType, DemoPresetId } from '../types/presets';

interface DecisionHeroCardProps {
  heroData: DecisionHeroData;
  onApplyAlternative?: (targetPresetId: DemoPresetId) => void;
  onOpenEvidence?: () => void;
  activePresetId?: DemoPresetId;
}

export const DecisionHeroCard: React.FC<DecisionHeroCardProps> = ({
  heroData,
  onApplyAlternative,
  onOpenEvidence,
  activePresetId,
}) => {
  const { proposedChange, suggestedAlternative } = heroData;

  const renderVerdictBadge = (verdict: DecisionVerdictType, labelOverride?: string, isLarge = false) => {
    const text = labelOverride || verdict;

    switch (verdict) {
      case 'BLOCK':
        return (
          <motion.div
            key="badge-block"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-mono font-bold tracking-wide border shadow-subtle ${
              isLarge
                ? 'bg-red-50 text-red-700 border-red-300 ring-2 ring-red-500/20 text-sm md:text-base'
                : 'bg-red-50 text-red-700 border-red-300 text-xs'
            }`}
          >
            <span className="text-base">⛔</span>
            <span>{text}</span>
          </motion.div>
        );

      case 'DEPLOY':
        return (
          <motion.div
            key="badge-deploy"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-mono font-bold tracking-wide border shadow-subtle ${
              isLarge
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-2 ring-emerald-500/20 text-sm md:text-base'
                : 'bg-emerald-50 text-emerald-800 border-emerald-300 text-xs'
            }`}
          >
            <span className="text-base">✅</span>
            <span>{text}</span>
          </motion.div>
        );

      case 'REVIEW':
        return (
          <motion.div
            key="badge-review"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-mono font-bold tracking-wide border shadow-subtle ${
              isLarge
                ? 'bg-amber-50 text-amber-900 border-amber-300 ring-2 ring-amber-500/20 text-sm md:text-base'
                : 'bg-amber-50 text-amber-900 border-amber-300 text-xs'
            }`}
          >
            <span className="text-base">⚠️</span>
            <span>{text}</span>
          </motion.div>
        );

      case 'STANDBY':
      default:
        return (
          <motion.div
            key="badge-standby"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-mono font-bold tracking-wide border shadow-subtle ${
              isLarge
                ? 'bg-ash-100 text-ash-800 border-ash-300 ring-1 ring-ash-400/20 text-sm md:text-base'
                : 'bg-ash-100 text-ash-800 border-ash-300 text-xs'
            }`}
          >
            <span className="text-base">⏸️</span>
            <span>{text}</span>
          </motion.div>
        );
    }
  };

  return (
    <div className="relative rounded-2xl bg-white border border-canvas-border shadow-card overflow-hidden transition-all duration-300">
      {/* Decorative Brand Orange Accent Stripe */}
      <div className="h-1.5 w-full bg-gradient-to-r from-brand-orange via-[#FF7733] to-amber-500" />

      <div className="p-4 md:p-5 space-y-3.5">
        {/* Top Meta Bar */}
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-canvas-border">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-ash-100 text-ash-700 border border-ash-200">
              CAB Change Verdict
            </span>
            {proposedChange.isBusinessOutage && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-red-100 text-red-700 border border-red-200 animate-pulse">
                P1 Outage Detected
              </span>
            )}
          </div>
          {onOpenEvidence && (
            <button
              onClick={onOpenEvidence}
              className="text-[11px] font-mono text-ash-500 hover:text-brand-orange transition-colors flex items-center gap-1 cursor-pointer font-medium"
            >
              <span>Inspect Statistical Proof</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* 2-Column Comparative Layout: Proposed Change vs Recommended Alternative */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          {/* Left Column: Proposed Change */}
          <div
            className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 transition-colors ${
              proposedChange.isBusinessOutage
                ? 'bg-red-50/40 border-red-200 ring-1 ring-red-300/30'
                : 'bg-ash-50/70 border-canvas-border'
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-ash-400 block">
                    PROPOSED CHANGE
                  </span>
                  <h3 className="text-sm md:text-base font-bold text-ash-900 font-sans tracking-tight">
                    {proposedChange.title}
                  </h3>
                </div>
                <div className="shrink-0">
                  {renderVerdictBadge(proposedChange.verdict, proposedChange.verdictLabel)}
                </div>
              </div>

              {/* Trade-off Lines */}
              <div className="space-y-1.5 text-xs font-sans">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-brand-orange-light text-brand-orange border border-brand-orange-border shrink-0">
                    {proposedChange.pathReductionPct > 0 ? `-${proposedChange.pathReductionPct.toFixed(0)}% Paths` : 'Baseline'}
                  </span>
                  <span className="text-ash-700 truncate font-medium">
                    {proposedChange.securityImpact}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold shrink-0 ${
                    proposedChange.isBusinessOutage
                      ? 'bg-red-100 text-red-800 border border-red-200'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}>
                    {proposedChange.isBusinessOutage ? 'P1 OUTAGE' : 'OPERATIONAL'}
                  </span>
                  <span className={`truncate font-medium ${proposedChange.isBusinessOutage ? 'text-red-900 font-semibold' : 'text-ash-700'}`}>
                    {proposedChange.businessImpact}
                  </span>
                </div>
              </div>
            </div>

            {proposedChange.verdictSubtext && (
              <p className="text-[11px] font-mono text-ash-500 pt-1 border-t border-black/5 truncate">
                {proposedChange.verdictSubtext}
              </p>
            )}
          </div>

          {/* Right Column: Suggested Alternative */}
          <div className="p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-200 flex flex-col justify-between gap-3 shadow-2xs">
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-800 block">
                    RECOMMENDED ALTERNATIVE
                  </span>
                  <h3 className="text-sm md:text-base font-bold text-emerald-950 font-sans tracking-tight">
                    {suggestedAlternative.title}
                  </h3>
                </div>
                <div className="shrink-0">
                  {renderVerdictBadge(suggestedAlternative.verdict, suggestedAlternative.verdictLabel)}
                </div>
              </div>

              {/* Metrics */}
              <div className="space-y-1.5 text-xs font-sans">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                    PROTECTION
                  </span>
                  <span className="text-ash-800 truncate font-medium">
                    {suggestedAlternative.securityImpact}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-200 text-emerald-900 border border-emerald-300 shrink-0">
                    BUSINESS SAFE
                  </span>
                  <span className="text-emerald-900 truncate font-semibold">
                    {suggestedAlternative.businessImpact}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <div className="flex items-center justify-between pt-1 border-t border-emerald-200/60 gap-2">
              <span className="text-[11px] font-mono text-emerald-800 truncate">
                Residual: {suggestedAlternative.residualRoute}
              </span>
              {suggestedAlternative.canApply && suggestedAlternative.targetPresetId && onApplyAlternative && (
                <button
                  onClick={() => onApplyAlternative(suggestedAlternative.targetPresetId!)}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-mono font-bold shadow-subtle transition-all active:scale-[0.98] cursor-pointer"
                  title="Apply this recommended alternative scenario immediately"
                >
                  <span>Apply Fix</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Statistical Ribbon */}
        <div className="pt-2 border-t border-canvas-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] font-mono text-ash-500">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3 h-3 text-brand-orange" />
            <span>Wilson CI (95%): <strong className="text-ash-700">{proposedChange.confidenceLevel} ({proposedChange.confidenceScore}%)</strong></span>
            <span className="text-ash-300">•</span>
            <span>Deterministic Graph Traversal</span>
          </div>

          <div className="text-ash-400">
            Digital Twin Policy Evaluation Engine
          </div>
        </div>
      </div>
    </div>
  );
};
