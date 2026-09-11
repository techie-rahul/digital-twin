import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Upload,
  Download,
  Copy,
  Check,
  Code,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Trash2,
  FileCode2,
  HelpCircle,
  Database,
  Shield,
  Layers,
  Zap,
} from 'lucide-react';
import { Twin, Asset, Edge, ServiceFlow, Control, Identity } from '../types/api';
import { clientNormalizeTwin } from '../api/client';

interface JsonDataStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTwin: Twin | null;
  onImportTwin: (importedTwin: Twin) => Promise<void> | void;
}

// Pre-packaged test error and fuzzing payloads for instant 1-click edge case testing
const TEST_ERROR_PRESETS: Record<string, { name: string; category: string; description: string; content: string }> = {
  'err-syntax': {
    name: '01. Malformed JSON Syntax',
    category: 'Parser Crash Test',
    description: 'Unclosed array, trailing comma, unquoted keys. Tests syntax parser error handling.',
    content: `{\n  "status": "error",\n  "broken_syntax": true,\n  "unclosed_array": [1, 2, 3,\n  "trailing_comma": "oops",\n  "unquoted_key": 999,\n`,
  },
  'err-random-pizza': {
    name: '02. Random Data (Pizza Order)',
    category: 'Schema Mismatch',
    description: 'Completely unrelated e-commerce pizza order. Tests domain validation against non-twin schemas.',
    content: JSON.stringify({
      order_id: "pizza_order_#89234710",
      customer: {
        name: "Random Customer 404",
        phone: "+1-555-0199",
        address: "42 Galactic Way, Sector 7",
      },
      cart_items: [
        { item: "Mega Cheese Deep Dish", size: "Extra Large", quantity: 3, extra_cheese: true },
        { item: "Garlic Dough Knots", quantity: 12 },
      ],
      payment_method: "Dogecoin",
      crypto_tx_hash: "0x7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
    }, null, 2),
  },
  'err-type-confusion': {
    name: '03. Type Confusion & Nulls',
    category: 'Type Safety',
    description: 'Assets as boolean, edges as null, controls as mixed array with nulls.',
    content: JSON.stringify({
      id: 999999999999999999999,
      name: null,
      assets: false,
      edges: null,
      controls: ["not_an_object", 123, null, { weird: [null] }],
      criticality: -99999,
    }, null, 2),
  },
  'err-fuzzing': {
    name: '04. Security Fuzzing (XSS & SQLi)',
    category: 'Adversarial Injection',
    description: 'Contains script tags, SVG onerror handlers, SQL DROP table injections.',
    content: JSON.stringify({
      id: "twin-fuzzing-test",
      assets: [
        {
          id: "<script>alert('XSS')</script>",
          name: "'; DROP TABLE nodes; --",
          kind: "server",
          zone: "dmz",
          criticality: 1,
          crown_jewel: false,
        },
        {
          id: "db-sql-injection",
          name: "' UNION SELECT username, password FROM users --",
          kind: "database",
          zone: "prod",
          criticality: 5,
          crown_jewel: true,
        },
      ],
      edges: [
        {
          src: "<script>alert('XSS')</script>",
          dst: "db-sql-injection",
          technique: "injection_traversal",
        },
      ],
    }, null, 2),
  },
  'err-csv': {
    name: '05. Malicious Broken CSV',
    category: 'Format Error',
    description: 'Non-JSON file with formula injection and unclosed quotes.',
    content: `id,name,role,action\n1,admin,sysadmin,=cmd|' /C calc'!A0\n2,user,"unclosed quote,guest\n3,dev,contractor,\n`,
  },
  'err-empty': {
    name: '07. Empty Zero-Byte File',
    category: 'Boundary Test',
    description: 'Completely empty 0-byte file. Tests unexpected EOF handling.',
    content: ``,
  },
};

