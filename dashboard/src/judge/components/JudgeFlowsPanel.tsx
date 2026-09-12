import React from 'react';
import { ServiceFlow } from '../../types/api';

interface JudgeFlowsPanelProps {
  flows: ServiceFlow[];
  brokenFlowIds: string[];
  onHoverFlow?: (flowEdgeId: string | null) => void;
}

export const JudgeFlowsPanel: React.FC<JudgeFlowsPanelProps> = ({ flows, brokenFlowIds, onHoverFlow }) => {
  return (
    <div className="rounded-xl bg-white border border-canvas-border shadow-subtle p-4 space-y-2">
      <div className="flex items-center justify-between pb-2 border-b border-canvas-border">
        <h3 className="text-xs font-bold text-ash-900">Service flows</h3>
        <span className="text-[11px] font-mono text-ash-500">
          {flows.length - brokenFlowIds.length} active
          {brokenFlowIds.length > 0 && <span className="text-red-600 font-semibold"> · {brokenFlowIds.length} severed</span>}
        </span>
      </div>
      <div className="divide-y divide-canvas-border">
        {flows.map((flow) => {
          const isBroken = brokenFlowIds.includes(flow.id);
          return (
            <div
              key={flow.id}
              onMouseEnter={() => onHoverFlow?.(`flow-${flow.id}`)}
              onMouseLeave={() => onHoverFlow?.(null)}
              className="flex items-center gap-3 py-1.5 text-xs"
            >
              <span className="w-8 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-ash-100 text-ash-600 text-center">
                {flow.id}
              </span>
              <span className={`flex-1 min-w-0 truncate font-medium ${isBroken ? 'text-red-900' : 'text-ash-900'}`}>{flow.name}</span>
              <span className="font-mono text-[11px] text-ash-500 truncate max-w-[180px] hidden md:inline">
                {flow.src} → {flow.dst}
              </span>
              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${flow.criticality >= 4 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-ash-100 text-ash-600 border-ash-200'}`}>
                Crit {flow.criticality}
              </span>
              <span className={`shrink-0 w-16 text-right text-[10px] font-mono font-bold ${isBroken ? 'text-red-600' : 'text-ash-400'}`}>
                {isBroken ? 'Severed' : 'OK'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
