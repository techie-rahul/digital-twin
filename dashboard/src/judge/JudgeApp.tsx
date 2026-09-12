import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Layers, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { JudgeHeader, JudgeMode } from './components/JudgeHeader';
import { JudgePresetBar } from './components/JudgePresetBar';
import { JudgeDecisionCard } from './components/JudgeDecisionCard';
import { JudgeTopology } from './components/JudgeTopology';
import { JudgeSandbox } from './components/JudgeSandbox';
import { JudgeOptimizer } from './components/JudgeOptimizer';
import { JudgeDatasetModal } from './components/JudgeDatasetModal';
import { BlastRadiusModal } from '../components/BlastRadiusModal';
import { ChessPieceAuditorView } from '../components/ChessPieceAuditorView';
import { TwinLineageView } from '../components/TwinLineageView';
import { apiClient } from '../api/client';
import { Twin, ChangeVerdict, OptimizationResult, BlastRadiusResponse, SimulationStep, Asset, Edge, ServiceFlow } from '../types/api';
import { DemoPresetId } from '../types/presets';
import { DEMO_PRESETS } from '../data/presetsData';
import { GOLDEN_ASSETS, GOLDEN_EDGES, GOLDEN_FLOWS } from '../data/topologyData';
import { useBackendHealth } from './hooks/useBackendHealth';
import { normalizeOptimization } from './normalizeOptimization';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SCRIPTED_TRAJECTORIES, PRESET_BROKEN_FLOW_OVERRIDE, playTrajectory } from './scriptedTrajectories';

type StoryTab = 'topology' | 'console' | 'optimizer';

const STORY_TABS: { id: StoryTab; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'topology', label: 'Graph', Icon: Layers },
  { id: 'console', label: 'Sandbox', Icon: ShieldCheck },
  { id: 'optimizer', label: 'Optimizer', Icon: SlidersHorizontal },
];

