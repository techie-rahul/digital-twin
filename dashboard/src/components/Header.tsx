import React from 'react';
import { Shield, RotateCcw, SlidersHorizontal, Layers, ShieldCheck } from 'lucide-react';

interface HeaderProps {
  activeTab: 'topology' | 'console' | 'optimizer';
  onTabChange: (tab: 'topology' | 'console' | 'optimizer') => void;
  isBackendLive: boolean;
  onReset: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  isBackendLive,
  onReset,
}) => {
  return (
    <header className="border-b border-canvas-border bg-white sticky top-0 z-50 px-6 py-3.5 transition-all">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand & System Information */}
        <div className="flex items-center gap-3">
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

        {/* View Navigation Tabs (ui-sh / shadcn tab group) */}
        <div className="flex items-center p-1 rounded-lg bg-ash-100 border border-ash-200 font-sans">
          <button
            onClick={() => onTabChange('topology')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs transition-all active:scale-[0.98] ${
              activeTab === 'topology'
                ? 'bg-white text-ash-900 shadow-subtle font-semibold border border-ash-200/80'
                : 'text-ash-500 hover:text-ash-800 hover:bg-white/40 font-medium'
            }`}
          >
            <Layers className={`w-3.5 h-3.5 ${activeTab === 'topology' ? 'text-brand-orange' : 'text-ash-400'}`} />
            <span>Asset Graph & Simulation</span>
          </button>

          <button
            onClick={() => onTabChange('console')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs transition-all active:scale-[0.98] ${
              activeTab === 'console'
                ? 'bg-white text-ash-900 shadow-subtle font-semibold border border-ash-200/80'
                : 'text-ash-500 hover:text-ash-800 hover:bg-white/40 font-medium'
            }`}
          >
            <ShieldCheck className={`w-3.5 h-3.5 ${activeTab === 'console' ? 'text-brand-orange' : 'text-ash-400'}`} />
            <span>Security Change Sandbox</span>
          </button>

          <button
            onClick={() => onTabChange('optimizer')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs transition-all active:scale-[0.98] ${
              activeTab === 'optimizer'
                ? 'bg-white text-ash-900 shadow-subtle font-semibold border border-ash-200/80'
                : 'text-ash-500 hover:text-ash-800 hover:bg-white/40 font-medium'
            }`}
          >
            <SlidersHorizontal className={`w-3.5 h-3.5 ${activeTab === 'optimizer' ? 'text-brand-orange' : 'text-ash-400'}`} />
            <span>Control Optimizer</span>
          </button>
        </div>

        {/* Engine Status & Reset Trigger */}
        <div className="flex items-center gap-3">
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
            <span className="text-ash-600 text-[11px]">
              {isBackendLive ? 'Engine Active (FastAPI)' : 'Engine Standby'}
            </span>
          </div>

          <button
            onClick={onReset}
            title="Reset model to baseline scenario"
            className="px-2.5 py-1 text-xs rounded-md bg-white hover:bg-ash-50 text-ash-600 hover:text-ash-900 border border-ash-200 shadow-subtle transition-all active:scale-[0.98] flex items-center gap-1.5 font-medium"
          >
            <RotateCcw className="w-3 h-3 text-ash-400" />
            <span>Reset</span>
          </button>
        </div>
      </div>
    </header>
  );
};
