import React from 'react';
import { Shield, RotateCcw, Database, LayoutDashboard, Route, GitBranch } from 'lucide-react';
import { BackendStatusPill } from './BackendStatusPill';

export type JudgeMode = 'story' | 'chess-audit' | 'lineage';

interface JudgeHeaderProps {
  mode: JudgeMode;
  onModeChange: (mode: JudgeMode) => void;
  isBackendLive: boolean | null;
  onRecheckBackend: () => void;
  activeTwinId: string;
  onOpenDatasets: () => void;
  onReset: () => void;
}

const MODES: { id: JudgeMode; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'story', label: 'Decision Story', Icon: LayoutDashboard },
  { id: 'chess-audit', label: 'Chess Auditor', Icon: Route },
  { id: 'lineage', label: 'Lineage', Icon: GitBranch },
];

export const JudgeHeader: React.FC<JudgeHeaderProps> = ({
  mode,
  onModeChange,
  isBackendLive,
  onRecheckBackend,
  activeTwinId,
  onOpenDatasets,
  onReset,
}) => {
  return (
    <header className="border-b border-canvas-border bg-white sticky top-0 z-50 px-6 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-orange text-white flex items-center justify-center shadow-subtle">
            <Shield className="w-[18px] h-[18px]" />
          </div>
          <h1 className="text-sm font-bold tracking-tight text-ash-900">FinBank Digital Twin</h1>
        </div>

        <div className="flex items-center p-1 rounded-lg bg-ash-100 border border-ash-200">
          {MODES.map(({ id, label, Icon }) => {
            const active = mode === id;
            return (
              <button
                key={id}
                onClick={() => onModeChange(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors whitespace-nowrap ${
                  active ? 'bg-white text-ash-900 font-semibold shadow-subtle border border-ash-200' : 'text-ash-500 hover:text-ash-800 font-medium'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-brand-orange' : 'text-ash-400'}`} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenDatasets}
            title="Switch scenario or import a custom twin"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded-md bg-ash-100 hover:bg-white text-ash-700 border border-ash-200 transition-colors"
          >
            <Database className="w-3.5 h-3.5 text-brand-orange" />
            <span className="truncate max-w-[140px]">{activeTwinId.replace('twin-', '')}</span>
          </button>

          <BackendStatusPill isLive={isBackendLive} onRecheck={onRecheckBackend} />

          <button
            onClick={onReset}
            title="Reset to baseline"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-white hover:bg-ash-100 text-ash-600 border border-ash-200 transition-colors"
          >
            <RotateCcw className="w-3 h-3 text-ash-400" />
            <span>Reset</span>
          </button>
        </div>
      </div>
    </header>
  );
};
