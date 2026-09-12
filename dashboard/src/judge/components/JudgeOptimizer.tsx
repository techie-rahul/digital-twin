import React, { useState } from 'react';
import { SlidersHorizontal, Check, X, Sparkles } from 'lucide-react';
import { OptimizationResult, OptimizationPortfolio } from '../../types/api';
import { VerdictBadge } from './VerdictBadge';

interface JudgeOptimizerProps {
  optimizationResult: OptimizationResult | null;
  onRunOptimization: (budget: number, maxCrit: number) => void;
  isOptimizing: boolean;
}

const PortfolioCard: React.FC<{ title: string; portfolio: OptimizationPortfolio; budget: number; positive: boolean }> = ({
  title,
  portfolio,
  budget,
  positive,
}) => (
  <div className={`p-4 rounded-xl bg-white border shadow-subtle space-y-2.5 ${positive ? 'border-emerald-300' : 'border-red-200'}`}>
    <div className="flex items-center justify-between pb-2.5 border-b border-canvas-border">
      <h3 className="text-sm font-bold text-ash-900">{title}</h3>
      <VerdictBadge verdict={portfolio.recommendation} />
    </div>
    <div className="space-y-1.5 text-xs font-mono">
      <div className="flex items-center justify-between">
        <span className="text-ash-500">Selected controls:</span>
        <span className="text-ash-900 font-semibold text-right">{portfolio.control_names.join(', ') || 'None'}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-ash-500">Total cost:</span>
        <span className="text-ash-900 font-semibold">${portfolio.total_cost.toLocaleString()} / ${budget.toLocaleString()}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-ash-500">Threat path reduction:</span>
        <span className={`font-bold ${positive ? 'text-emerald-700' : 'text-ash-900'}`}>{portfolio.risk_reduction_pct.toFixed(1)}%</span>
      </div>
    </div>
    <div className={`p-2 rounded-lg space-y-1 ${positive ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
      <div className={`flex items-center gap-1.5 text-xs font-semibold font-mono ${positive ? 'text-emerald-800' : 'text-red-800'}`}>
        {positive ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
        <span>{positive ? 'Business continuity preserved' : 'Collateral disruption caused'}</span>
      </div>
      {portfolio.broken_flows.length > 0 ? (
        <ul className={`text-[11px] font-mono space-y-0.5 ${positive ? 'text-emerald-700' : 'text-red-700'}`}>
          {portfolio.broken_flows.map((f) => (
            <li key={f.id}>• {f.id}: {f.name} (Crit {f.criticality})</li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-ash-500 font-mono">No flows above the criticality ceiling are broken.</p>
      )}
    </div>
    <p className="text-xs text-ash-600 leading-relaxed">{portfolio.rationale}</p>
  </div>
);

export const JudgeOptimizer: React.FC<JudgeOptimizerProps> = ({ optimizationResult, onRunOptimization, isOptimizing }) => {
  const [budget, setBudget] = useState(5000);
  const [maxCrit, setMaxCrit] = useState(3);

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-white border border-canvas-border shadow-subtle space-y-4">
        <h2 className="text-sm font-bold text-ash-900">Control portfolio optimizer</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-ash-700 font-semibold">Budget ceiling</span>
              <span className="text-brand-orange font-bold">${budget.toLocaleString()}</span>
            </div>
            <input
              type="range"
              min="1000"
              max="8000"
              step="500"
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="w-full h-1.5 bg-ash-200 rounded-lg appearance-none cursor-pointer accent-[#FF5500]"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-ash-700 font-semibold">Max disruption criticality</span>
              <span className="text-ash-900 font-bold">Crit ≤ {maxCrit}</span>
            </div>
            <input
              type="range"
              min="1"
              max="4"
              step="1"
              value={maxCrit}
              onChange={(e) => setMaxCrit(Number(e.target.value))}
              className="w-full h-1.5 bg-ash-200 rounded-lg appearance-none cursor-pointer accent-ash-700"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={() => onRunOptimization(budget, maxCrit)}
            disabled={isOptimizing}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              isOptimizing ? 'bg-ash-200 text-ash-400 cursor-not-allowed' : 'bg-brand-orange hover:bg-brand-orange-hover text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isOptimizing ? 'Calculating…' : 'Compute optimal portfolio'}</span>
          </button>
        </div>
      </div>

      {optimizationResult && (
        <div className="space-y-4">
          <div className={`grid grid-cols-1 gap-4 ${optimizationResult.naive_portfolio ? 'lg:grid-cols-2' : ''}`}>
            {optimizationResult.naive_portfolio && (
              <PortfolioCard title="Unconstrained portfolio" portfolio={optimizationResult.naive_portfolio} budget={optimizationResult.budget} positive={false} />
            )}
            <PortfolioCard title="Constrained safe portfolio" portfolio={optimizationResult.constrained_portfolio} budget={optimizationResult.budget} positive />
          </div>
          {optimizationResult.contrast_summary && (
          <div className="p-3.5 rounded-xl bg-ash-100 border border-canvas-border">
            <h4 className="text-xs font-mono font-bold uppercase text-ash-700 mb-1">Decision impact</h4>
            <p className="text-xs text-ash-700 leading-relaxed whitespace-pre-line">{optimizationResult.contrast_summary}</p>
          </div>
          )}
        </div>
      )}
    </div>
  );
};
