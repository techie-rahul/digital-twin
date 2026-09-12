import React, { useEffect } from 'react';
import { DemoPresetId } from '../../types/presets';
import { DEMO_PRESETS } from '../../data/presetsData';

interface JudgePresetBarProps {
  activePresetId: DemoPresetId;
  onSelectPreset: (presetId: DemoPresetId) => void;
}

const KEY_TO_PRESET: Record<string, DemoPresetId> = {
  '1': 'preset-baseline',
  '2': 'preset-full-seg',
  '3': 'preset-mfa',
  '4': 'preset-scoped-seg',
  '5': 'preset-sync-drift',
};

// Same per-preset accent colours as the classic DemoPresetBar
const ACTIVE_STYLE: Record<DemoPresetId, string> = {
  'preset-baseline': 'bg-white text-ash-900 border-ash-300 ring-1 ring-ash-300',
  'preset-full-seg': 'bg-red-50 text-red-900 border-red-300 ring-1 ring-red-400/40',
  'preset-mfa': 'bg-amber-50 text-amber-900 border-amber-300 ring-1 ring-amber-400/40',
  'preset-scoped-seg': 'bg-emerald-50 text-emerald-900 border-emerald-300 ring-1 ring-emerald-400/40',
  'preset-sync-drift': 'bg-orange-50 text-orange-950 border-orange-300 ring-1 ring-brand-orange/40',
};

export const JudgePresetBar: React.FC<JudgePresetBarProps> = ({ activePresetId, onSelectPreset }) => {
  const presets = Object.values(DEMO_PRESETS);

  // Keys 1-5 switch presets (ignored while typing or with modifiers held)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      const preset = KEY_TO_PRESET[e.key];
      if (preset) onSelectPreset(preset);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSelectPreset]);

  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {presets.map((preset) => {
        const isActive = preset.id === activePresetId;
        return (
          <button
            key={preset.id}
            onClick={() => onSelectPreset(preset.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold whitespace-nowrap transition-colors ${
              isActive ? ACTIVE_STYLE[preset.id] : 'bg-white text-ash-600 border-canvas-border hover:border-ash-300 hover:text-ash-900'
            }`}
          >
            <span
              className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-mono font-bold border ${
                isActive ? 'bg-white/70 border-current' : 'bg-ash-100 text-ash-500 border-ash-200'
              }`}
            >
              {preset.index}
            </span>
            <span>{preset.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
};
