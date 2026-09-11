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
} from 'lucide-react';
import { DemoPresetId, DemoPresetConfig } from '../types/presets';
import { DEMO_PRESETS } from '../data/presetsData';

interface DemoPresetBarProps {
  activePresetId: DemoPresetId;
  onSelectPreset: (presetId: DemoPresetId) => void;
}

export const DemoPresetBar: React.FC<DemoPresetBarProps> = ({
  activePresetId,
  onSelectPreset,
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

  return (
    <div className="rounded-2xl bg-white border border-canvas-border p-4 shadow-subtle space-y-3">
      {/* Top Banner: Pitch Demo Ribbon */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-canvas-border text-xs">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-orange opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-orange" />
          </span>
          <span className="font-mono font-bold uppercase tracking-wider text-ash-700 text-[11px]">
            Executive Pitch Flow • 4-Minute Change Story
          </span>
          <span className="hidden md:inline px-1.5 py-0.2 rounded text-[10px] font-mono text-ash-400 bg-ash-100 border border-ash-200">
            Keys 1-5
          </span>
        </div>

        <div className="text-[11px] font-mono text-ash-400 flex items-center gap-1">
          <Clock className="w-3 h-3 text-ash-400" />
          <span>Judges Q&A Interactive Mode</span>
        </div>
      </div>

      {/* 5 Preset Buttons Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {presetsList.map((preset) => {
          const isActive = activePresetId === preset.id;

          return (
            <button
              key={preset.id}
              onClick={() => onSelectPreset(preset.id)}
              className={`relative flex items-center gap-2 px-3 py-2.5 rounded-xl text-left border transition-all duration-150 select-none active:scale-[0.98] ${
                isActive
                  ? getPresetActiveStyle(preset.id)
                  : 'bg-ash-50/70 hover:bg-white text-ash-700 border-canvas-border hover:border-ash-300'
              }`}
            >
              <div className="flex-shrink-0">{getPresetIcon(preset.id)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-xs font-mono font-bold truncate ${isActive ? 'font-extrabold' : ''}`}>
                    {preset.label}
                  </span>
                  {isActive && (
                    <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-brand-orange" />
                  )}
                </div>
                <span className="text-[10px] font-mono text-ash-400 block truncate">
                  {preset.shortLabel}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Preset Live Explainer Strip */}
      <div className="pt-1 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs font-mono">
        <div className="flex items-center gap-2 text-ash-600">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-ash-100 text-ash-700 border border-ash-200">
            SCENARIO STATE
          </span>
          <span className="font-sans text-xs text-ash-700 font-medium">
            {activePreset.tagline}
          </span>
        </div>

        <div className="text-[11px] text-ash-400 hidden lg:block">
          Click any preset to simulate the digital twin response
        </div>
      </div>
    </div>
  );
};
