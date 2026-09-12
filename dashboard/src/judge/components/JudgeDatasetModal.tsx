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
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { TwinSummaryOut, Twin } from '../../types/api';

interface JudgeDatasetModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTwinId: string;
  onSelectTwin: (twinId: string) => void;
  onTwinImported?: (importedTwin: Twin) => void;
}

export const JudgeDatasetModal: React.FC<JudgeDatasetModalProps> = ({
  isOpen,
  onClose,
  activeTwinId,
  onSelectTwin,
  onTwinImported,
}) => {
  const [activeTab, setActiveTab] = useState<'profiles' | 'custom'>('profiles');
  const [twinsList, setTwinsList] = useState<TwinSummaryOut[]>([]);

  const [jsonText, setJsonText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    async function load() {
      try {
        const list = await apiClient.listTwins();
        setTwinsList(list);
      } catch (err) {
        console.error('Failed to load twins:', err);
      }
    }
    load();
  }, [isOpen]);

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
        valid: true as const,
        id: data.id || 'custom-twin',
        assetCount: assets.length,
        edgeCount: edges.length,
        flowCount: flows.length,
        controlCount: controls.length,
        crownJewels,
        hasCrownJewel: crownJewels.length > 0,
      };
    } catch (e: any) {
      return { valid: false as const, error: e.message || 'Invalid JSON syntax' };
    }
  }, [jsonText]);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setJsonText(ev.target?.result as string);
      setErrorMessage(null);
    };
    reader.readAsText(file);
  };

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

  const handleImportSubmit = async () => {
    if (!parsedPreview || !parsedPreview.valid) {
      setErrorMessage('Please provide valid digital twin JSON.');
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const data = JSON.parse(jsonText);
      const res = await apiClient.importTwin(data);
      setSuccessMessage(`Registered ${res.twin_id} (${res.asset_count} assets, ${res.edge_count} edges)`);
      const newTwin = await apiClient.getTwin(res.twin_id);
      onTwinImported?.(newTwin);
      onSelectTwin(res.twin_id);
      setTimeout(() => onClose(), 1200);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to import digital twin.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getProfileMeta = (id: string) => {
    if (id.includes('healthcare') || id.includes('hospital')) {
      return {
        title: 'Healthcare Hospital System',
        icon: Activity,
        accent: 'text-emerald-700 bg-emerald-50 border-emerald-200',
        desc: 'Epic EHR Core Database, PACS DICOM Radiology Imaging, Smart Infusion Pumps, and clinical HL7 flows.',
        crownJewel: 'Epic Systems Core EHR Database',
      };
    }
    if (id.includes('cloud') || id.includes('ecommerce')) {
      return {
        title: 'AWS Cloud SaaS Infrastructure',
        icon: Cloud,
        accent: 'text-blue-700 bg-blue-50 border-blue-200',
        desc: 'AWS API Gateway, ECS Fargate microservices, Cognito IAM, S3 data lake, and Aurora multi-region Postgres.',
        crownJewel: 'Amazon Aurora Multi-Region Postgres',
      };
    }
    if (id === 'twin-finbank-golden' || id.includes('finbank')) {
      return {
        title: 'FinBank Core Banking (Baseline)',
        icon: Building2,
        accent: 'text-brand-orange bg-brand-orange-light border-brand-orange-border',
        desc: 'Canonical banking architecture with DMZ, corporate LAN, bastion, SWIFT clearing, and core transaction ledger.',
        crownJewel: 'Core Production Database (prod-db)',
      };
    }
    return {
      title: id.replace(/^twin-/, ''),
      icon: Layers,
      accent: 'text-ash-700 bg-ash-100 border-ash-200',
      desc: 'Custom imported digital twin.',
      crownJewel: 'See asset inventory',
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-white border border-canvas-border shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-canvas-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-brand-orange-light text-brand-orange border border-brand-orange-border">
              <Database className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ash-900">Datasets</h3>
              <p className="text-xs text-ash-500">Switch scenarios or import a custom digital twin JSON.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-ash-400 hover:text-ash-900 hover:bg-ash-100 transition-colors">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="flex items-center px-5 border-b border-canvas-border">
          <button
            onClick={() => setActiveTab('profiles')}
            className={`flex items-center gap-2 py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'profiles' ? 'border-brand-orange text-brand-orange' : 'border-transparent text-ash-500 hover:text-ash-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Scenarios ({twinsList.length || 3})</span>
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`flex items-center gap-2 py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'custom' ? 'border-brand-orange text-brand-orange' : 'border-transparent text-ash-500 hover:text-ash-800'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Upload / paste JSON</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'profiles' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {twinsList.map((item) => {
                const meta = getProfileMeta(item.id);
                const Icon = meta.icon;
                const isActive = activeTwinId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`flex flex-col justify-between p-3.5 rounded-xl border transition-colors ${
                      isActive ? 'bg-brand-orange-light/30 border-brand-orange' : 'bg-white border-canvas-border hover:border-ash-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className={`p-1.5 rounded-lg border ${meta.accent}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        {isActive && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-brand-orange-light text-brand-orange border border-brand-orange-border">
                            <CheckCircle2 className="w-3 h-3" /> Active
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs font-bold text-ash-900">{meta.title}</h4>
                      <p className="text-[10px] font-mono text-ash-400 mb-1.5 truncate">{item.id}</p>
                      <p className="text-[11px] text-ash-600 line-clamp-3 mb-2 leading-relaxed">{meta.desc}</p>
                    </div>
                    <div className="space-y-2 pt-2 border-t border-canvas-border">
                      <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                        <div className="p-1 rounded bg-ash-100 text-ash-700">
                          <span className="text-ash-400 block text-[9px] uppercase">Assets</span>
                          <strong>{item.asset_count}</strong>
                        </div>
                        <div className="p-1 rounded bg-ash-100 text-ash-700">
                          <span className="text-ash-400 block text-[9px] uppercase">Edges</span>
                          <strong>{item.edge_count}</strong>
                        </div>
                      </div>
                      <div className="text-[10px] text-ash-500">
                        <span className="block uppercase font-mono">Crown jewel</span>
                        <span className="text-ash-800 font-medium truncate block">{meta.crownJewel}</span>
                      </div>
                      <button
                        onClick={() => { onSelectTwin(item.id); onClose(); }}
                        disabled={isActive}
                        className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          isActive ? 'bg-ash-100 text-ash-400 cursor-default' : 'bg-brand-orange hover:bg-brand-orange-hover text-white'
                        }`}
                      >
                        {isActive ? 'Currently active' : <><span>Activate</span><ArrowRight className="w-3.5 h-3.5" /></>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 rounded-xl bg-ash-100 border border-canvas-border">
                <p className="text-xs text-ash-600">Paste or upload a custom topology (assets, edges, flows, controls).</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white hover:bg-ash-200/60 text-ash-700 border border-ash-200 text-xs font-medium transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-ash-400" />
                    <span>Template</span>
                  </button>
                  <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-semibold cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload .json</span>
                    <input type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>
              </div>

              <textarea
                value={jsonText}
                onChange={(e) => { setJsonText(e.target.value); setErrorMessage(null); }}
                placeholder='{"id": "twin-custom", "assets": [...], "edges": [...], "flows": [...], "controls": [...]}'
                rows={11}
                className="w-full p-3 rounded-xl border border-canvas-border bg-ash-100 text-ash-900 resize-none focus:outline-none focus:ring-1 focus:ring-brand-orange font-mono text-xs leading-relaxed"
              />

              {parsedPreview && (
                <div className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                  parsedPreview.valid ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  <div className="flex items-center gap-2">
                    {parsedPreview.valid ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />}
                    {parsedPreview.valid ? (
                      <span>{parsedPreview.id}: {parsedPreview.assetCount} assets, {parsedPreview.edgeCount} edges, {parsedPreview.flowCount} flows, {parsedPreview.controlCount} controls</span>
                    ) : (
                      <span>Syntax error: {parsedPreview.error}</span>
                    )}
                  </div>
                  {parsedPreview.valid && parsedPreview.hasCrownJewel && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 border border-emerald-200">
                      Target: {parsedPreview.crownJewels.join(', ')}
                    </span>
                  )}
                </div>
              )}

              {errorMessage && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
              {successMessage && (
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={() => setJsonText('')} className="px-2.5 py-1.5 rounded-lg text-xs text-ash-500 hover:text-ash-800 transition-colors">
                  Clear
                </button>
                <button
                  onClick={handleImportSubmit}
                  disabled={isSubmitting || !parsedPreview?.valid}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    isSubmitting || !parsedPreview?.valid ? 'bg-ash-200 text-ash-400 cursor-not-allowed' : 'bg-brand-orange hover:bg-brand-orange-hover text-white'
                  }`}
                >
                  {isSubmitting ? 'Registering…' : 'Register & activate'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
