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

      {/* Main Container */}
      <div className="p-6 md:p-7 space-y-6">
        {/* =================================================================== */}
        {/* 1. TOP HALF: PROPOSED CHANGE */}
        {/* =================================================================== */}
        <AnimatePresence mode="wait">
          <motion.div
            key={proposedChange.title + activePresetId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="space-y-4"
          >
            {/* Header: Title + Big Verdict Badge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-canvas-border">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-ash-100 text-ash-600 border border-ash-200">
                    Proposed Change Evaluation
                  </span>
                  {proposedChange.isBusinessOutage && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-red-100 text-red-700 border border-red-200 animate-pulse">
                      P1 Outage Detected
                    </span>
                  )}
                </div>
                <h2 className="text-lg md:text-xl font-bold font-sans text-ash-900 tracking-tight flex items-center gap-2">
                  <span>PROPOSED CHANGE:</span>
                  <span className="text-ash-900 font-extrabold">{proposedChange.title}</span>
                </h2>
              </div>

              {/* Top Decision Verdict */}
              <div className="flex items-center gap-2.5 sm:self-start">
                <span className="text-xs font-mono font-bold uppercase text-ash-400 hidden lg:inline">
                  DECISION VERDICT:
                </span>
                {renderVerdictBadge(proposedChange.verdict, proposedChange.verdictLabel, true)}
              </div>
            </div>

            {/* Impact Metric Rows */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 font-sans">
              {/* Row 1: Security Impact */}
              <div className="p-3.5 rounded-xl bg-ash-50/80 border border-canvas-border space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wide text-ash-500 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-brand-orange" />
                    <span>Security Impact</span>
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-brand-orange-light text-brand-orange border border-brand-orange-border">
                    {proposedChange.pathReductionPct > 0
                      ? `-${proposedChange.pathReductionPct.toFixed(0)}% Paths`
                      : 'Baseline'}
                  </span>
                </div>
                <p className="text-xs font-semibold text-ash-900 leading-snug">
                  {proposedChange.securityImpact}
                </p>
                {proposedChange.securityImpactDetail && (
                  <p className="text-[11px] text-ash-500 font-mono leading-tight">
                    {proposedChange.securityImpactDetail}
                  </p>
                )}
              </div>

              {/* Row 2: Business Impact (The Outage Differentiator) */}
              <div
                className={`p-3.5 rounded-xl border space-y-1.5 transition-colors ${
                  proposedChange.isBusinessOutage
                    ? 'bg-red-50/90 border-red-300 ring-1 ring-red-400/30'
                    : 'bg-ash-50/80 border-canvas-border'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[11px] font-mono font-bold uppercase tracking-wide flex items-center gap-1.5 ${
                      proposedChange.isBusinessOutage ? 'text-red-700' : 'text-ash-500'
                    }`}
                  >
                    {proposedChange.isBusinessOutage ? (
                      <XCircle className="w-3.5 h-3.5 text-red-600" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    )}
                    <span>Business Impact</span>
                  </span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold ${
                      proposedChange.isBusinessOutage
                        ? 'bg-red-200 text-red-900 font-bold border border-red-300'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {proposedChange.isBusinessOutage ? 'P1 OUTAGE' : '100% OPERATIONAL'}
                  </span>
                </div>
                <p
                  className={`text-xs font-semibold leading-snug ${
                    proposedChange.isBusinessOutage ? 'text-red-900 font-bold' : 'text-ash-900'
                  }`}
                >
                  {proposedChange.businessImpact}
                </p>
                {proposedChange.businessOutageLabel && (
                  <p className="text-[11px] font-mono text-red-700 font-medium">
                    {proposedChange.businessOutageLabel}
                  </p>
                )}
              </div>

              {/* Row 3: Confidence & Statistical Proof */}
              <div className="p-3.5 rounded-xl bg-ash-50/80 border border-canvas-border space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wide text-ash-500 flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-ash-600" />
                    <span>Confidence Score</span>
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-ash-200 text-ash-700 border border-ash-300">
                    Wilson CI 95%
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
          </motion.div>
        </AnimatePresence>

        {/* =================================================================== */}
        {/* 2. DIVIDER WITH RECOMMENDATION CONNECTOR */}
        {/* =================================================================== */}
        <div className="relative py-1 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-dashed border-ash-300" />
          </div>
          <div className="relative px-4 py-1 rounded-full bg-white border border-ash-300 text-[10px] font-mono font-bold tracking-wider text-ash-600 uppercase shadow-subtle flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-brand-orange" />
            <span>Digital Twin Advisory Recommendation</span>
          </div>
        </div>

        {/* =================================================================== */}
        {/* 3. BOTTOM HALF: SUGGESTED ALTERNATIVE */}
        {/* =================================================================== */}
        <AnimatePresence mode="wait">
          <motion.div
            key={suggestedAlternative.title + activePresetId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut', delay: 0.05 }}
            className="p-4 md:p-5 rounded-xl bg-emerald-50/50 border border-emerald-200/90 shadow-subtle space-y-3.5"
          >
            {/* Alternative Title Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800 font-bold shadow-subtle">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-800">
                    Recommended Path to Green
                  </span>
                  <h3 className="text-base font-bold text-emerald-950 font-sans tracking-tight">
                    SUGGESTED ALTERNATIVE: {suggestedAlternative.title}
                  </h3>
                </div>
              </div>

              {/* Alternative Verdict + Action */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase text-emerald-800 hidden sm:inline">
                  DECISION VERDICT:
                </span>
                {renderVerdictBadge(suggestedAlternative.verdict, suggestedAlternative.verdictLabel)}

                {suggestedAlternative.canApply && suggestedAlternative.targetPresetId && onApplyAlternative && (
                  <button
                    onClick={() => onApplyAlternative(suggestedAlternative.targetPresetId!)}
                    className="ml-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-mono font-bold shadow-subtle transition-all active:scale-[0.98]"
                    title="Apply this recommended alternative scenario immediately"
                  >
                    <span>Apply Alternative</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Alternative Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-sans">
              <div className="p-2.5 rounded-lg bg-white/90 border border-emerald-200 space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wide text-emerald-800 block">
                  Security Impact:
                </span>
                <p className="font-semibold text-ash-900">
                  {suggestedAlternative.securityImpact}
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-white/90 border border-emerald-200 space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wide text-emerald-800 block">
                  Business Impact:
                </span>
                <p className="font-semibold text-emerald-900">
                  {suggestedAlternative.businessImpact}
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-white/90 border border-emerald-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wide text-emerald-800">
                    Residual Route:
                  </span>
                  <span className="text-[9px] font-mono text-ash-500 bg-ash-100 px-1 py-0.2 rounded border border-ash-200">
                    Documented
                  </span>
                </div>
                <p className="font-mono text-[11px] text-ash-700 leading-tight">
                  {suggestedAlternative.residualRoute}
                </p>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
