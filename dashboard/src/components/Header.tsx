import React from 'react';
import { Shield, RotateCcw, SlidersHorizontal, Layers, ShieldCheck, Database } from 'lucide-react';

interface HeaderProps {
  activeTab: 'topology' | 'console' | 'optimizer';
  onTabChange: (tab: 'topology' | 'console' | 'optimizer') => void;
  presentationMode: 'story' | 'evidence' | 'chess-audit' | 'lineage';
  onTogglePresentationMode: (mode: 'story' | 'evidence' | 'chess-audit' | 'lineage') => void;
  isBackendLive: boolean;
  onReset: () => void;
  activeTwinId?: string;
  onOpenImportModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  presentationMode,
  onTogglePresentationMode,
  isBackendLive,
  onReset,
  activeTwinId = 'twin-finbank-golden',
  onOpenImportModal,
}) => {
  return (
    <header className="border-b border-canvas-border bg-white sticky top-0 z-50 px-6 py-3 transition-all">
      <div className="max-w-[1440px] mx-auto flex flex-col xl:flex-row items-center justify-between gap-3">
        {/* Brand & System Information */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-brand-orange text-white flex items-center justify-center shadow-subtle">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-ash-900 font-sans">
                FinBank Digital Twin
              </h1>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-ash-100 text-ash-600 border border-ash-200">
                v2.1
              </span>
            </div>
            <p className="text-xs text-ash-400 font-sans">
              Deterministic Graph Traversal & Change Advisory Sandbox
            </p>
          </div>
        </div>

        {/* View Toggle: [ 🎯 Decision Story ] | [ 🔍 Evidence ] | [ ♟️ Chess Piece Auditor ] | [ 🧬 Twin Lineage ] */}
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
            <span>🔍 Evidence</span>
          </button>
          <button
            onClick={() => onTogglePresentationMode('chess-audit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              presentationMode === 'chess-audit'
                ? 'bg-white text-brand-orange shadow-subtle border border-ash-200 ring-1 ring-brand-orange/30'
                : 'text-ash-500 hover:text-ash-800'
            }`}
          >
            <span>♟️ Chess Piece Auditor</span>
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

        {/* View Navigation Tabs (ui-sh / shadcn tab group) — Shown in Decision Story Mode */}
        {presentationMode === 'story' && (
          <div className="hidden lg:flex items-center p-1 rounded-lg bg-ash-100 border border-ash-200 font-sans shrink-0">
          <button
            onClick={() => {
              onTogglePresentationMode('story');
              onTabChange('topology');
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-all active:scale-[0.98] ${
              activeTab === 'topology' && presentationMode === 'story'
                ? 'bg-white text-ash-900 shadow-subtle font-semibold border border-ash-200/80'
                : 'text-ash-500 hover:text-ash-800 hover:bg-white/40 font-medium'
            }`}
          >
            <Layers className={`w-3.5 h-3.5 ${activeTab === 'topology' ? 'text-brand-orange' : 'text-ash-400'}`} />
            <span>Graph</span>
          </button>

          <button
            onClick={() => {
              onTogglePresentationMode('story');
              onTabChange('console');
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-all active:scale-[0.98] ${
              activeTab === 'console' && presentationMode === 'story'
                ? 'bg-white text-ash-900 shadow-subtle font-semibold border border-ash-200/80'
                : 'text-ash-500 hover:text-ash-800 hover:bg-white/40 font-medium'
            }`}
          >
            <ShieldCheck className={`w-3.5 h-3.5 ${activeTab === 'console' ? 'text-brand-orange' : 'text-ash-400'}`} />
            <span>Sandbox</span>
          </button>

          <button
            onClick={() => {
              onTogglePresentationMode('story');
              onTabChange('optimizer');
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-all active:scale-[0.98] ${
              activeTab === 'optimizer' && presentationMode === 'story'
                ? 'bg-white text-ash-900 shadow-subtle font-semibold border border-ash-200/80'
                : 'text-ash-500 hover:text-ash-800 hover:bg-white/40 font-medium'
            }`}
          >
            <SlidersHorizontal className={`w-3.5 h-3.5 ${activeTab === 'optimizer' ? 'text-brand-orange' : 'text-ash-400'}`} />
            <span>Optimizer</span>
          </button>
        </div>
        )}

        {/* Engine Status & Reset Trigger */}
        <div className="flex items-center gap-2.5">
          {/* Dataset Switcher / Import Modal Trigger */}
          <button
            onClick={onOpenImportModal}
            title="Switch enterprise scenario or upload custom digital twin JSON"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-bold rounded-lg bg-ash-100 hover:bg-white text-ash-800 hover:text-brand-orange border border-ash-200 shadow-subtle transition-all cursor-pointer active:scale-[0.98]"
          >
            <Database className="w-3.5 h-3.5 text-brand-orange" />
            <span className="truncate max-w-[130px] hidden sm:inline">
              {activeTwinId ? activeTwinId.replace('twin-', '') : 'Datasets'}
            </span>
            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-brand-orange-light text-brand-orange border border-brand-orange-border">
              Import
            </span>
          </button>

          <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-ash-100 border border-ash-200 text-xs font-mono">
            <span className="relative flex h-2 w-2">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isBackendLive ? 'bg-emerald-500' : 'bg-brand-orange'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isBackendLive ? 'bg-emerald-600' : 'bg-brand-orange'
                }`}
              />
            </span>
            <span className="text-ash-600 text-[11px] hidden sm:inline">
              {isBackendLive ? 'FastAPI Active' : 'Standby'}
            </span>
          </div>

          <button
            onClick={onReset}
            title="Reset model to baseline scenario"
            className="px-2.5 py-1 text-xs rounded-md bg-white hover:bg-ash-50 text-ash-600 hover:text-ash-900 border border-ash-200 shadow-subtle transition-all active:scale-[0.98] flex items-center gap-1.5 font-medium cursor-pointer"
          >
            <RotateCcw className="w-3 h-3 text-ash-400" />
            <span>Reset</span>
          </button>
        </div>
      </div>
    </header>
  );
};
