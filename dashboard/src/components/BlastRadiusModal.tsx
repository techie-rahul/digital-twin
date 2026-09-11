import React from 'react';
import { X, Radio, AlertOctagon, Crown } from 'lucide-react';
import { BlastRadiusResponse } from '../types/api';

interface BlastRadiusModalProps {
  data: BlastRadiusResponse | null;
  onClose: () => void;
}

export const BlastRadiusModal: React.FC<BlastRadiusModalProps> = ({ data, onClose }) => {
  if (!data) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white border border-canvas-border p-6 shadow-xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-canvas-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand-orange-light border border-brand-orange-border flex items-center justify-center text-brand-orange">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold tracking-wider text-brand-orange uppercase">
                Downstream Reachability Analysis
              </span>
              <h3 className="text-base font-bold text-ash-900 tracking-tight">
                {data.source_asset_name}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-md text-ash-400 hover:text-ash-700 hover:bg-ash-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Core Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-ash-50 border border-canvas-border space-y-0.5">
            <span className="text-[10px] font-mono text-ash-500 uppercase">
              Reachable Entities
            </span>
            <div className="text-2xl font-bold font-mono text-ash-900">
              {data.reachable_asset_ids.length}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-ash-50 border border-canvas-border space-y-0.5">
            <span className="text-[10px] font-mono text-ash-500 uppercase">
              Cumulative Downstream Crit
            </span>
            <div className="text-2xl font-bold font-mono text-brand-orange">
              {data.total_downstream_criticality} pts
            </div>
          </div>
        </div>

        {/* Crown Jewels at Risk Banner */}
        {data.compromised_crown_jewels.length > 0 ? (
          <div className="p-3 rounded-lg bg-brand-orange-light border border-brand-orange-border space-y-2">
            <div className="flex items-center gap-1.5 text-brand-orange text-xs font-bold font-mono">
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>TIER-0 TARGETS DIRECTLY EXPOSED:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.compromised_crown_jewels.map((cj) => (
                <span
                  key={cj}
                  className="px-2 py-0.5 rounded bg-brand-orange text-white text-xs font-mono font-bold flex items-center gap-1 shadow-subtle"
                >
                  <Crown className="w-3 h-3 fill-current" />
                  <span>{cj}</span>
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-mono text-emerald-800">
            Zero Tier-0 targets directly reachable from this foothold.
          </div>
        )}

        {/* All Downstream Reachable Nodes */}
        <div className="space-y-2">
          <label className="text-[11px] font-mono font-bold uppercase text-ash-600">
            Downstream Graph Traversal:
          </label>
          <div className="flex flex-wrap gap-1.5">
            {data.reachable_asset_ids.map((id) => (
              <span
                key={id}
                className="px-2 py-0.5 rounded bg-ash-100 border border-ash-200 text-xs font-mono text-ash-700"
              >
                {id}
              </span>
            ))}
          </div>
        </div>

        {/* Direct Dependencies */}
        <div className="pt-3 border-t border-canvas-border text-xs text-ash-500 font-sans flex items-center justify-between">
          <span>Direct Outbound Transitions:</span>
          <span className="font-mono text-ash-800 font-medium">
            {data.direct_dependencies.join(', ') || 'None'}
          </span>
        </div>
      </div>
    </div>
  );
};
