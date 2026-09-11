import React, { useState, useEffect } from 'react';
import {
  GitCommit,
  GitBranch,
  CheckCircle2,
  Copy,
  Check,
  ShieldCheck,
  Calendar,
  Layers,
  ChevronLeft,
  RotateCcw,
  Sparkles,
  ArrowDown,
  Hash,
} from 'lucide-react';
import { LineageOut, LineageNodeOut } from '../types/api';
import { apiClient } from '../api/client';

interface TwinLineageViewProps {
  onBackToDecisionStory?: () => void;
}

export const TwinLineageView: React.FC<TwinLineageViewProps> = ({
  onBackToDecisionStory,
}) => {
  const [twinId, setTwinId] = useState<string>('twin-finbank-golden');
  const [lineageData, setLineageData] = useState<LineageOut | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const fetchLineage = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.getLineage(twinId);
      setLineageData(res);
    } catch (e) {
      console.error('Failed to fetch lineage:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLineage();
  }, [twinId]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12 font-sans">
      {/* 1. Header Banner */}
      <div className="bg-white border border-canvas-border rounded-xl p-6 shadow-subtle flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl" role="img" aria-label="dna">
              🧬
            </span>
            <h2 className="text-lg font-bold text-ash-900 tracking-tight">
              Digital Twin Lineage & Cryptographic Hash Explorer
            </h2>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-brand-light text-brand-orange border border-brand-border">
              Immutable Provenance
            </span>
          </div>
          <p className="text-xs text-ash-500 mt-1 max-w-2xl">
            Cryptographically verify every scenario branch, cloned what-if model, and parent-child transition. Ensures compliance integrity and non-repudiation for security decision audits.
          </p>
        </div>

        {/* Back Link */}
        {onBackToDecisionStory && (
          <button
            onClick={onBackToDecisionStory}
            className="self-start lg:self-center px-3.5 py-1.5 rounded-lg border border-ash-200 text-xs font-semibold text-ash-700 hover:text-ash-900 hover:bg-ash-50 transition-all flex items-center gap-1.5 shadow-subtle cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-ash-400" />
            <span>Back to Decision Story</span>
          </button>
        )}
      </div>

      {/* 2. Control Bar */}
      <div className="bg-white border border-canvas-border rounded-xl p-4 shadow-subtle flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="text-xs font-mono font-semibold text-ash-500 uppercase tracking-wider">
            Twin Model ID:
          </label>
          <select
            value={twinId}
            onChange={(e) => setTwinId(e.target.value)}
            className="bg-ash-50 border border-ash-200 rounded-lg px-3 py-1.5 text-xs font-mono text-ash-800 focus:outline-none focus:ring-1 focus:ring-brand-orange"
          >
            <option value="twin-finbank-golden">twin-finbank-golden (Baseline Golden State)</option>
            <option value="twin-finbank-mfa-eval">twin-finbank-mfa-eval (Clone: MFA Evaluation)</option>
            <option value="twin-finbank-seg-eval">twin-finbank-seg-eval (Clone: Subnet Seg)</option>
          </select>
        </div>

        <button
          onClick={fetchLineage}
          disabled={isLoading}
          className="px-3.5 py-1.5 rounded-lg border border-ash-200 text-xs font-mono text-ash-700 hover:text-ash-900 hover:bg-ash-50 transition-all flex items-center gap-1.5 shadow-subtle cursor-pointer"
        >
          <RotateCcw className={`w-3.5 h-3.5 text-ash-400 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Lineage</span>
        </button>
      </div>

      {/* 3. Provenance Chain Visualizer */}
      <div className="bg-white border border-canvas-border rounded-xl p-6 shadow-subtle space-y-6">
        <div className="flex items-center justify-between border-b border-ash-100 pb-3">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-brand-orange" />
            <h3 className="text-xs font-bold font-mono text-ash-900 uppercase tracking-wider">
              Cryptographic Lineage Chain
            </h3>
          </div>
          <span className="text-xs font-mono text-emerald-600 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>SHA256 Deterministic Signature Active</span>
          </span>
        </div>

        {lineageData && lineageData.lineage.length > 0 ? (
          <div className="space-y-4 relative">
            {lineageData.lineage.map((node, index) => {
              const isRoot = index === 0;
              const isCurrent = node.twin_id === twinId;

              return (
                <React.Fragment key={node.twin_id}>
                  <div
                    className={`p-4 rounded-xl border transition-all ${
                      isCurrent
                        ? 'bg-white border-brand-orange shadow-orange-glow ring-2 ring-brand-orange/30'
                        : 'bg-ash-50/70 border-ash-200 hover:bg-white hover:border-ash-300'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono text-xs font-bold ${
                            isRoot
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          <GitCommit className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold font-mono text-ash-900">
                              {node.twin_id}
                            </span>
                            {isRoot && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-mono font-semibold">
                                Root Golden State
                              </span>
                            )}
                            {isCurrent && (
                              <span className="px-1.5 py-0.5 rounded bg-brand-light text-brand-orange border border-brand-border text-[10px] font-mono font-bold">
                                Selected Target
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-ash-400 font-mono">
                            {node.parent_id
                              ? `Derived from parent: ${node.parent_id}`
                              : 'Autonomous Origin (Zero Parents)'}
                          </span>
                        </div>
                      </div>

                      {/* Cryptographic SHA256 Hash Display */}
                      <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-ash-200 shadow-subtle">
                        <Hash className="w-3.5 h-3.5 text-ash-400" />
                        <span className="font-mono text-xs text-ash-700 font-medium">
                          sha256:{node.hash}
                        </span>
                        <button
                          onClick={() => handleCopy(`sha256:${node.hash}`)}
                          className="text-ash-400 hover:text-ash-700 transition-colors ml-1 cursor-pointer"
                          title="Copy SHA256 signature"
                        >
                          {copiedHash === `sha256:${node.hash}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Downward Lineage Arrow */}
                  {index < lineageData.lineage.length - 1 && (
                    <div className="flex justify-center py-1 text-ash-300">
                      <ArrowDown className="w-4 h-4" />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-xs font-mono text-ash-400">
            No lineage nodes registered for this twin model.
          </div>
        )}
      </div>
    </div>
  );
};
