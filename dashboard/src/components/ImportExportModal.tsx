import React, { useState, useRef } from 'react';
import { X, Upload, Download, FileJson, FileSpreadsheet, CheckCircle2, AlertOctagon, RefreshCw } from 'lucide-react';
import { apiClient } from '../api/client';
import { Twin, ImportSummary } from '../types/api';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTwin: Twin;
  onTwinImported: (twin: Twin) => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  onClose,
  currentTwin,
  onTwinImported,
}) => {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');
  const [importFormat, setImportFormat] = useState<'json' | 'csv'>('json');
  const [customTwinId, setCustomTwinId] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [successSummary, setSuccessSummary] = useState<ImportSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [detailedErrors, setDetailedErrors] = useState<string[]>([]);

  const jsonInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleResetFeedback = () => {
    setSuccessSummary(null);
    setErrorMessage(null);
    setDetailedErrors([]);
  };

  const handleJsonUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    handleResetFeedback();
    setIsUploading(true);

    const res = await apiClient.importTwinJson(file);
    setIsUploading(false);

    if (res.ok) {
      setSuccessSummary(res.data);
      // Fetch the updated twin structure to refresh the parent state
      try {
        const updated = await apiClient.getTwin();
        onTwinImported(updated);
      } catch (err) {
        console.error('Failed to reload twin after import:', err);
      }
    } else {
      setErrorMessage(res.error || 'Import validation failed');
      setDetailedErrors(res.errors || []);
    }
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    handleResetFeedback();
    setIsUploading(true);

    const res = await apiClient.importTwinCsv(file, customTwinId.trim() || undefined);
    setIsUploading(false);

    if (res.ok) {
      setSuccessSummary(res.data);
      try {
        const updated = await apiClient.getTwin();
        onTwinImported(updated);
      } catch (err) {
        console.error('Failed to reload twin after CSV import:', err);
      }
    } else {
      setErrorMessage(res.error || 'CSV validation failed');
      setDetailedErrors(res.errors || []);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ash-900/60 backdrop-blur-sm animate-fade-in font-sans">
      <div className="bg-white rounded-2xl border border-canvas-border shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-canvas-border flex items-center justify-between bg-ash-50/50">
          <div>
            <h2 className="text-base font-bold text-ash-900">Digital Twin Data Exchange</h2>
            <p className="text-xs text-ash-500 mt-0.5">
              Import and export full network topologies using JSON or multi-table CSV (ZIP)
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ash-400 hover:text-ash-700 hover:bg-ash-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="flex border-b border-canvas-border px-6 pt-3 gap-6 text-xs font-semibold">
          <button
            onClick={() => { setActiveTab('import'); handleResetFeedback(); }}
            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'import'
                ? 'border-brand-orange text-brand-orange'
                : 'border-transparent text-ash-400 hover:text-ash-700'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import Scenario</span>
          </button>
          <button
            onClick={() => { setActiveTab('export'); handleResetFeedback(); }}
            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'export'
                ? 'border-brand-orange text-brand-orange'
                : 'border-transparent text-ash-400 hover:text-ash-700'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Snapshot</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'import' ? (
            <div className="space-y-4">
              {/* Format selection */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setImportFormat('json'); handleResetFeedback(); }}
                  className={`flex-1 p-3 rounded-xl border text-left transition-all flex items-center gap-3 ${
                    importFormat === 'json'
                      ? 'border-brand-orange bg-brand-orange/5 text-ash-900 shadow-sm'
                      : 'border-canvas-border hover:border-ash-300 text-ash-600'
                  }`}
                >
                  <FileJson className={`w-6 h-6 ${importFormat === 'json' ? 'text-brand-orange' : 'text-ash-400'}`} />
                  <div>
                    <div className="text-xs font-bold">JSON Twin Schema</div>
                    <div className="text-[11px] text-ash-400">Single canonical .json file</div>
                  </div>
                </button>

                <button
                  onClick={() => { setImportFormat('csv'); handleResetFeedback(); }}
                  className={`flex-1 p-3 rounded-xl border text-left transition-all flex items-center gap-3 ${
                    importFormat === 'csv'
                      ? 'border-brand-orange bg-brand-orange/5 text-ash-900 shadow-sm'
                      : 'border-canvas-border hover:border-ash-300 text-ash-600'
                  }`}
                >
                  <FileSpreadsheet className={`w-6 h-6 ${importFormat === 'csv' ? 'text-brand-orange' : 'text-ash-400'}`} />
                  <div>
                    <div className="text-xs font-bold">CSV Multi-Table</div>
                    <div className="text-[11px] text-ash-400">ZIP archive of 5 tables</div>
                  </div>
                </button>
              </div>

              {importFormat === 'csv' && (
                <div>
                  <label className="block text-[11px] font-semibold text-ash-600 mb-1">
                    Custom Scenario ID (optional)
                  </label>
                  <input
                    type="text"
                    value={customTwinId}
                    onChange={(e) => setCustomTwinId(e.target.value)}
                    placeholder="e.g. twin-finbank-custom"
                    className="w-full text-xs px-3 py-2 border border-canvas-border rounded-lg focus:outline-none focus:border-brand-orange text-ash-800 font-mono"
                  />
                </div>
              )}

              {/* Upload Dropzone / Button */}
              <div className="border-2 border-dashed border-ash-200 rounded-xl p-6 text-center hover:border-brand-orange/50 transition-colors bg-ash-50/30">
                <input
                  type="file"
                  ref={jsonInputRef}
                  accept=".json"
                  onChange={handleJsonUpload}
                  className="hidden"
                />
                <input
                  type="file"
                  ref={csvInputRef}
                  accept=".zip"
                  onChange={handleCsvUpload}
                  className="hidden"
                />

                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="p-3 bg-white rounded-full border border-canvas-border shadow-subtle text-brand-orange">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div className="text-xs font-semibold text-ash-800">
                    {importFormat === 'json' ? 'Select or drop JSON file' : 'Select or drop CSV ZIP archive'}
                  </div>
                  <p className="text-[11px] text-ash-400 max-w-xs">
                    {importFormat === 'json'
                      ? 'Must contain assets, identities, edges, flows, and controls.'
                      : 'Must contain assets.csv, identities.csv, edges.csv, flows.csv, and controls.csv.'}
                  </p>

                  <button
                    disabled={isUploading}
                    onClick={() => {
                      if (importFormat === 'json') jsonInputRef.current?.click();
                      else csvInputRef.current?.click();
                    }}
                    className="mt-2 px-4 py-2 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-semibold rounded-lg shadow-subtle transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2"
                  >
                    {isUploading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Validating & Parsing...</span>
                      </>
                    ) : (
                      <span>Browse Files</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Feedback Callouts */}
              {successSummary && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-1.5 animate-fade-in">
                  <div className="flex items-center gap-2 font-bold text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Import Successful!</span>
                  </div>
                  <p className="text-[11px] text-emerald-700">{successSummary.message}</p>
                  <div className="grid grid-cols-3 gap-2 pt-2 text-[11px] font-mono text-emerald-800">
                    <div>Assets: <span className="font-bold">{successSummary.asset_count}</span></div>
                    <div>Edges: <span className="font-bold">{successSummary.edge_count}</span></div>
                    <div>Flows: <span className="font-bold">{successSummary.flow_count}</span></div>
                    <div>Controls: <span className="font-bold">{successSummary.control_count}</span></div>
                    <div>Identities: <span className="font-bold">{successSummary.identity_count}</span></div>
                    <div className="truncate">Hash: {successSummary.hash.slice(0, 8)}...</div>
                  </div>
                </div>
              )}

              {errorMessage && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-2 animate-fade-in">
                  <div className="flex items-center gap-2 font-bold text-rose-800">
                    <AlertOctagon className="w-4 h-4 text-rose-600" />
                    <span>Import Rejected: Validation Failure</span>
                  </div>
                  <p className="text-[11px] text-rose-700">{errorMessage}</p>

                  {detailedErrors.length > 0 && (
                    <div className="bg-white/80 rounded-lg p-2.5 max-h-36 overflow-y-auto border border-rose-200/60 font-mono text-[10px] space-y-1 text-rose-800">
                      {detailedErrors.map((err, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <span className="text-rose-400 font-bold">•</span>
                          <span>{err}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-ash-500">
                Export the currently active Digital Twin snapshot (<span className="font-mono font-semibold text-ash-700">{currentTwin.id}</span>).
                All assets, edges, business service flows, identities, and active controls are preserved deterministically.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <a
                  href={apiClient.getExportJsonUrl(currentTwin.id)}
                  download={`${currentTwin.id}.json`}
                  className="p-4 rounded-xl border border-canvas-border hover:border-brand-orange hover:bg-brand-orange/5 transition-all flex flex-col justify-between space-y-3 group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-ash-100 text-ash-600 group-hover:bg-brand-orange group-hover:text-white transition-colors">
                      <FileJson className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-ash-900">JSON Archive</div>
                      <div className="text-[10px] text-ash-400">Complete canonical schema</div>
                    </div>
                  </div>
                  <div className="text-right text-[11px] font-semibold text-brand-orange flex items-center justify-end gap-1">
                    <span>Download JSON</span>
                    <Download className="w-3 h-3" />
                  </div>
                </a>

                <a
                  href={apiClient.getExportCsvUrl(currentTwin.id)}
                  download={`${currentTwin.id}_csv.zip`}
                  className="p-4 rounded-xl border border-canvas-border hover:border-brand-orange hover:bg-brand-orange/5 transition-all flex flex-col justify-between space-y-3 group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-ash-100 text-ash-600 group-hover:bg-brand-orange group-hover:text-white transition-colors">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-ash-900">CSV ZIP Bundle</div>
                      <div className="text-[10px] text-ash-400">5 relational tables</div>
                    </div>
                  </div>
                  <div className="text-right text-[11px] font-semibold text-brand-orange flex items-center justify-end gap-1">
                    <span>Download ZIP</span>
                    <Download className="w-3 h-3" />
                  </div>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-canvas-border bg-ash-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-ash-200 text-ash-600 hover:bg-white text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
