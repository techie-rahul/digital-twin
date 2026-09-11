import React from 'react';
import { Shield, RotateCcw, FileCode2, FileCheck, FileText, Workflow, History } from 'lucide-react';

interface HeaderProps {
  activeTab?: 'topology' | 'console' | 'optimizer';
  onTabChange?: (tab: 'topology' | 'console' | 'optimizer') => void;
  presentationMode: 'story' | 'evidence' | 'chess-audit' | 'lineage';
  onTogglePresentationMode: (mode: 'story' | 'evidence' | 'chess-audit' | 'lineage') => void;
  isBackendLive: boolean;
  onReset: () => void;
  currentTwinId?: string;
  onSelectTwinId?: (twinId: string) => void;
  onOpenDataStudio?: () => void;
  customTwinIds?: string[];
}

export const Header: React.FC<HeaderProps> = ({
  presentationMode,
  onTogglePresentationMode,
  isBackendLive,
  onReset,
  currentTwinId = 'twin-finbank-golden',
  onSelectTwinId,
  onOpenDataStudio,
  customTwinIds = [],
}) => {
  return (
    <header className="border-b border-canvas-border bg-white sticky top-0 z-50 px-4 md:px-6 py-2.5 transition-all">
      <div className="w-full max-w-[1440px] mx-auto flex items-center justify-between gap-3">
        {/* Brand & System Information */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-brand-orange text-white flex items-center justify-center shadow-subtle shrink-0">
            <Shield className="w-4.5 h-4.5" />
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
            <p className="text-[11px] text-ash-400 font-sans hidden md:block">
              Security Digital Twin & CAB Sandbox
            </p>
          </div>
        </div>

        {/* View Toggle: [ Decision Story ] | [ Evidence & Proof ] | [ Hop Auditor ] | [ Twin Lineage ] */}
        <div className="flex items-center p-1 rounded-xl bg-ash-100 border border-ash-200 font-sans shadow-subtle shrink-0">
          <button
            onClick={() => onTogglePresentationMode('story')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              presentationMode === 'story'
                ? 'bg-white text-ash-900 shadow-subtle border border-ash-200'
                : 'text-ash-500 hover:text-ash-800'
            }`}
          >
            <FileCheck className={`w-3.5 h-3.5 ${presentationMode === 'story' ? 'text-brand-orange' : 'text-ash-400'}`} />
            <span>Decision Story</span>
          </button>
          <button
            onClick={() => onTogglePresentationMode('evidence')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              presentationMode === 'evidence'
                ? 'bg-white text-ash-900 shadow-subtle border border-ash-200'
                : 'text-ash-500 hover:text-ash-800'
            }`}
          >
            <FileText className={`w-3.5 h-3.5 ${presentationMode === 'evidence' ? 'text-brand-orange' : 'text-ash-400'}`} />
            <span>Evidence & Proof</span>
          </button>
          <button
            onClick={() => onTogglePresentationMode('chess-audit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              presentationMode === 'chess-audit'
                ? 'bg-white text-ash-900 shadow-subtle border border-ash-200'
                : 'text-ash-500 hover:text-ash-800'
            }`}
          >
            <Workflow className={`w-3.5 h-3.5 ${presentationMode === 'chess-audit' ? 'text-brand-orange' : 'text-ash-400'}`} />
            <span>Hop Auditor</span>
          </button>
          <button
            onClick={() => onTogglePresentationMode('lineage')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              presentationMode === 'lineage'
                ? 'bg-white text-ash-900 shadow-subtle border border-ash-200'
                : 'text-ash-500 hover:text-ash-800'
            }`}
          >
            <History className={`w-3.5 h-3.5 ${presentationMode === 'lineage' ? 'text-brand-orange' : 'text-ash-400'}`} />
            <span>Twin Lineage</span>
          </button>
        </div>

        {/* Engine Status, Dataset & Import/Export */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Scenario / Dataset Selector */}
          {onSelectTwinId && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-ash-100 border border-ash-200 text-xs shadow-subtle">
              <span className="text-[10px] font-mono font-medium text-ash-500 uppercase tracking-wider hidden lg:inline">Scenario:</span>
              <select
                value={currentTwinId}
                onChange={(e) => onSelectTwinId(e.target.value)}
                className="bg-white border border-ash-200 text-ash-800 font-medium rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-orange cursor-pointer shadow-xs max-w-[140px] sm:max-w-none truncate"
              >
                <optgroup label="Benchmark Environments">
                  <option value="twin-finbank-golden">FinBank Core (Baseline)</option>
                  <option value="twin-cloudapp-easy">CloudApp MicroSaaS (Easy)</option>
                  <option value="twin-neobank-medium">Neobank Payments (Medium)</option>
                  <option value="twin-globalbank-hard">GlobalBank Enterprise (Hard)</option>
                  <option value="twin-medicare-hospital">Medicare Regional (Custom)</option>
                </optgroup>
                {customTwinIds && customTwinIds.length > 0 && (
                  <optgroup label="Imported Environments">
                    {customTwinIds.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </optgroup>
                )}
                {currentTwinId &&
                  !['twin-finbank-golden', 'twin-cloudapp-easy', 'twin-neobank-medium', 'twin-globalbank-hard', 'twin-medicare-hospital', ...(customTwinIds || [])].includes(currentTwinId) && (
                    <optgroup label="Active Twin">
                      <option value={currentTwinId}>{currentTwinId}</option>
                    </optgroup>
                  )}
              </select>
            </div>
          )}

          {/* Import / Export JSON Studio Trigger */}
          {onOpenDataStudio && (
            <button
              onClick={onOpenDataStudio}
              title="Open Digital Twin JSON Data Studio"
              className="px-2.5 py-1.5 text-xs rounded-lg bg-ash-900 hover:bg-black text-white shadow-subtle transition-all active:scale-[0.98] flex items-center gap-1.5 font-semibold cursor-pointer shrink-0"
            >
              <FileCode2 className="w-3.5 h-3.5 text-ash-300" />
              <span className="hidden sm:inline">JSON Data Studio</span>
              <span className="sm:hidden">JSON</span>
            </button>
          )}

          {/* Engine Status Indicator */}
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-mono transition-colors ${
              isBackendLive
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-ash-100 text-ash-600 border-ash-200'
            }`}
            title={isBackendLive ? 'Connected to FastAPI Decision Engine' : 'Running in Deterministic Browser Sandbox'}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isBackendLive ? 'bg-emerald-600' : 'bg-ash-400'
              }`}
            />
            <span className="font-medium text-[11px] hidden sm:inline">
              {isBackendLive ? 'Live API' : 'Local Engine'}
            </span>
          </div>

          {/* Reset Button */}
          <button
            onClick={onReset}
            title="Reset model to baseline scenario"
            className="p-1.5 text-xs rounded-lg bg-white hover:bg-ash-100 text-ash-600 hover:text-ash-900 border border-ash-200 shadow-subtle transition-all active:scale-[0.98] flex items-center justify-center cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 text-ash-500" />
          </button>
        </div>
      </div>
    </header>
  );
};
