import React, { useEffect } from 'react';
import { DemoPresetId } from '../types/presets';
import { DEMO_PRESETS } from '../data/presetsData';

interface DemoPresetBarProps {
  activePresetId: DemoPresetId;
  onSelectPreset: (presetId: DemoPresetId) => void;
  onOpenDataStudio?: () => void;
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

  const getPresetDot = (id: DemoPresetId) => {
    switch (id) {
      case 'preset-baseline':
        return 'bg-ash-400';
      case 'preset-full-seg':
        return 'bg-red-500';
      case 'preset-mfa':
        return 'bg-amber-500';
      case 'preset-scoped-seg':
        return 'bg-emerald-500';
      case 'preset-sync-drift':
        return 'bg-orange-500';
    }
  };

  const getPresetShortName = (id: DemoPresetId) => {
    switch (id) {
      case 'preset-baseline':
        return 'Baseline';
      case 'preset-full-seg':
        return 'Coarse Segregation';
      case 'preset-mfa':
        return 'Human MFA';
      case 'preset-scoped-seg':
        return 'Scoped Segregation';
      case 'preset-sync-drift':
        return 'Contractor Drift';
    }
  };

  return (
    <div className="rounded-xl bg-white border border-canvas-border px-3 py-2 shadow-subtle flex flex-col md:flex-row md:items-center justify-between gap-2.5">
      {/* Sleek Segmented Switcher */}
      <div className="flex items-center gap-1 overflow-x-auto p-0.5 rounded-lg bg-ash-100 border border-ash-200 text-xs">
        {presetsList.map((preset, index) => {
          const isActive = activePresetId === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => onSelectPreset(preset.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-white text-ash-900 font-semibold shadow-xs border border-ash-200/80'
                  : 'text-ash-500 hover:text-ash-900 hover:bg-white/50'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${getPresetDot(preset.id)} shrink-0`} />
              <span>{getPresetShortName(preset.id)}</span>
              <span className="text-[10px] font-mono text-ash-400 font-normal hidden sm:inline">
                {index + 1}
              </span>
            </button>
          );
        })}
      </div>

      {/* 1-Line Status Summary */}
      <div className="text-[11px] font-mono text-ash-500 flex items-center gap-2 truncate px-1">
        <span className="text-ash-400 hidden lg:inline">Status:</span>
        <span className="text-ash-700 font-medium truncate font-sans">
          {activePreset.tagline}
        </span>
      </div>
    </div>
  );
};
