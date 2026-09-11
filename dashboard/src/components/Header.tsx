import React from 'react';
import { Shield, RotateCcw, FileCode2 } from 'lucide-react';

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
                FinBank Digital Twin
              </h1>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-ash-100 text-ash-600 border border-ash-200">
                v2.1
              </span>
            </div>
            <p className="text-[11px] text-ash-400 font-sans hidden md:block">
              Deterministic Graph Traversal & CAB Change Sandbox
            </p>
          </div>
        </div>

        {/* View Toggle: [ 🎯 Decision Story ] | [ 🔍 Evidence & Proof ] | [ ♟️ Hop Auditor ] | [ 🧬 Twin Lineage ] */}
        <div className="flex items-center p-1 rounded-xl bg-ash-100 border border-ash-200 font-sans shadow-subtle shrink-0">
          <button
            onClick={() => onTogglePresentationMode('story')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              presentationMode === 'story'
                ? 'bg-white text-ash-900 shadow-subtle border border-ash-200 ring-1 ring-brand-orange/30'
                : 'text-ash-500 hover:text-ash-800'
            }`}
          >
            <span>🎯 Decision Story</span>
          </button>
          <button
            onClick={() => onTogglePresentationMode('evidence')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              presentationMode === 'evidence'
                ? 'bg-white text-brand-orange shadow-subtle border border-ash-200 ring-1 ring-brand-orange/30'
                : 'text-ash-500 hover:text-ash-800'
            }`}
          >
            <span>🔍 Evidence & Proof</span>
          </button>
          <button
            onClick={() => onTogglePresentationMode('chess-audit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              presentationMode === 'chess-audit'
                ? 'bg-white text-brand-orange shadow-subtle border border-ash-200 ring-1 ring-brand-orange/30'
                : 'text-ash-500 hover:text-ash-800'
            }`}
          >
            <span>♟️ Hop Auditor</span>
          </button>
          <button
            onClick={() => onTogglePresentationMode('lineage')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              presentationMode === 'lineage'
                ? 'bg-white text-brand-orange shadow-subtle border border-ash-200 ring-1 ring-brand-orange/30'
                : 'text-ash-500 hover:text-ash-800'
            }`}
          >
            <span>🧬 Twin Lineage</span>
          </button>
        </div>

        {/* Engine Status, Dataset & Import/Export */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Scenario / Dataset Selector */}
          {onSelectTwinId && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-ash-100 border border-ash-200 text-xs shadow-subtle">
              <span className="text-[10px] font-mono font-bold text-ash-500 uppercase tracking-wider hidden lg:inline">Scenario:</span>
              <select
                value={currentTwinId}
                onChange={(e) => onSelectTwinId(e.target.value)}
                className="bg-white border border-ash-200 text-ash-800 font-semibold rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-orange cursor-pointer shadow-xs max-w-[140px] sm:max-w-none truncate"
              >
                <optgroup label="Default Benchmarks">
                  <option value="twin-finbank-golden">🏦 FinBank Golden (Baseline)</option>
                  <option value="twin-cloudapp-easy">☁️ CloudApp (Easy)</option>
                  <option value="twin-neobank-medium">💳 Neobank (Medium)</option>
                  <option value="twin-globalbank-hard">🌐 GlobalBank (Hard)</option>
                  <option value="twin-medicare-hospital">🏥 Medicare (Custom)</option>
                </optgroup>
                {customTwinIds && customTwinIds.length > 0 && (
                  <optgroup label="Imported Custom Scenarios">
                    {customTwinIds.map((id) => (
                      <option key={id} value={id}>
                        ⚡ {id}
                      </option>
                    ))}
                  </optgroup>
                )}
                {currentTwinId &&
                  !['twin-finbank-golden', 'twin-cloudapp-easy', 'twin-neobank-medium', 'twin-globalbank-hard', 'twin-medicare-hospital', ...(customTwinIds || [])].includes(currentTwinId) && (
                    <optgroup label="Active Custom Twin">
                      <option value={currentTwinId}>⚡ {currentTwinId}</option>
                    </optgroup>
                  )}
              </select>
            </div>
          )}

          {/* Import / Export JSON Studio Trigger */}
          {onOpenDataStudio && (
            <button
              onClick={onOpenDataStudio}
              title="Open Digital Twin JSON Data Studio (Import, Export, Copy-Paste, Error Testing)"
              className="px-2.5 py-1.5 text-xs rounded-lg bg-brand-orange hover:bg-brand-orange-hover text-white shadow-subtle transition-all active:scale-[0.98] flex items-center gap-1.5 font-bold cursor-pointer shrink-0"
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Import / Export JSON</span>
              <span className="sm:hidden">JSON</span>
            </button>
          )}

          {/* Engine Status Indicator (Resilient: Live vs Local Mode) */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition-colors ${
              isBackendLive
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
            title={isBackendLive ? 'Connected to FastAPI Decision Engine' : 'Running in Deterministic Browser Sandbox (Backend Reconnecting)'}
          >
            <span className="relative flex h-2 w-2">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isBackendLive ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isBackendLive ? 'bg-emerald-600' : 'bg-amber-600'
                }`}
              />
            </span>
            <span className="font-semibold text-[11px] hidden sm:inline">
              {isBackendLive ? 'Live Engine' : 'Local Mode'}
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
