import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Layers,
  ShieldAlert,
  Users,
  ShieldCheck,
  RefreshCw,
  Clock,
  Sparkles,
  Info,
  FileCode2,
} from 'lucide-react';
import { DemoPresetId, DemoPresetConfig } from '../types/presets';
import { DEMO_PRESETS } from '../data/presetsData';

interface DemoPresetBarProps {
  activePresetId: DemoPresetId;
  onSelectPreset: (presetId: DemoPresetId) => void;
  onOpenDataStudio?: () => void;
}

export const DemoPresetBar: React.FC<DemoPresetBarProps> = ({
  activePresetId,
  onSelectPreset,
  onOpenDataStudio,
}) => {
  const presetsList = Object.values(DEMO_PRESETS);
  const activePreset = DEMO_PRESETS[activePresetId];

  // Keyboard shortcut listener for 1-5
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === '1') onSelectPreset('preset-baseline');
      if (e.key === '2') onSelectPreset('preset-full-seg');
      if (e.key === '3') onSelectPreset('preset-mfa');
      if (e.key === '4') onSelectPreset('preset-scoped-seg');
      if (e.key === '5') onSelectPreset('preset-sync-drift');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSelectPreset]);

  const getPresetIcon = (id: DemoPresetId) => {
    switch (id) {
      case 'preset-baseline':
        return <Layers className="w-3.5 h-3.5 text-ash-500" />;
      case 'preset-full-seg':
        return <ShieldAlert className="w-3.5 h-3.5 text-red-600" />;
      case 'preset-mfa':
        return <Users className="w-3.5 h-3.5 text-amber-600" />;
      case 'preset-scoped-seg':
        return <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />;
      case 'preset-sync-drift':
        return <RefreshCw className="w-3.5 h-3.5 text-brand-orange animate-spin" style={{ animationDuration: '6s' }} />;
    }
  };

  const getPresetActiveStyle = (id: DemoPresetId) => {
    switch (id) {
      case 'preset-baseline':
        return 'bg-white text-ash-900 border-ash-300 shadow-card ring-1 ring-ash-300';
      case 'preset-full-seg':
        return 'bg-red-50 text-red-900 border-red-300 shadow-card ring-2 ring-red-400/40';
      case 'preset-mfa':
        return 'bg-amber-50 text-amber-900 border-amber-300 shadow-card ring-2 ring-amber-400/40';
      case 'preset-scoped-seg':
        return 'bg-emerald-50 text-emerald-900 border-emerald-300 shadow-card ring-2 ring-emerald-400/40';
      case 'preset-sync-drift':
        return 'bg-orange-50 text-orange-950 border-orange-300 shadow-card ring-2 ring-brand-orange/40';
    }
  };

  const getPresetMeta = (id: DemoPresetId) => {
    switch (id) {
      case 'preset-baseline':
        return {
          step: '01',
          title: 'Baseline',
          pill: 'UNPROTECTED',
          pillClass: 'bg-ash-100 text-ash-600 border border-ash-200',
          sub: 'Full Attack Surface',
        };
      case 'preset-full-seg':
        return {
          step: '02',
          title: 'Coarse Segregation',
          pill: '⛔ P1 OUTAGE',
          pillClass: 'bg-red-100 text-red-800 border border-red-200 font-extrabold',
          sub: 'Severs Flow F3',
        };
      case 'preset-mfa':
        return {
          step: '03',
          title: 'Human MFA',
          pill: '⚠️ REVIEW',
          pillClass: 'bg-amber-100 text-amber-800 border border-amber-200 font-bold',
          sub: 'Bypasses Service Svc',
        };
      case 'preset-scoped-seg':
        return {
          step: '04',
          title: 'Scoped Segregation',
          pill: '✅ APPROVED',
          pillClass: 'bg-emerald-100 text-emerald-800 border border-emerald-200 font-extrabold',
          sub: '0 Broken Flows',
        };
      case 'preset-sync-drift':
        return {
          step: '05',
          title: 'Contractor Drift',
          pill: '⚡ DRIFT',
          pillClass: 'bg-orange-100 text-orange-900 border border-orange-200 font-extrabold',
          sub: 'Role Bypass Detected',
        };
    }
  };

  return (
    <div className="rounded-2xl bg-white border border-canvas-border p-3.5 shadow-subtle space-y-2.5">
      {/* Top Banner: Storyline Header */}
      <div className="flex items-center justify-between pb-2 border-b border-canvas-border text-xs">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-orange opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-orange" />
          </span>
          <span className="font-mono font-bold uppercase tracking-wider text-ash-800 text-[11px]">
            Executive Change Scenarios
          </span>
          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono text-ash-500 bg-ash-100 border border-ash-200">
            Keys 1-5
          </span>
        </div>

        <div className="text-[11px] font-mono text-ash-400 hidden sm:flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-ash-400" />
          <span>Deterministic CAB Sandbox</span>
        </div>
      </div>

      {/* 5 Preset Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {presetsList.map((preset) => {
          const isActive = activePresetId === preset.id;
          const meta = getPresetMeta(preset.id);

          return (
            <button
              key={preset.id}
              onClick={() => onSelectPreset(preset.id)}
              className={`relative flex flex-col p-2.5 rounded-xl text-left border transition-all duration-150 select-none active:scale-[0.98] cursor-pointer ${
                isActive
                  ? getPresetActiveStyle(preset.id)
                  : 'bg-ash-50/70 hover:bg-white text-ash-700 border-canvas-border hover:border-ash-300 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-mono font-bold text-ash-400">
                  {meta.step}
                </span>
                <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono ${meta.pillClass}`}>
                  {meta.pill}
                </span>
              </div>

              <div className="flex items-center gap-1.5 min-w-0">
                <div className="shrink-0">{getPresetIcon(preset.id)}</div>
                <span className={`text-xs font-bold font-sans truncate ${isActive ? 'text-ash-900 font-extrabold' : 'text-ash-800'}`}>
                  {meta.title}
                </span>
              </div>

              <span className="text-[10px] font-mono text-ash-500 mt-1 block truncate">
                {meta.sub}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Scenario Live Explainer Strip */}
      <div className="pt-0.5 flex items-center gap-2 text-xs font-mono">
        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-ash-100 text-ash-700 border border-ash-200 shrink-0">
          SCENARIO STATE
        </span>
        <span className="font-sans text-xs text-ash-800 font-medium truncate">
          {activePreset.tagline}
        </span>
      </div>
    </div>
  );
};