// Lean judge-facing UI. State and handlers mirror App.tsx; the classic UI stays at ?ui=classic.
export const JudgeApp: React.FC = () => {
  const [mode, setMode] = useState<JudgeMode>('story');
  const [activeTab, setActiveTab] = useState<StoryTab>('topology');

  const [twin, setTwin] = useState<Twin | null>(null);
  const [activeTwinId, setActiveTwinId] = useState('twin-finbank-golden');
  const [isDatasetModalOpen, setIsDatasetModalOpen] = useState(false);

  const [activePresetId, setActivePresetId] = useState<DemoPresetId>('preset-baseline');
  const [selectedControlIds, setSelectedControlIds] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<ChangeVerdict | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const [compromisedNodeIds, setCompromisedNodeIds] = useState<string[]>([]);
  const [simulationSteps, setSimulationSteps] = useState<SimulationStep[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const cancelPlayback = useRef<(() => void) | null>(null);

  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [blastRadiusData, setBlastRadiusData] = useState<BlastRadiusResponse | null>(null);

  const { isLive: isBackendLive, recheck: recheckBackend } = useBackendHealth();
  const activePreset = DEMO_PRESETS[activePresetId];

  // Initial twin load
  useEffect(() => {
    apiClient
      .getTwin()
      .then(setTwin)
      .catch((e) => console.error('Failed to initialize digital twin:', e));
  }, []);

  // Re-evaluate the change verdict whenever selected controls change
  useEffect(() => {
    if (!twin) return;
    let isMounted = true;
    setIsEvaluating(true);
    apiClient
      .evaluateChange({ twin_id: twin.id, control_ids: selectedControlIds, agent_id: 'adv-admin', seed: 42, n_walks: 200 })
      .then((result) => { if (isMounted) setVerdict(result); })
      .catch((e) => console.error('Failed to evaluate change:', e))
      .finally(() => { if (isMounted) setIsEvaluating(false); });
    return () => { isMounted = false; };
  }, [selectedControlIds, twin]);

  const stopPlayback = () => {
    cancelPlayback.current?.();
    cancelPlayback.current = null;
  };
  useEffect(() => stopPlayback, []);

  const clearSimulation = () => {
    stopPlayback();
    setCompromisedNodeIds([]);
    setSimulationSteps([]);
    setIsSimulating(false);
  };

  // Presets are authored against FinBank control ids; translate onto other twins' catalogues.
  const resolvePresetControls = (presetId: DemoPresetId): string[] => {
    const cfg = DEMO_PRESETS[presetId];
    if (activeTwinId === 'twin-finbank-golden') return cfg.controlIds;
    const catalogue = twin?.controls ?? [];
    if (presetId === 'preset-baseline' || catalogue.length === 0) return [];
    if (presetId === 'preset-full-seg') return catalogue.map((c) => c.id);
    const identityTechs = ['ssh_lateral', 'rdp_lateral', 'iam_assume_role', 'cred_dump', 'db_login'];
    if (presetId === 'preset-mfa') {
      const mfaLike = catalogue.filter(
        (c) => /mfa|identity|bastion|iam|zero-trust/i.test(`${c.id} ${c.name}`) ||
          (c.blocks ?? []).some((t) => identityTechs.includes(t))
      );
      return (mfaLike.length ? mfaLike : catalogue.slice(0, 1)).map((c) => c.id);
    }
    const crownIds = new Set((twin?.assets ?? []).filter((a) => a.crown_jewel).map((a) => a.id));
    const scoped = catalogue.find((c) => (c.scope ?? []).some((id) => crownIds.has(id)));
    const cheapest = [...catalogue].sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0))[0];
    return [(scoped ?? cheapest).id];
  };

  const handleSelectPreset = useCallback((presetId: DemoPresetId) => {
    setActivePresetId(presetId);
    setSelectedControlIds(resolvePresetControls(presetId));
    clearSimulation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTwinId, twin]);

  const handleToggleControl = (controlId: string) => {
    setSelectedControlIds((prev) => (prev.includes(controlId) ? prev.filter((id) => id !== controlId) : [...prev, controlId]));
  };

  const applyTwin = (twinData: Twin, twinId: string) => {
    setTwin(twinData);
    setActiveTwinId(twinId);
    setSelectedControlIds([]);
    clearSimulation();
    setVerdict(null);
  };

  const handleSelectTwin = async (twinId: string) => {
    try {
      applyTwin(await apiClient.getTwin(twinId), twinId);
    } catch (err) {
      console.error('Failed to switch twin dataset:', err);
    }
  };

  const isCustomTwin = activeTwinId !== 'twin-finbank-golden';
  const effectiveAssets: Asset[] = isCustomTwin && twin?.assets?.length ? twin.assets : GOLDEN_ASSETS;
  const effectiveEdges: Edge[] = isCustomTwin && twin?.edges?.length ? twin.edges : GOLDEN_EDGES;
  const effectiveFlows: ServiceFlow[] = isCustomTwin && twin?.flows?.length ? twin.flows : GOLDEN_FLOWS;

  const handleRunSimulation = async () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setCompromisedNodeIds([]);
    setSimulationSteps([]);

    const scripted = !isCustomTwin ? SCRIPTED_TRAJECTORIES[activePresetId] : undefined;
    if (scripted) {
      cancelPlayback.current = playTrajectory(scripted, setSimulationSteps, setCompromisedNodeIds, () => setIsSimulating(false));
      return;
    }

    try {
      const res = await apiClient.simulate({
        twin_id: activeTwinId || twin?.id || 'twin-finbank-golden',
        agent_id: 'adv-admin',
        seed: 42,
        n_walks: 200,
        control_ids: selectedControlIds,
      });

      if (res.attack_trajectory && res.attack_trajectory.length > 0) {
        cancelPlayback.current = playTrajectory(res.attack_trajectory, setSimulationSteps, setCompromisedNodeIds, () => setIsSimulating(false));
        return;
      }
      if (res.compromised_nodes && res.compromised_nodes.length > 0) {
        setCompromisedNodeIds(res.compromised_nodes);
      } else if (effectiveAssets.length > 0) {
        setSimulationSteps([{
          step_index: 1,
          asset_id: effectiveAssets[0].id,
          asset_name: effectiveAssets[0].name,
          zone: effectiveAssets[0].zone,
          technique: 'perimeter_probe',
          status: 'blocked',
          cost: 0,
          noise: 0.1,
          notes: 'All lateral attack paths to the crown jewel are severed by active controls or network boundaries.',
        }]);
      }
    } catch (e) {
      console.error('Breach simulation failed:', e);
    }
    setIsSimulating(false);
  };

  const handleRunOptimization = async (budget: number, maxCrit: number) => {
    if (!twin || isOptimizing) return;
    setIsOptimizing(true);
    try {
      const raw = await apiClient.optimize({ twin_id: twin.id, budget, max_broken_criticality: maxCrit, seed: 42, n_walks: 200 });
      setOptimizationResult(normalizeOptimization(raw, budget, maxCrit));
    } catch (e) {
      console.error('Optimization failed:', e);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleInspectBlastRadius = async (assetId: string) => {
    try {
      setBlastRadiusData(await apiClient.getBlastRadius(assetId));
    } catch (e) {
      console.error('Failed to get blast radius:', e);
    }
  };

  if (!twin) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center font-mono text-xs text-ash-500">
        <div className="flex items-center gap-2.5">
          <div className="w-4 h-4 border-2 border-brand-orange border-t-transparent rounded-full animate-spin" />
          <span>Loading digital twin…</span>
        </div>
      </div>
    );
  }

  const effectiveBrokenFlowIds =
    PRESET_BROKEN_FLOW_OVERRIDE[activePresetId] ??
    (activePreset.activeBrokenFlowIds?.length ? activePreset.activeBrokenFlowIds : verdict?.broken_flows.map((f) => f.id) ?? []);

  const activeControlNames = twin.controls.filter((c) => selectedControlIds.includes(c.id)).map((c) => c.name);

  return (
    <div className="min-h-screen bg-canvas text-ash-900 flex flex-col font-sans">
      <JudgeHeader
        mode={mode}
        onModeChange={setMode}
        isBackendLive={isBackendLive}
        onRecheckBackend={recheckBackend}
        activeTwinId={activeTwinId}
        onOpenDatasets={() => setIsDatasetModalOpen(true)}
        onReset={() => handleSelectPreset('preset-baseline')}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-4">
        {mode === 'story' && (
          <>
            <JudgePresetBar activePresetId={activePresetId} onSelectPreset={handleSelectPreset} />

            <JudgeDecisionCard heroData={activePreset.heroData} activePresetId={activePresetId} onApplyAlternative={handleSelectPreset} />

            <div className="flex items-center p-1 rounded-lg bg-ash-100 border border-ash-200 w-fit">
              {STORY_TABS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
                    activeTab === id ? 'bg-white text-ash-900 font-semibold shadow-subtle border border-ash-200' : 'text-ash-500 hover:text-ash-800 font-medium'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${activeTab === id ? 'text-brand-orange' : 'text-ash-400'}`} />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            <ErrorBoundary label='Graph'>
            {activeTab === 'topology' && (
              <JudgeTopology
                assets={effectiveAssets}
                edges={effectiveEdges}
                flows={effectiveFlows}
                controls={twin.controls}
                selectedControlIds={selectedControlIds}
                compromisedNodeIds={compromisedNodeIds}
                simulationSteps={simulationSteps}
                isSimulating={isSimulating}
                brokenFlowIds={effectiveBrokenFlowIds}
                onRunSimulation={handleRunSimulation}
                onResetSimulation={clearSimulation}
                onInspectBlastRadius={handleInspectBlastRadius}
                activeControlNames={activeControlNames}
                blastRadiusData={blastRadiusData}
                onClearBlastRadius={() => setBlastRadiusData(null)}
                activePresetId={activePresetId}
                isReroutingActive={activePreset.isReroutingActive}
                reroutingCaption={activePreset.reroutingCaption}
                isDriftActive={activePreset.isDriftActive}
                isP1OutageActive={activePreset.isP1OutageActive}
                riskScorePct={activePreset.riskScorePct}
              />
            )}
            </ErrorBoundary>

            <ErrorBoundary label='Sandbox'>
            {activeTab === 'console' && (
              <JudgeSandbox
                availableControls={twin.controls}
                selectedControlIds={selectedControlIds}
                onToggleControl={handleToggleControl}
                verdict={verdict}
                isEvaluating={isEvaluating}
              />
            )}
            </ErrorBoundary>

            <ErrorBoundary label='Optimizer'>
            {activeTab === 'optimizer' && (
              <JudgeOptimizer optimizationResult={optimizationResult} onRunOptimization={handleRunOptimization} isOptimizing={isOptimizing} />
            )}
            </ErrorBoundary>
          </>
        )}

        {mode === 'chess-audit' && (
          <ErrorBoundary label='Chess Auditor'>
          <ChessPieceAuditorView
            assets={effectiveAssets}
            edges={effectiveEdges}
            controls={twin.controls}
            twinId={activeTwinId}
            onBackToDecisionStory={() => setMode('story')}
          />
          </ErrorBoundary>
        )}

        {mode === 'lineage' && (
          <ErrorBoundary label='Lineage'>
            <TwinLineageView activeTwinId={activeTwinId} onBackToDecisionStory={() => setMode('story')} />
          </ErrorBoundary>
        )}
      </main>

      <BlastRadiusModal data={blastRadiusData} onClose={() => setBlastRadiusData(null)} />

      <JudgeDatasetModal
        isOpen={isDatasetModalOpen}
        onClose={() => setIsDatasetModalOpen(false)}
        activeTwinId={activeTwinId}
        onSelectTwin={handleSelectTwin}
        onTwinImported={(newTwin) => applyTwin(newTwin, newTwin.id)}
      />
    </div>
  );
};
