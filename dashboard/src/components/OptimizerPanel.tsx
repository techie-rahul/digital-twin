import React, { useState } from 'react';
import { SlidersHorizontal, Check, X, Sparkles } from 'lucide-react';
import { OptimizationResult } from '../types/api';

interface OptimizerPanelProps {
  optimizationResult: OptimizationResult | null;
  onRunOptimization: (budget: number, maxCrit: number) => void;
  isOptimizing: boolean;
}

export const OptimizerPanel: React.FC<OptimizerPanelProps> = ({
  optimizationResult,
  onRunOptimization,
  isOptimizing,
}) => {
  const [budget, setBudget] = useState<number>(5000);
  const [maxCrit, setMaxCrit] = useState<number>(3);

  const handleOptimize = () => {
    onRunOptimization(budget, maxCrit);
  };

  return (
    <div className="space-y-6">
      {/* Parameter Controls & Sliders */}
      <div className="p-6 rounded-xl bg-white border border-canvas-border shadow-subtle space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-orange-light text-brand-orange border border-brand-orange-border">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-ash-900 tracking-tight">
              Control Portfolio Optimizer
            </h2>
            <p className="text-xs text-ash-500">
              Solves the 0/1 knapsack optimization problem maximizing threat mitigation subject to expenditure ceiling and business continuity constraints
            </p>
          </div>
        </div>

        {/* Sliders Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-canvas-border">
          {/* Budget Constraint Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-ash-700 font-semibold">Expenditure Ceiling (B):</span>
              <span className="text-brand-orange font-bold text-sm">
                ${budget.toLocaleString()}
              </span>
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
            <div className="flex justify-between text-[10px] font-mono text-ash-400">
              <span>$1,000</span>
              <span>$4,000</span>
              <span>$8,000</span>
            </div>
          </div>

          {/* Criticality Ceiling */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-ash-700 font-semibold">Disruption Criticality Ceiling:</span>
              <span className="text-ash-900 font-bold text-sm">
                Criticality ≤ {maxCrit} (Hard constraint)
              </span>
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
            <div className="flex justify-between text-[10px] font-mono text-ash-400">
              <span>Crit 1 (Strict)</span>
              <span>Crit 3 (Standard)</span>
              <span>Crit 4 (Permissive)</span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleOptimize}
            disabled={isOptimizing}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all active:scale-[0.98] ${
              isOptimizing
                ? 'bg-ash-200 text-ash-400 cursor-not-allowed'
                : 'bg-brand-orange hover:bg-brand-orange-hover text-white shadow-subtle'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isOptimizing ? 'Calculating Optimal Portfolio...' : 'Compute Optimal Portfolio'}</span>
          </button>
        </div>
      </div>

      {/* Comparison Results Cards */}
      {optimizationResult && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Box 1: Traditional Unconstrained Portfolio */}
            <div className="p-5 rounded-xl bg-white border border-red-200 space-y-3.5 shadow-subtle">
              <div className="flex items-center justify-between pb-3 border-b border-canvas-border">
                <div>
                  <span className="text-[10px] font-mono font-bold text-red-600 uppercase tracking-wider">
                    Isolated Threat Scoring
                  </span>
                  <h3 className="text-sm font-bold text-ash-900 mt-0.5">
                    Traditional Unconstrained Portfolio
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-red-100 text-red-800 border border-red-200">
                  CAB {optimizationResult.naive_portfolio.recommendation}
                </span>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-ash-500">Selected Controls:</span>
                  <span className="text-ash-900 font-semibold">
                    {optimizationResult.naive_portfolio.control_names.join(', ') || 'None'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-ash-500">Total Expenditure:</span>
                  <span className="text-ash-900 font-semibold">
                    ${optimizationResult.naive_portfolio.total_cost.toLocaleString()} / ${optimizationResult.budget.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-ash-500">Threat Path Reduction:</span>
                  <span className="text-ash-900 font-bold">
                    {optimizationResult.naive_portfolio.risk_reduction_pct.toFixed(1)}%
                  </span>
                </div>

                {/* Severed Flows Alert */}
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 space-y-1">
                  <div className="flex items-center gap-1.5 text-red-800 text-xs font-semibold font-mono">
                    <X className="w-3.5 h-3.5 text-red-600" />
                    <span>Collateral Disruption Caused:</span>
                  </div>
                  {optimizationResult.naive_portfolio.broken_flows.length > 0 ? (
                    <ul className="text-[11px] font-mono text-red-700 space-y-0.5">
                      {optimizationResult.naive_portfolio.broken_flows.map((f) => (
                        <li key={f.id}>
                          • {f.id}: {f.name} (Criticality {f.criticality})
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-ash-500 font-mono">Zero broken flows.</p>
                  )}
                </div>

                <p className="text-xs text-ash-600 leading-relaxed font-sans pt-1">
                  {optimizationResult.naive_portfolio.rationale}
                </p>
              </div>
            </div>

            {/* Box 2: Constrained Optimal Portfolio */}
            <div className="p-5 rounded-xl bg-white border border-emerald-300 space-y-3.5 shadow-subtle ring-1 ring-emerald-500/10">
              <div className="flex items-center justify-between pb-3 border-b border-canvas-border">
                <div>
                  <span className="text-[10px] font-mono font-bold text-emerald-700 uppercase tracking-wider">
                    Digital Twin Change Sandbox
                  </span>
                  <h3 className="text-sm font-bold text-ash-900 mt-0.5">
                    Constrained Safe Portfolio
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  CAB {optimizationResult.constrained_portfolio.recommendation}
                </span>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-ash-500">Selected Controls:</span>
                  <span className="text-emerald-800 font-semibold">
                    {optimizationResult.constrained_portfolio.control_names.join(', ') || 'None'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-ash-500">Total Expenditure:</span>
                  <span className="text-ash-900 font-semibold">
                    ${optimizationResult.constrained_portfolio.total_cost.toLocaleString()} / ${optimizationResult.budget.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-ash-500">Threat Path Reduction:</span>
                  <span className="text-emerald-700 font-bold">
                    {optimizationResult.constrained_portfolio.risk_reduction_pct.toFixed(1)}%
                  </span>
                </div>

                {/* Broken Flows Verification */}
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-800 text-xs font-semibold font-mono">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Business Continuity Preserved:</span>
                  </div>
                  <p className="text-[11px] text-emerald-700 font-mono">
                    Strictly safeguards F3 Payroll Transactions (Crit 5) and F6 Backup Vault (Crit 4).
                  </p>
                </div>

                <p className="text-xs text-ash-600 leading-relaxed font-sans pt-1">
                  {optimizationResult.constrained_portfolio.rationale}
                </p>
              </div>
            </div>
          </div>

          {/* Contrast Narrative Summary */}
          <div className="p-4 rounded-xl bg-ash-100 border border-canvas-border space-y-1.5">
            <h4 className="text-xs font-mono font-bold uppercase text-ash-700 tracking-wider">
              Decision Impact Analysis:
            </h4>
            <p className="text-xs text-ash-700 leading-relaxed whitespace-pre-line font-sans">
              {optimizationResult.contrast_summary}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
