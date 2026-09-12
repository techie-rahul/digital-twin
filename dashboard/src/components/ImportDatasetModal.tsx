import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Upload,
  Database,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  Download,
  Building2,
  Activity,
  Cloud,
  Layers,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { TwinSummaryOut, Twin } from '../types/api';

interface ImportDatasetModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTwinId: string;
  onSelectTwin: (twinId: string) => void;
  onTwinImported?: (importedTwin: Twin) => void;
}

export const ImportDatasetModal: React.FC<ImportDatasetModalProps> = ({
  isOpen,
  onClose,
  activeTwinId,
  onSelectTwin,
  onTwinImported,
}) => {
  const [activeTab, setActiveTab] = useState<'profiles' | 'custom'>('profiles');
  const [twinsList, setTwinsList] = useState<TwinSummaryOut[]>([]);
  const [isLoadingTwins, setIsLoadingTwins] = useState<boolean>(false);

  // Custom JSON editor state
  const [jsonText, setJsonText] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch twin list whenever modal opens
  useEffect(() => {
    if (!isOpen) return;
    async function load() {
      setIsLoadingTwins(true);
      try {
        const list = await apiClient.listTwins();
        setTwinsList(list);
      } catch (err) {
        console.error('Failed to load twins:', err);
      } finally {
        setIsLoadingTwins(false);
      }
    }
    load();
  }, [isOpen]);

  // Real-time pre-flight inspection of custom JSON
  const parsedPreview = useMemo(() => {
    if (!jsonText.trim()) return null;
    try {
      const data = JSON.parse(jsonText);
      const assets = Array.isArray(data.assets) ? data.assets : [];
      const edges = Array.isArray(data.edges) ? data.edges : (Array.isArray(data.relationships) ? data.relationships : []);
      const flows = Array.isArray(data.flows) ? data.flows : [];
      const controls = Array.isArray(data.controls) ? data.controls : [];
      const crownJewels = assets.filter((a: any) => a.crown_jewel || a.criticality >= 5).map((a: any) => a.name || a.id);

      return {
        valid: true,
        id: data.id || 'custom-twin',
        assetCount: assets.length,
        edgeCount: edges.length,
        flowCount: flows.length,
        controlCount: controls.length,
        crownJewels,
        hasCrownJewel: crownJewels.length > 0,
      };
    } catch (e: any) {
      return {
        valid: false,
        error: e.message || 'Invalid JSON syntax',
      };
    }
  }, [jsonText]);

  if (!isOpen) return null;

  // Handle file drop or selection
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setJsonText(text);
      setErrorMessage(null);
    };
    reader.readAsText(file);
  };

  // Download template JSON
  const handleDownloadTemplate = async () => {
    try {
      const template = await apiClient.getTemplateJson();
      const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cyber-digital-twin-template.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download template:', err);
    }
  };

  // Submit custom JSON to API
  const handleImportSubmit = async () => {
    if (!parsedPreview || !parsedPreview.valid) {
      setErrorMessage('Please provide valid Digital Twin JSON.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const data = JSON.parse(jsonText);
      const res = await apiClient.importTwin(data);
      setSuccessMessage(`Successfully registered ${res.twin_id} (${res.asset_count} assets, ${res.edge_count} edges)`);
      
      // Fetch full twin and notify parent
      const newTwin = await apiClient.getTwin(res.twin_id);
      if (onTwinImported) onTwinImported(newTwin);
      onSelectTwin(res.twin_id);

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to import digital twin.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Profile icon & metadata helper
  const getProfileMeta = (id: string) => {
    if (id.includes('healthcare') || id.includes('hospital')) {
      return {
        title: 'Healthcare Hospital System',
        icon: Activity,
        accent: 'text-emerald-400 bg-emerald-950/60 border-emerald-800',
        badge: 'bg-emerald-900/40 text-emerald-300 border-emerald-700',
        desc: 'Epic EHR Core Database, PACS DICOM Radiology Imaging, Smart Infusion Pumps, and Clinical HL7 flows.',
        crownJewel: 'Epic Systems Core EHR Database',
      };
    }
    if (id.includes('cloud') || id.includes('ecommerce')) {
      return {
        title: 'AWS Cloud SaaS Infrastructure',
        icon: Cloud,
        accent: 'text-blue-400 bg-blue-950/60 border-blue-800',
        badge: 'bg-blue-900/40 text-blue-300 border-blue-700',
        desc: 'AWS API Gateway, ECS Fargate Microservices, Cognito IAM, S3 Data Lake, and Aurora Multi-Region Postgres.',
        crownJewel: 'Amazon Aurora Multi-Region Postgres',
      };
    }
    if (id === 'twin-finbank-golden') {
      return {
        title: 'FinBank Core Banking (Baseline)',
        icon: Building2,
        accent: 'text-orange-400 bg-orange-950/60 border-orange-800',
        badge: 'bg-orange-900/40 text-orange-300 border-orange-700',
        desc: 'Canonical 10-node banking architecture with DMZ, Corporate LAN, Bastion, SWIFT clearing, and Core Transaction Ledger.',
        crownJewel: 'Core Production Database (prod-db)',
      };
    }
    // Imported / custom twin — derive a label from its id
    const pretty = id.replace(/^twin-/, '').split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return {
      title: `${pretty} (Imported)`,
      icon: Database,
      accent: 'text-violet-400 bg-violet-950/60 border-violet-800',
      badge: 'bg-violet-900/40 text-violet-300 border-violet-700',
      desc: 'Custom digital twin ingested via JSON. Assets, edges, flows, and controls come from the uploaded topology.',
      crownJewel: 'Designated crown-jewel asset in uploaded twin',
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-gray-950 border border-gray-800 shadow-2xl overflow-hidden text-gray-100">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Enterprise Digital Twin Dataset Manager
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-gray-800 text-gray-300 border border-gray-700">
                  LIVE EVALUATOR MODE
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Switch pre-bundled enterprise environments or import custom JSON topologies for threat assessment.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center px-6 border-b border-gray-800 bg-gray-900/40">
          <button
            onClick={() => setActiveTab('profiles')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'profiles'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Pre-Bundled Enterprise Profiles ({twinsList.length || 3})</span>
          </button>

          <button
            onClick={() => setActiveTab('custom')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'custom'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>Upload / Paste Custom JSON</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {activeTab === 'profiles' ? (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-gray-900/90 border border-gray-800 text-xs text-gray-300 flex items-center justify-between">
                <span>Select an enterprise digital twin to simulate breach vectors and test control effectiveness:</span>
                <span className="font-mono text-[11px] text-gray-400">Active: <strong className="text-orange-400">{activeTwinId}</strong></span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {twinsList.map((item) => {
                  const meta = getProfileMeta(item.id);
                  const Icon = meta.icon;
                  const isActive = activeTwinId === item.id;

                  return (
                    <div
                      key={item.id}
                      className={`flex flex-col justify-between p-4 rounded-xl border transition-all ${
                        isActive
                          ? 'bg-gray-900/90 border-orange-500/70 shadow-[0_0_15px_rgba(249,115,22,0.15)] ring-1 ring-orange-500/50'
                          : 'bg-gray-900/50 border-gray-800 hover:border-gray-700 hover:bg-gray-900/80'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className={`p-2 rounded-lg border ${meta.accent}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          {isActive && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-orange-500/20 text-orange-300 border border-orange-500/40">
                              <CheckCircle2 className="w-3 h-3" /> ACTIVE
                            </span>
                          )}
                        </div>

                        <h4 className="text-sm font-bold text-white tracking-tight">
                          {meta.title}
                        </h4>
                        <p className="text-[11px] font-mono text-gray-500 mb-2.5 truncate">
                          id: {item.id}
                        </p>
                        <p className="text-xs text-gray-300 line-clamp-3 mb-4 leading-relaxed">
                          {meta.desc}
                        </p>
                      </div>

                      <div className="space-y-3 pt-3 border-t border-gray-800/80">
                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                          <div className="p-1.5 rounded bg-gray-950/60 border border-gray-800/80 text-gray-300">
                            <span className="text-gray-500 block text-[9px] uppercase">Assets</span>
                            <strong>{item.asset_count} nodes</strong>
                          </div>
                          <div className="p-1.5 rounded bg-gray-950/60 border border-gray-800/80 text-gray-300">
                            <span className="text-gray-500 block text-[9px] uppercase">Edges</span>
                            <strong>{item.edge_count} vectors</strong>
                          </div>
                        </div>

                        <div className="text-[11px] text-gray-400 font-sans">
                          <span className="text-gray-500 font-mono text-[10px] block uppercase">Crown Jewel Target:</span>
                          <span className="text-gray-200 font-medium truncate block">{meta.crownJewel}</span>
                        </div>

                        <button
                          onClick={() => {
                            onSelectTwin(item.id);
                            onClose();
                          }}
                          disabled={isActive}
                          className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                            isActive
                              ? 'bg-gray-800 text-gray-500 cursor-default'
                              : 'bg-orange-600 hover:bg-orange-500 text-white shadow-sm'
                          }`}
                        >
                          {isActive ? 'Currently Active' : (
                            <>
                              <span>Activate Scenario</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Custom JSON Tab */
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-gray-900 border border-gray-800">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider">
                    Paste or Drop Custom Topology JSON
                  </h4>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Evaluator can test their own network nodes, attack edges, identities, and defensive controls.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 text-xs font-mono font-medium transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-gray-400" />
                    <span>Download Template</span>
                  </button>

                  <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-mono font-semibold cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload .JSON File</span>
                    <input type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>
              </div>

              {/* JSON Textarea */}
              <div className="relative rounded-xl border border-gray-800 bg-gray-950 font-mono text-xs overflow-hidden">
                <textarea
                  value={jsonText}
                  onChange={(e) => {
                    setJsonText(e.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder='// Paste Digital Twin JSON schema here, or click "Download Template" to start...\n{\n  "id": "twin-evaluator-custom",\n  "assets": [...],\n  "edges": [...],\n  "flows": [...],\n  "controls": [...]\n}'
                  rows={13}
                  className="w-full p-4 bg-transparent text-gray-200 resize-none focus:outline-none focus:ring-1 focus:ring-orange-500 font-mono text-xs leading-relaxed"
                />
              </div>

              {/* Real-time Pre-Flight Validation Preview */}
              {parsedPreview && (
                <div
                  className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
                    parsedPreview.valid
                      ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                      : 'bg-red-950/40 border-red-800 text-red-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {parsedPreview.valid ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    )}
                    <div>
                      {parsedPreview.valid ? (
                        <span>
                          Valid Digital Twin schema: <strong>{parsedPreview.id}</strong> (
                          {parsedPreview.assetCount} assets, {parsedPreview.edgeCount} attack edges, {parsedPreview.flowCount} flows, {parsedPreview.controlCount} controls)
                        </span>
                      ) : (
                        <span>Syntax error: {parsedPreview.error}</span>
                      )}
                    </div>
                  </div>

                  {parsedPreview.valid && parsedPreview.hasCrownJewel && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-900/60 text-emerald-200 border border-emerald-700">
                      Target: {parsedPreview.crownJewels.join(', ')}
                    </span>
                  )}
                </div>
              )}

              {/* Feedback Toasts */}
              {errorMessage && (
                <div className="p-3 rounded-lg bg-red-900/40 border border-red-700 text-xs text-red-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {successMessage && (
                <div className="p-3 rounded-lg bg-emerald-900/40 border border-emerald-700 text-xs text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                  <span>{successMessage}</span>
                </div>
              )}

              {/* Submit Button */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setJsonText('')}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Clear Editor
                </button>

                <button
                  type="button"
                  onClick={handleImportSubmit}
                  disabled={isSubmitting || !parsedPreview?.valid}
                  className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold transition-all ${
                    isSubmitting || !parsedPreview?.valid
                      ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                      : 'bg-orange-600 hover:bg-orange-500 text-white shadow-sm active:scale-95'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Validating & Registering...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Register & Activate Twin</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-800 bg-gray-900/60 text-[11px] font-mono text-gray-500">
          <span>PS #13 Cyber Digital Twin • Deterministic In-Memory Engine</span>
          <span>FastAPI v2.1 Connected</span>
        </div>
      </div>
    </div>
  );
};
