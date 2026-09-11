import React from 'react';
import { Shield, FileCode2, FileCheck, FileText, Workflow, History, SlidersHorizontal } from 'lucide-react';

export type AppPresentationMode = 'story' | 'optimizer' | 'evidence' | 'chess-audit' | 'lineage';

interface HeaderProps {
  presentationMode: AppPresentationMode;
  onTogglePresentationMode: (mode: AppPresentationMode) => void;
  isBackendLive: boolean;
  currentTwinId?: string;
  onSelectTwinId?: (twinId: string) => void;
  onOpenDataStudio?: () => void;
  customTwinIds?: string[];
}

export const Header: React.FC<HeaderProps> = ({
  presentationMode,
  onTogglePresentationMode,
  isBackendLive,
  currentTwinId = 'twin-finbank-golden',
  onSelectTwinId,
  onOpenDataStudio,
  customTwinIds = [],
}) => {
  return (
    <header className="border-b border-canvas-border bg-white sticky top-0 z-50 px-4 md:px-6 py-2 transition-all">
      <div className="w-full max-w-[1440px] mx-auto flex items-center justify-between gap-3">
        {/* Brand & System Information */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-brand-orange text-white flex items-center justify-center shadow-xs shrink-0">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-bold tracking-tight text-ash-900 font-sans">
                Orchestra
              </h1>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-ash-100 text-ash-600 border border-ash-200">
                v2.1
              </span>
            </div>
            <p className="text-[10px] text-ash-400 font-sans hidden lg:block">
              Security Digital Twin & CAB Sandbox
            </p>
          </div>
        </div>

        {/* Primary Unified Navigation: Graph | Optimizer | Auditor | Evidence | Lineage */}
        <div className="flex items-center p-0.5 rounded-lg bg-ash-100 border border-ash-200 font-sans text-xs shrink-0 overflow-x-auto">
          <button
            onClick={() => onTogglePresentationMode('story')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              presentationMode === 'story'
                ? 'bg-white text-ash-900 shadow-xs font-semibold border border-ash-200/80'
                : 'text-ash-500 hover:text-ash-800'
            }`}
          >
            <FileCheck className={`w-3.5 h-3.5 ${presentationMode === 'story' ? 'text-brand-orange' : 'text-ash-400'}`} />
            <span>Decision Graph</span>
          </button>
          <button
            onClick={() => onTogglePresentationMode('optimizer')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              presentationMode === 'optimizer'
                ? 'bg-white text-ash-900 shadow-xs font-semibold border border-ash-200/80'
                : 'text-ash-500 hover:text-ash-800'
            }`}
          >
            <SlidersHorizontal className={`w-3.5 h-3.5 ${presentationMode === 'optimizer' ? 'text-brand-orange' : 'text-ash-400'}`} />
            <span>Portfolio Optimizer</span>
          </button>
          <button
            onClick={() => onTogglePresentationMode('chess-audit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              presentationMode === 'chess-audit'
                ? 'bg-white text-ash-900 shadow-xs font-semibold border border-ash-200/80'
                : 'text-ash-500 hover:text-ash-800'
            }`}
          >
            <Workflow className={`w-3.5 h-3.5 ${presentationMode === 'chess-audit' ? 'text-brand-orange' : 'text-ash-400'}`} />
            <span>Hop Auditor</span>
          </button>
          <button
            onClick={() => onTogglePresentationMode('evidence')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              presentationMode === 'evidence'
                ? 'bg-white text-ash-900 shadow-xs font-semibold border border-ash-200/80'
                : 'text-ash-500 hover:text-ash-800'
            }`}
          >
            <FileText className={`w-3.5 h-3.5 ${presentationMode === 'evidence' ? 'text-brand-orange' : 'text-ash-400'}`} />
            <span>Evidence</span>
          </button>
          <button
            onClick={() => onTogglePresentationMode('lineage')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              presentationMode === 'lineage'
                ? 'bg-white text-ash-900 shadow-xs font-semibold border border-ash-200/80'
                : 'text-ash-500 hover:text-ash-800'
            }`}
          >
            <History className={`w-3.5 h-3.5 ${presentationMode === 'lineage' ? 'text-brand-orange' : 'text-ash-400'}`} />
            <span>Lineage</span>
          </button>
        </div>

        {/* Right Tools: Scenario Selector, JSON Studio & Status */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Scenario / Dataset Selector */}
          {onSelectTwinId && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-ash-100 border border-ash-200 text-xs shadow-2xs">
              <span className="text-[10px] font-mono font-medium text-ash-500 uppercase tracking-wider hidden xl:inline">Env:</span>
              <select
                value={currentTwinId}
                onChange={(e) => onSelectTwinId(e.target.value)}
                className="bg-white border border-ash-200 text-ash-800 font-medium rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-orange cursor-pointer shadow-xs max-w-[130px] sm:max-w-none truncate"
              >
                <optgroup label="Benchmarks">
                  <option value="twin-finbank-golden">FinBank Core</option>
                  <option value="twin-cloudapp-easy">CloudApp SaaS</option>
                  <option value="twin-neobank-medium">Neobank Payments</option>
                  <option value="twin-globalbank-hard">GlobalBank Enterprise</option>
                  <option value="twin-medicare-hospital">Medicare Regional</option>
                </optgroup>
                {customTwinIds && customTwinIds.length > 0 && (
                  <optgroup label="Custom">
                    {customTwinIds.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}

          {/* JSON Data Studio Trigger */}
          {onOpenDataStudio && (
            <button
              onClick={onOpenDataStudio}
              title="Open Digital Twin JSON Data Studio"
              className="px-2.5 py-1 text-xs rounded-lg border border-ash-200 bg-white hover:bg-ash-50 text-ash-700 shadow-2xs transition-all active:scale-[0.98] flex items-center gap-1.5 font-medium cursor-pointer shrink-0"
            >
              <FileCode2 className="w-3.5 h-3.5 text-ash-500" />
              <span className="hidden sm:inline font-mono text-[11px]">JSON</span>
            </button>
          )}

          {/* Engine Status Indicator */}
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-mono transition-colors ${
              isBackendLive
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-ash-100 text-ash-600 border-ash-200'
            }`}
            title={isBackendLive ? 'FastAPI Decision Engine Live' : 'Deterministic Browser Engine'}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isBackendLive ? 'bg-emerald-600' : 'bg-ash-400'
              }`}
            />
            <span className="font-medium text-[11px] hidden sm:inline">
              {isBackendLive ? 'Live API' : 'Local'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
