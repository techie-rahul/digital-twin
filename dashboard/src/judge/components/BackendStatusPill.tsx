import React, { useState } from 'react';
import { ApiLogDrawer } from './ApiLogDrawer';

interface BackendStatusPillProps {
  isLive: boolean | null;
  onRecheck: () => void;
}

export const BackendStatusPill: React.FC<BackendStatusPillProps> = ({ isLive, onRecheck }) => {
  const [open, setOpen] = useState(false);

  const dot = isLive ? 'bg-emerald-600' : isLive === false ? 'bg-brand-orange' : 'bg-ash-300';
  const label = isLive ? 'Live' : isLive === false ? 'Mock' : 'Checking';

  return (
    <>
      <button
        onClick={() => {
          if (!open) onRecheck();
          setOpen((o) => !o);
        }}
        title="Backend status — click for recent API calls"
        className={`flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-mono transition-colors ${
          open ? 'bg-white border-ash-300 text-ash-900' : 'bg-ash-100 border-ash-200 text-ash-600 hover:bg-white'
        }`}
      >
        <span className={`inline-flex rounded-full h-2 w-2 ${dot}`} />
        <span className="text-[11px]">{label}</span>
      </button>
      {open && <ApiLogDrawer isLive={isLive} onClose={() => setOpen(false)} />}
    </>
  );
};