const STARTER_TEMPLATE = JSON.stringify({
  id: "twin-custom-enterprise",
  assets: [
    {
      id: "edge-gateway",
      name: "Public Edge Gateway",
      kind: "server",
      zone: "dmz",
      criticality: 1,
      crown_jewel: false,
    },
    {
      id: "auth-server",
      name: "Identity & Keycloak Service",
      kind: "server",
      zone: "corp",
      criticality: 3,
      crown_jewel: false,
    },
    {
      id: "ledger-db",
      name: "Core Financial Ledger Database",
      kind: "database",
      zone: "prod",
      criticality: 5,
      crown_jewel: true,
    },
  ],
  edges: [
    {
      src: "edge-gateway",
      dst: "auth-server",
      technique: "api_proxy",
    },
    {
      src: "auth-server",
      dst: "ledger-db",
      technique: "db_connect",
    },
  ],
  identities: [
    {
      id: "id-app-service",
      name: "Application Service Account",
      kind: "service_account",
      tier: 1,
    },
  ],
  flows: [
    {
      id: "flow-txn",
      name: "Financial Transaction Ingestion",
      src: "edge-gateway",
      dst: "ledger-db",
      technique: "api_proxy",
      criticality: 5,
    },
  ],
  controls: [
    {
      id: "ctrl-network-seg",
      name: "Zero Trust Database Segmentation",
      cost: 2500,
      blocks: ["db_connect"],
      scope: ["ledger-db"],
      efficacy: 0.95,
    },
  ],
}, null, 2);

