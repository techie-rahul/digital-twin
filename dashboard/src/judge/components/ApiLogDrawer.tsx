import React from 'react';
import { X, Trash2 } from 'lucide-react';
import { useApiLog, clearApiLog } from '../apiLog';

interface ApiLogDrawerProps {
  isLive: boolean | null;
  onClose: () => void;
}

const fmtTime = (ts: number) => {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

// Debugging aid: recent /api calls with status, latency and whether the client fell back to a mock.
export const ApiLogDrawer: React.FC<ApiLogDrawerProps> = ({ isLive, onClose }) => {
  const entries = useApiLog();
  const mockCount = entries.filter((e) => e.fellBackToMock).length;

  return (
    <div className="fixed right-4 top-14 w-[600px] max-w-[calc(100vw-2rem)] max-h-[60vh] z-[60] flex flex-col rounded-xl bg-white border border-canvas-border shadow-card overflow-hidden font-mono text-xs">
      <div className="flex items-center justify-between px-3 py-2 border-b border-canvas-border bg-ash-100">
        <div className="flex items-center gap-2">
          <span className="font-bold text-ash-800">Backend calls</span>
          <span className="text-ash-500">
            {entries.length} logged{mockCount > 0 ? ` · ${mockCount} mock` : ''}
          </span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
            isLive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : isLive === false ? 'bg-brand-orange-light text-brand-orange border-brand-orange-border' : 'bg-ash-100 text-ash-500 border-ash-200'
          }`}>
            {isLive ? 'API live' : isLive === false ? 'API unreachable' : 'checking'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearApiLog}
            title="Clear log"
            className="p-1 rounded text-ash-500 hover:text-ash-900 hover:bg-white transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} className="p-1 rounded text-ash-500 hover:text-ash-900 hover:bg-white transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="overflow-y-auto">
        {entries.length === 0 ? (
          <p className="p-4 text-center text-ash-400">No API calls yet</p>
        ) : (
          <table className="w-full text-[11px]">
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-canvas-border last:border-0 hover:bg-ash-100/60">
                  <td className="px-3 py-1.5 text-ash-400 whitespace-nowrap">{fmtTime(e.ts)}</td>
                  <td className="px-2 py-1.5 font-bold text-ash-700">{e.method}</td>
                  <td className="px-2 py-1.5 text-ash-900 truncate max-w-[220px]" title={e.url}>
                    {e.url.replace(/^\/api/, '')}
                  </td>
                  <td className={`px-2 py-1.5 font-bold whitespace-nowrap ${e.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                    {e.status ?? 'ERR'}
                  </td>
                  <td className="px-2 py-1.5 text-ash-500 whitespace-nowrap">{e.durationMs}ms</td>
                  <td className="px-2 py-1.5">
                    {e.fellBackToMock && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand-orange-light text-brand-orange border border-brand-orange-border">
                        Mock
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-red-700 truncate max-w-[160px]" title={e.error}>
                    {e.error}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="px-3 py-1.5 border-t border-canvas-border text-[10px] text-ash-400">
        Mock = request failed or non-2xx, so the client served local fixture data. Health poll excluded.
      </div>
    </div>
  );
};