export const JsonDataStudioModal: React.FC<JsonDataStudioModalProps> = ({
  isOpen,
  onClose,
  currentTwin,
  onImportTwin,
}) => {
  const [activeTab, setActiveTab] = useState<'import' | 'export' | 'schema'>('import');

  // Import State
  const [jsonInput, setJsonInput] = useState<string>('');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<Twin | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);

  // Export State
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Live validator on input change
  useEffect(() => {
    if (!jsonInput.trim()) {
      setValidationError(null);
      setParsedPreview(null);
      return;
    }

    try {
      const parsed = JSON.parse(jsonInput);
      try {
        const normalized = clientNormalizeTwin(parsed);
        setParsedPreview(normalized);
        setValidationError(null);
      } catch (schemaErr: any) {
        setParsedPreview(null);
        setValidationError(schemaErr.message || 'JSON is valid syntax, but does not match Digital Twin schema.');
      }
    } catch (syntaxErr: any) {
      setParsedPreview(null);
      setValidationError(`Syntax Error: ${syntaxErr.message}`);
    }
  }, [jsonInput]);

  if (!isOpen) return null;

  // File Drop Handler
  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      readFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      readFile(file);
    }
  };

  const readFile = (file: File) => {
    setSelectedFileName(file.name);
    setImportSuccessMessage(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setJsonInput(content || '');
    };
    reader.onerror = () => {
      setValidationError('Failed to read file from disk.');
    };
    reader.readAsText(file);
  };

  // Clipboard Paste Handler
  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setJsonInput(text);
        setSelectedFileName('Pasted from Clipboard');
        setImportSuccessMessage(null);
      }
    } catch {
      setValidationError('Clipboard read denied by browser permissions. Please paste directly into the box.');
    }
  };

  // Prettify Handler
  const handlePrettify = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      setJsonInput(JSON.stringify(parsed, null, 2));
      setValidationError(null);
    } catch (err: any) {
      setValidationError(`Cannot format invalid JSON: ${err.message}`);
    }
  };

  // Clear Handler
  const handleClear = () => {
    setJsonInput('');
    setSelectedFileName(null);
    setValidationError(null);
    setParsedPreview(null);
    setImportSuccessMessage(null);
  };

  // Load Preset
  const handleLoadPreset = (presetKey: string) => {
    const p = TEST_ERROR_PRESETS[presetKey];
    if (p) {
      setJsonInput(p.content);
      setSelectedFileName(`Test Preset: ${p.name}`);
      setImportSuccessMessage(null);
    }
  };

  // Load Current Twin into Import Editor
  const handleLoadCurrentTwinIntoEditor = () => {
    if (currentTwin) {
      setJsonInput(JSON.stringify(currentTwin, null, 2));
      setSelectedFileName(`Active: ${currentTwin.id}`);
      setImportSuccessMessage(null);
    }
  };

  // Submit Import
  const handleExecuteImport = async () => {
    if (!parsedPreview) return;
    setIsImporting(true);
    setValidationError(null);
    try {
      await onImportTwin(parsedPreview);
      setImportSuccessMessage(`Successfully imported and activated "${parsedPreview.id}"!`);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setValidationError(`Import failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsImporting(false);
    }
  };

  // Export Copy
  const handleCopyExport = async () => {
    if (!currentTwin) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(currentTwin, null, 2));
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  // Export Download
  const handleDownloadExport = () => {
    if (!currentTwin) return;
    const blob = new Blob([JSON.stringify(currentTwin, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentTwin.id || 'digital-twin'}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const lineCount = jsonInput ? jsonInput.split('\n').length : 0;
  const charCount = jsonInput.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ash-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white border border-canvas-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-canvas-border flex items-center justify-between bg-ash-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-orange/10 border border-brand-orange/20 text-brand-orange flex items-center justify-center shadow-xs">
              <FileCode2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-ash-900 font-sans">
                  Digital Twin JSON Data Studio
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-ash-100 text-ash-600 border border-ash-200">
                  v2.1
                </span>
              </div>
              <p className="text-xs text-ash-500 font-sans">
                Import custom topologies, test edge-case error files, or export verified twin snapshots
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ash-400 hover:text-ash-700 hover:bg-ash-100 transition-all cursor-pointer"
            title="Close modal (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-canvas-border flex items-center gap-6 bg-white text-xs font-semibold">
          <button
            onClick={() => setActiveTab('import')}
            className={`py-3 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'import'
                ? 'border-brand-orange text-brand-orange'
                : 'border-transparent text-ash-500 hover:text-ash-800'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import & Paste JSON</span>
            {parsedPreview && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('export')}
            className={`py-3 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'export'
                ? 'border-brand-orange text-brand-orange'
                : 'border-transparent text-ash-500 hover:text-ash-800'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Active Twin</span>
          </button>

          <button
            onClick={() => setActiveTab('schema')}
            className={`py-3 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'schema'
                ? 'border-brand-orange text-brand-orange'
                : 'border-transparent text-ash-500 hover:text-ash-800'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Schema Guide & Template</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* TAB 1: IMPORT & PASTE */}
          {activeTab === 'import' && (
            <div className="space-y-4">
              {/* File Upload Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                  isDragging
                    ? 'border-brand-orange bg-brand-orange/5 scale-[0.99]'
                    : 'border-ash-200 hover:border-ash-300 bg-ash-50/40 hover:bg-ash-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.txt,.csv,.yaml,.xml,*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="w-8 h-8 rounded-full bg-white border border-ash-200 text-ash-500 flex items-center justify-center shadow-xs">
                  <Upload className="w-4 h-4" />
                </div>
                <div className="text-xs">
                  <span className="font-semibold text-ash-800">Click to upload a file</span>
                  <span className="text-ash-400"> or drag and drop</span>
                </div>
                <p className="text-[11px] text-ash-400 font-mono">
                  Accepts .json, legacy scenario files, or random fuzz test files
                </p>
                {selectedFileName && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-ash-200/60 text-ash-700 text-[11px] font-mono font-medium">
                    <FileText className="w-3 h-3 text-brand-orange" />
                    <span>{selectedFileName}</span>
                  </div>
                )}
              </div>

              {/* Quick Actions & Presets Toolbars */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                {/* Left: Editor Actions */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handlePasteFromClipboard}
                    className="px-2.5 py-1 rounded-md bg-white border border-ash-200 hover:bg-ash-50 text-ash-700 font-medium shadow-xs flex items-center gap-1.5 cursor-pointer"
                    title="Paste text from your OS clipboard"
                  >
                    <Copy className="w-3.5 h-3.5 text-ash-400" />
                    <span>Paste Clipboard</span>
                  </button>

                  <button
                    onClick={handlePrettify}
                    className="px-2.5 py-1 rounded-md bg-white border border-ash-200 hover:bg-ash-50 text-ash-700 font-medium shadow-xs flex items-center gap-1.5 cursor-pointer"
                    title="Auto-format and indent JSON"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-brand-orange" />
                    <span>Prettify</span>
                  </button>

                  <button
                    onClick={handleClear}
                    className="px-2.5 py-1 rounded-md bg-white border border-ash-200 hover:bg-red-50 text-ash-500 hover:text-red-600 font-medium shadow-xs flex items-center gap-1.5 cursor-pointer"
                    title="Clear editor contents"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                </div>

                {/* Right: Quick Load Scenario & Error Test Files */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleLoadCurrentTwinIntoEditor}
                    className="px-2 py-1 rounded-md bg-ash-100 hover:bg-ash-200 text-ash-700 font-medium text-[11px] cursor-pointer"
                  >
                    Active Twin
                  </button>

                  <button
                    onClick={() => setJsonInput(STARTER_TEMPLATE)}
                    className="px-2 py-1 rounded-md bg-ash-100 hover:bg-ash-200 text-ash-700 font-medium text-[11px] cursor-pointer"
                  >
                    Starter Template
                  </button>

                  {/* Dropdown for Error / Fuzzing Suite */}
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        handleLoadPreset(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    defaultValue=""
                    className="bg-white border border-ash-200 text-ash-700 font-medium rounded px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-brand-orange cursor-pointer shadow-xs"
                  >
                    <option value="" disabled>
                      ⚡ Test Error / Fuzz Suite...
                    </option>
                    {Object.entries(TEST_ERROR_PRESETS).map(([key, item]) => (
                      <option key={key} value={key}>
                        {item.name} ({item.category})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Monospaced Editor Textarea */}
              <div className="relative rounded-xl border border-canvas-border bg-ash-900 text-ash-100 overflow-hidden shadow-inner">
                <textarea
                  value={jsonInput}
                  onChange={(e) => {
                    setJsonInput(e.target.value);
                    setImportSuccessMessage(null);
                  }}
                  placeholder="Paste or type raw JSON data here... (e.g. { 'id': 'twin-custom', 'assets': [...], 'edges': [...] })"
                  className="w-full h-64 p-4 font-mono text-xs bg-transparent text-ash-100 placeholder:text-ash-500 resize-y focus:outline-none leading-relaxed"
                  spellCheck={false}
                />
                <div className="px-4 py-1.5 bg-ash-950/80 border-t border-ash-800 flex items-center justify-between text-[11px] font-mono text-ash-400">
                  <div className="flex items-center gap-3">
                    <span>{lineCount} lines</span>
                    <span>{charCount} chars</span>
                  </div>
                  <div>
                    {parsedPreview ? (
                      <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                        <CheckCircle2 className="w-3 h-3" /> Valid Digital Twin
                      </span>
                    ) : validationError ? (
                      <span className="text-amber-400 flex items-center gap-1 font-semibold">
                        <AlertTriangle className="w-3 h-3" /> Issues Detected
                      </span>
                    ) : (
                      <span>Ready</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Real-Time Diagnostics & Validation Feedback Box */}
              {validationError && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-bold">Validation Inspector:</span>
                    <p className="font-mono text-[11px] text-amber-800 break-all">{validationError}</p>
                    <p className="text-[11px] text-amber-700">
                      Check the <strong>Schema Guide & Template</strong> tab for the required Digital Twin format.
                    </p>
                  </div>
                </div>
              )}

              {parsedPreview && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <div className="font-bold flex items-center gap-2">
                        <span>Schema Validated:</span>
                        <span className="font-mono text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-300">
                          {parsedPreview.id}
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-700 font-mono mt-0.5">
                        {parsedPreview.assets.length} assets • {parsedPreview.edges.length} edges • {parsedPreview.controls.length} controls • {parsedPreview.flows.length} flows • {parsedPreview.identities.length} identities
                      </p>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-emerald-700 bg-white px-2 py-1 rounded shadow-2xs border border-emerald-200">
                    Ready to Ingest
                  </span>
                </div>
              )}

              {importSuccessMessage && (
                <div className="p-3.5 rounded-xl bg-emerald-500 text-white text-xs flex items-center gap-2 font-medium shadow-md">
                  <Check className="w-4 h-4" />
                  <span>{importSuccessMessage}</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: EXPORT & COPY */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-ash-50 p-4 rounded-xl border border-canvas-border">
                <div>
                  <h3 className="text-sm font-bold text-ash-900">
                    Active Scenario: <span className="font-mono text-brand-orange">{currentTwin?.id}</span>
                  </h3>
                  <p className="text-xs text-ash-500 font-mono mt-0.5">
                    {currentTwin?.assets.length || 0} Assets • {currentTwin?.edges.length || 0} Edges • {currentTwin?.controls.length || 0} Controls • {currentTwin?.flows.length || 0} Flows
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyExport}
                    className="px-3 py-1.5 rounded-lg bg-white border border-ash-200 hover:bg-ash-50 text-ash-700 font-semibold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-ash-500" />
                        <span>Copy JSON</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleDownloadExport}
                    className="px-3 py-1.5 rounded-lg bg-brand-orange hover:bg-brand-orange-hover text-white font-semibold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .json</span>
                  </button>
                </div>
              </div>

              {/* Formatted Code View */}
              <div className="rounded-xl border border-canvas-border bg-ash-900 text-ash-100 p-4 font-mono text-xs max-h-96 overflow-y-auto leading-relaxed shadow-inner">
                <pre>{currentTwin ? JSON.stringify(currentTwin, null, 2) : '// No twin loaded'}</pre>
              </div>
            </div>
          )}

          {/* TAB 3: SCHEMA GUIDE & TEMPLATE */}
          {activeTab === 'schema' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <Layers className="w-4 h-4 text-blue-700" />
                  <span>Digital Twin Schema Specification</span>
                </div>
                <p className="text-blue-800 text-[11px] leading-relaxed">
                  The FinBank Security Digital Twin engine is built on deterministic content-addressed graph topologies.
                  Our parser supports both strict canonical schemas and tolerant normalization (it automatically adapts
                  fields like <code>nodes</code> to <code>assets</code>, <code>relationships</code> to <code>edges</code>,
                  and provides safe defaults for missing optional collections).
                </p>
              </div>

              {/* Schema Table */}
              <div className="border border-canvas-border rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-ash-100 text-ash-700 border-b border-canvas-border font-semibold font-mono text-[11px]">
                    <tr>
                      <th className="p-2.5">Field</th>
                      <th className="p-2.5">Type</th>
                      <th className="p-2.5">Description & Allowed Values</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-canvas-border font-sans text-ash-700">
                    <tr>
                      <td className="p-2.5 font-mono font-bold text-brand-orange">id</td>
                      <td className="p-2.5 font-mono text-[11px]">string</td>
                      <td className="p-2.5">Unique identifier for the digital twin (e.g. <code>twin-finbank-golden</code>).</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-mono font-bold text-brand-orange">assets</td>
                      <td className="p-2.5 font-mono text-[11px]">Array&lt;Asset&gt;</td>
                      <td className="p-2.5">
                        Objects containing: <code>id</code>, <code>name</code>, <code>kind</code> (<code>server | workstation | database | cloud_role | share</code>), <code>zone</code> (<code>dmz | corp | prod | mgmt</code>), <code>criticality</code> (1–5), <code>crown_jewel</code> (boolean).
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-mono font-bold text-brand-orange">edges</td>
                      <td className="p-2.5 font-mono text-[11px]">Array&lt;Edge&gt;</td>
                      <td className="p-2.5">
                        Directed attack routes between assets: <code>src</code> (asset ID), <code>dst</code> (asset ID), <code>technique</code> (ATT&CK technique ID or action name).
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-mono font-bold text-brand-orange">flows</td>
                      <td className="p-2.5 font-mono text-[11px]">Array&lt;ServiceFlow&gt;</td>
                      <td className="p-2.5">
                        Legitimate business dependencies: <code>id</code>, <code>name</code>, <code>src</code>, <code>dst</code>, <code>technique</code>, <code>criticality</code> (1–5; ≥4 must never be broken by defensive controls).
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-mono font-bold text-brand-orange">controls</td>
                      <td className="p-2.5 font-mono text-[11px]">Array&lt;Control&gt;</td>
                      <td className="p-2.5">
                        Defensive security controls: <code>id</code>, <code>name</code>, <code>cost</code>, <code>blocks</code> (technique IDs), <code>scope</code> (protected asset IDs), <code>efficacy</code> (0.0–1.0).
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-mono font-bold text-brand-orange">identities</td>
                      <td className="p-2.5 font-mono text-[11px]">Array&lt;Identity&gt;</td>
                      <td className="p-2.5">
                        User/machine identities: <code>id</code>, <code>name</code>, <code>kind</code> (<code>user | admin | service_account | cloud_role</code>), <code>tier</code> (0–3).
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Starter Template Copy Button */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-ash-500 font-mono text-[11px]">
                  Want to build your own environment from scratch?
                </span>
                <button
                  onClick={() => {
                    setJsonInput(STARTER_TEMPLATE);
                    setActiveTab('import');
                    setSelectedFileName('Starter Template');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white border border-ash-200 hover:bg-ash-50 text-ash-800 font-semibold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Code className="w-3.5 h-3.5 text-brand-orange" />
                  <span>Load Template into Editor</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-canvas-border bg-ash-50/50 flex items-center justify-between">
          <div className="text-xs text-ash-500">
            {activeTab === 'import' && parsedPreview && (
              <span className="text-emerald-700 font-medium">
                Ready to load {parsedPreview.assets.length} nodes & {parsedPreview.edges.length} edges into live topology.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-ash-600 hover:text-ash-900 hover:bg-ash-100 transition-all cursor-pointer"
            >
              Cancel
            </button>

            {activeTab === 'import' && (
              <button
                onClick={handleExecuteImport}
                disabled={!parsedPreview || isImporting}
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-subtle transition-all flex items-center gap-1.5 cursor-pointer ${
                  parsedPreview && !isImporting
                    ? 'bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.98]'
                    : 'bg-ash-300 text-ash-500 cursor-not-allowed'
                }`}
              >
                {isImporting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Ingesting...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    <span>Ingest & Load into Sandbox</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
