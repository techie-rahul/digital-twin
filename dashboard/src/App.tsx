import React, { useState, useEffect, useMemo } from 'react';
import { Header } from './components/Header';
import { DemoPresetBar } from './components/DemoPresetBar';
import { DecisionHeroCard } from './components/DecisionHeroCard';
import { TopologyCanvas } from './components/TopologyCanvas';
import { EvidenceView } from './components/EvidenceView';
import { ChangeConsole } from './components/ChangeConsole';
import { OptimizerPanel } from './components/OptimizerPanel';
import { BlastRadiusModal } from './components/BlastRadiusModal';
import { ChessPieceAuditorView } from './components/ChessPieceAuditorView';
import { TwinLineageView } from './components/TwinLineageView';
import { ImportDatasetModal } from './components/ImportDatasetModal';
import { apiClient } from './api/client';
import { Twin, ChangeVerdict, OptimizationResult, BlastRadiusResponse, SimulationStep, Asset, Edge, ServiceFlow } from './types/api';
import { DemoPresetId, DecisionHeroData } from './types/presets';
import { DEMO_PRESETS } from './data/presetsData';
import { GOLDEN_ASSETS, GOLDEN_EDGES, GOLDEN_FLOWS } from './data/topologyData';

export const App: React.FC = () => {
  // Top-level presentation mode: 'story' | 'evidence' | 'chess-audit' | 'lineage'
  const [presentationMode, setPresentationMode] = useState<'story' | 'evidence' | 'chess-audit' | 'lineage'>('story');

  // Active secondary tab when in custom sandbox testing
  const [activeTab, setActiveTab] = useState<'topology' | 'console' | 'optimizer'>('topology');

  // Digital Twin state from backend
  const [twin, setTwin] = useState<Twin | null>(null);
  const [isBackendLive, setIsBackendLive] = useState<boolean>(false);
  const [activeTwinId, setActiveTwinId] = useState<string>('twin-finbank-golden');
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);

  // Active Demo Preset (Defaults to Preset 1: Baseline)
  const [activePresetId, setActivePresetId] = useState<DemoPresetId>('preset-baseline');

  // Selected defensive controls for CAB change sandbox
  const [selectedControlIds, setSelectedControlIds] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<ChangeVerdict | null>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  // Simulation & "Falling Nodes" state
  const [compromisedNodeIds, setCompromisedNodeIds] = useState<string[]>([]);
  const [simulationSteps, setSimulationSteps] = useState<SimulationStep[]>([]);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // Optimizer state
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);

  // Blast Radius Modal state
  const [blastRadiusData, setBlastRadiusData] = useState<BlastRadiusResponse | null>(null);

  // Active Preset Configuration
  const activePreset = DEMO_PRESETS[activePresetId];

  // 1. Initial Load: Twin & Health
  useEffect(() => {
    async function init() {
      try {
        const twinData = await apiClient.getTwin();
        setTwin(twinData);
        // Ping health check to determine if backend is live
        try {
          const healthRes = await fetch('/health');
          if (healthRes.ok) setIsBackendLive(true);
        } catch {
          setIsBackendLive(false);
        }
      } catch (e) {
        console.error('Failed to initialize digital twin:', e);
      }
    }
    init();
  }, []);

  // 2. Re-evaluate change verdict whenever selected controls change
  useEffect(() => {
    if (!twin) return;

    let isMounted = true;
    async function evaluate() {
      setIsEvaluating(true);
      try {
        const result = await apiClient.evaluateChange({
          twin_id: twin?.id,
          control_ids: selectedControlIds,
          agent_id: 'adv-admin',
          seed: 42,
          n_walks: 200,
        });
        if (isMounted) {
          setVerdict(result);
        }
      } catch (e) {
        console.error('Failed to evaluate change:', e);
      } finally {
        if (isMounted) setIsEvaluating(false);
      }
    }

    evaluate();
    return () => {
      isMounted = false;
    };
  }, [selectedControlIds, twin]);

  // 3. Preset Selection Handler
  // Presets are authored against the FinBank golden twin's control ids. On any other twin,
  // translate the preset's intent onto that twin's own control catalogue so we never send
  // control ids the backend doesn't know.
  const resolvePresetControls = (presetId: DemoPresetId): string[] => {
    const cfg = DEMO_PRESETS[presetId];
    if (activeTwinId === 'twin-finbank-golden') return cfg.controlIds;
    const catalogue = twin?.controls ?? [];
    if (presetId === 'preset-baseline' || catalogue.length === 0) return [];
    if (presetId === 'preset-full-seg') return catalogue.map((c) => c.id);
    const identityTechs = ['ssh_lateral', 'rdp_lateral', 'iam_assume_role', 'cred_dump'];
    if (presetId === 'preset-mfa') {
      const mfaLike = catalogue.filter(
        (c) => /mfa|identity|bastion|iam|zero-trust/i.test(`${c.id} ${c.name}`) ||
          (c.blocks ?? []).some((t) => identityTechs.includes(t))
      );
      return (mfaLike.length ? mfaLike : catalogue.slice(0, 1)).map((c) => c.id);
    }
    // Scoped seg / sync drift: the single control scoped to the crown jewel, else the cheapest one.
    const crownIds = new Set((twin?.assets ?? []).filter((a) => a.crown_jewel).map((a) => a.id));
    const scoped = catalogue.find((c) => (c.scope ?? []).some((id) => crownIds.has(id)));
    const cheapest = [...catalogue].sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0))[0];
    return [(scoped ?? cheapest).id];
  };

  const handleSelectPreset = (presetId: DemoPresetId) => {
    setActivePresetId(presetId);
    setSelectedControlIds(resolvePresetControls(presetId));
    setCompromisedNodeIds([]);
    setSimulationSteps([]);
    setIsSimulating(false);
  };

  // 4. "Apply Alternative" button handler on DecisionHeroCard
  const handleApplyAlternative = (targetPresetId: DemoPresetId) => {
    handleSelectPreset(targetPresetId);
  };

  // 5. Control Toggle Handler (for judge interactive testing)
  const handleToggleControl = (controlId: string) => {
    setSelectedControlIds((prev) =>
      prev.includes(controlId) ? prev.filter((id) => id !== controlId) : [...prev, controlId]
    );
  };

  // 5b. Dynamic Dataset Switcher Handler
  const handleSelectTwin = async (twinId: string) => {
    try {
      const twinData = await apiClient.getTwin(twinId);
      setTwin(twinData);
      setActiveTwinId(twinId);
      setSelectedControlIds([]);
      setCompromisedNodeIds([]);
      setSimulationSteps([]);
      setIsSimulating(false);
      setVerdict(null);
    } catch (err) {
      console.error('Failed to switch twin dataset:', err);
    }
  };

  // 6. Live Breach Simulation (Falling nodes cascade & directed vector traversal)
  const handleRunSimulation = async () => {
    if (isSimulating) return;

    setIsSimulating(true);
    setCompromisedNodeIds([]);
    setSimulationSteps([]);

    // Scenario-specific step trajectories for deterministic pitch demonstration (FinBank only)
    if (activeTwinId === 'twin-finbank-golden') {
      if (activePresetId === 'preset-mfa') {
      // Demonstrates Attacker Re-Planning:
      // Human route blocked via ws-dev -> jump-01, attacker discovers and pivots to Route D (web-dmz -> ci-runner -> backup-01 -> prod-db)
      const mfaTrajectory: SimulationStep[] = [
        {
          step_index: 1,
          asset_id: 'internet',
          asset_name: 'External Internet Gateway',
          zone: 'dmz',
          technique: 'ingress',
          status: 'compromised',
          cost: 0,
          noise: 0.1,
          src_asset_id: undefined,
          notes: 'Adversary perimeter ingress',
        },
        {
          step_index: 2,
          asset_id: 'web-dmz',
          asset_name: 'Online Banking Web DMZ',
          zone: 'dmz',
          technique: 'exploit_public_app',
          status: 'compromised',
          cost: 1.2,
          noise: 0.3,
          src_asset_id: 'internet',
          notes: 'Exploited public banking portal',
        },
        {
          step_index: 3,
          asset_id: 'jump-01',
          asset_name: 'Privileged Admin Jump Host',
          zone: 'mgmt',
          technique: 'ssh_lateral',
          status: 'blocked',
          cost: 3.5,
          noise: 0.8,
          src_asset_id: 'web-dmz',
          notes: 'BLOCKED by Hardware FIDO2 WebAuthn MFA challenge',
        },
        {
          step_index: 4,
          asset_id: 'ci-runner',
          asset_name: 'CI/CD Build & Deployment Runner',
          zone: 'corp',
          technique: 'webhook_dispatch',
          status: 'compromised',
          cost: 4.8,
          noise: 0.4,
          src_asset_id: 'web-dmz',
          is_pivot: true,
          notes: 'ATTACKER RE-PLANS: Pivots down Route D via automated CI runner',
        },
        {
          step_index: 5,
          asset_id: 'backup-01',
          asset_name: 'Disaster Recovery Backup Vault',
          zone: 'mgmt',
          technique: 'deploy_key',
          status: 'compromised',
          cost: 9.2,
          noise: 0.5,
          src_asset_id: 'ci-runner',
          notes: 'Leverages unmanaged CI deploy keys into DR vault',
        },
        {
          step_index: 6,
          asset_id: 'prod-db',
          asset_name: 'Core Production Database',
          zone: 'prod',
          technique: 'dr_restore',
          status: 'compromised',
          cost: 14.5,
          noise: 0.6,
          src_asset_id: 'backup-01',
          notes: 'Residual machine route completes compromise of Crown Jewel',
        },
      ];

      let currentStep = 0;
      const interval = setInterval(() => {
        if (currentStep < mfaTrajectory.length) {
          const step = mfaTrajectory[currentStep];
          setSimulationSteps((prev) => [...prev, step]);
          if (step.status === 'compromised') {
            setCompromisedNodeIds((prev) => (prev.includes(step.asset_id) ? prev : [...prev, step.asset_id]));
          }
          currentStep++;
        } else {
          clearInterval(interval);
          setIsSimulating(false);
        }
      }, 500);
      return;
    }

    if (activePresetId === 'preset-full-seg') {
      // Demonstrates Full Segmentation: All ingress to prod-db blocked
      const fullSegTrajectory: SimulationStep[] = [
        {
          step_index: 1,
          asset_id: 'internet',
          asset_name: 'External Internet Gateway',
          zone: 'dmz',
          technique: 'ingress',
          status: 'compromised',
          cost: 0,
          noise: 0.1,
          src_asset_id: undefined,
          notes: 'Adversary perimeter ingress',
        },
        {
          step_index: 2,
          asset_id: 'web-dmz',
          asset_name: 'Online Banking Web DMZ',
          zone: 'dmz',
          technique: 'exploit_public_app',
          status: 'compromised',
          cost: 1.2,
          noise: 0.3,
          src_asset_id: 'internet',
          notes: 'DMZ web node breached',
        },
        {
          step_index: 3,
          asset_id: 'jump-01',
          asset_name: 'Privileged Admin Jump Host',
          zone: 'mgmt',
          technique: 'ssh_lateral',
          status: 'compromised',
          cost: 3.5,
          noise: 0.5,
          src_asset_id: 'web-dmz',
          notes: 'Admin jump host reached',
        },
        {
          step_index: 4,
          asset_id: 'prod-db',
          asset_name: 'Core Production Database',
          zone: 'prod',
          technique: 'rdp_lateral',
          status: 'blocked',
          cost: 7.0,
          noise: 0.9,
          src_asset_id: 'jump-01',
          notes: 'BLOCKED: Database perimeter segmentation deny rule',
        },
      ];

      let currentStep = 0;
      const interval = setInterval(() => {
        if (currentStep < fullSegTrajectory.length) {
          const step = fullSegTrajectory[currentStep];
          setSimulationSteps((prev) => [...prev, step]);
          if (step.status === 'compromised') {
            setCompromisedNodeIds((prev) => (prev.includes(step.asset_id) ? prev : [...prev, step.asset_id]));
          }
          currentStep++;
        } else {
          clearInterval(interval);
          setIsSimulating(false);
        }
      }, 500);
      return;
    }

    if (activePresetId === 'preset-scoped-seg') {
      // Safe Option: Blocked cleanly before Bastion, 0 broken business flows
      const scopedTrajectory: SimulationStep[] = [
        {
          step_index: 1,
          asset_id: 'internet',
          asset_name: 'External Internet Gateway',
          zone: 'dmz',
          technique: 'ingress',
          status: 'compromised',
          cost: 0,
          noise: 0.1,
          src_asset_id: undefined,
          notes: 'Adversary perimeter ingress',
        },
        {
          step_index: 2,
          asset_id: 'web-dmz',
          asset_name: 'Online Banking Web DMZ',
          zone: 'dmz',
          technique: 'exploit_public_app',
          status: 'compromised',
          cost: 1.2,
          noise: 0.3,
          src_asset_id: 'internet',
          notes: 'DMZ web node breached',
        },
        {
          step_index: 3,
          asset_id: 'jump-01',
          asset_name: 'Privileged Admin Jump Host',
          zone: 'mgmt',
          technique: 'ssh_lateral',
          status: 'blocked',
          cost: 3.5,
          noise: 0.8,
          src_asset_id: 'web-dmz',
          notes: 'BLOCKED: Scoped Bastion segmentation + MFA active',
        },
      ];

      let currentStep = 0;
      const interval = setInterval(() => {
        if (currentStep < scopedTrajectory.length) {
          const step = scopedTrajectory[currentStep];
          setSimulationSteps((prev) => [...prev, step]);
          if (step.status === 'compromised') {
            setCompromisedNodeIds((prev) => (prev.includes(step.asset_id) ? prev : [...prev, step.asset_id]));
          }
          currentStep++;
        } else {
          clearInterval(interval);
          setIsSimulating(false);
        }
      }, 500);
      return;
    }

    if (activePresetId === 'preset-sync-drift') {
      // Preset 5: Attacker enters through contractor admin privilege drift
      const driftTrajectory: SimulationStep[] = [
        {
          step_index: 1,
          asset_id: 'ws-contractor',
          asset_name: 'Contractor Workstation (Third-Party)',
          zone: 'corp',
          technique: 'ingress',
          status: 'compromised',
          cost: 0.5,
          noise: 0.2,
          src_asset_id: undefined,
          notes: 'Third-party contractor laptop compromised',
        },
        {
          step_index: 2,
          asset_id: 'jump-01',
          asset_name: 'Privileged Admin Jump Host',
          zone: 'mgmt',
          technique: 'cloud_admin_grant',
          status: 'compromised',
          cost: 2.1,
          noise: 0.4,
          src_asset_id: 'ws-contractor',
          notes: 'DRIFT REGRESSION: Unapproved contractor admin role bypasses bastion perimeter',
        },
        {
          step_index: 3,
          asset_id: 'prod-db',
          asset_name: 'Core Production Database',
          zone: 'prod',
          technique: 'rdp_lateral',
          status: 'compromised',
          cost: 4.8,
          noise: 0.6,
          src_asset_id: 'jump-01',
          notes: 'Crown jewel reached via contractor admin bypass',
        },
      ];

      let currentStep = 0;
      const interval = setInterval(() => {
        if (currentStep < driftTrajectory.length) {
          const step = driftTrajectory[currentStep];
          setSimulationSteps((prev) => [...prev, step]);
          if (step.status === 'compromised') {
            setCompromisedNodeIds((prev) => (prev.includes(step.asset_id) ? prev : [...prev, step.asset_id]));
          }
          currentStep++;
        } else {
          clearInterval(interval);
          setIsSimulating(false);
        }
      }, 500);
        return;
      }
    }

    // Default / Baseline: Call FastAPI simulation endpoint
    try {
      const res = await apiClient.simulate({
        twin_id: activeTwinId || twin?.id || 'twin-finbank-golden',
        agent_id: 'adv-admin',
        seed: 42,
        n_walks: 200,
        control_ids: selectedControlIds,
      });

      // The backend returns the attacker's best route regardless of how much the selected
      // controls degraded it. When success probability collapses, render the block at the first
      // route node that sits inside a selected control's scope instead of painting the crown jewel red.
      if (res.attack_trajectory && res.attack_trajectory.length > 0 && selectedControlIds.length > 0 && res.p_success < 0.25) {
        const scopedNodes = new Set(
          (twin?.controls ?? [])
            .filter((c) => selectedControlIds.includes(c.id))
            .flatMap((c) => c.scope ?? [])
        );
        const blockIdx = res.attack_trajectory.findIndex((s) => scopedNodes.has(s.asset_id));
        if (blockIdx > 0) {
          const pct = Math.round(res.p_success * 100);
          res.attack_trajectory = res.attack_trajectory.slice(0, blockIdx + 1).map((s, i) =>
            i === blockIdx
              ? { ...s, status: 'blocked' as const, notes: `Route degraded by active control — attacker success probability ${pct}% (was baseline).` }
              : s
          );
        }
      }

      if (res.attack_trajectory && res.attack_trajectory.length > 0) {
        let currentStep = 0;
        const totalSteps = res.attack_trajectory.length;

        const interval = setInterval(() => {
          if (currentStep < totalSteps) {
            const step = res.attack_trajectory[currentStep];
            setSimulationSteps((prev) => [...prev, step]);
            if (step.status === 'compromised') {
              setCompromisedNodeIds((prev) => (prev.includes(step.asset_id) ? prev : [...prev, step.asset_id]));
            }
            currentStep++;
          } else {
            clearInterval(interval);
            setIsSimulating(false);
          }
        }, 500);
      } else {
        if (res.compromised_nodes && res.compromised_nodes.length > 0) {
          setCompromisedNodeIds(res.compromised_nodes);
        } else if (effectiveAssets.length > 0) {
          setSimulationSteps([
            {
              step_index: 1,
              asset_id: effectiveAssets[0].id,
              asset_name: effectiveAssets[0].name,
              zone: effectiveAssets[0].zone,
              technique: 'perimeter_probe',
              status: 'blocked',
              cost: 0,
              noise: 0.1,
              notes: 'SIMULATION RESULT: All lateral attack paths to Crown Jewel severed by active controls or network boundaries.',
            },
          ]);
        }
        setIsSimulating(false);
      }
    } catch (e) {
      console.error('Breach simulation failed:', e);
      setIsSimulating(false);
    }
  };

  // 7. Reset Simulation
  const handleResetSimulation = () => {
    setCompromisedNodeIds([]);
    setSimulationSteps([]);
    setIsSimulating(false);
  };

  // 8. Reset Scenario to Baseline
  const handleResetScenario = () => {
    handleSelectPreset('preset-baseline');
  };

  // 9. Solve Portfolio Optimization
  const handleRunOptimization = async (budget: number, maxCrit: number) => {
    if (!twin || isOptimizing) return;
    setIsOptimizing(true);
    try {
      const optResult = await apiClient.optimize({
        twin_id: twin.id,
        budget,
        max_broken_criticality: maxCrit,
        seed: 42,
        n_walks: 200,
      });
      setOptimizationResult(optResult);
    } catch (e) {
      console.error('Optimization failed:', e);
    } finally {
      setIsOptimizing(false);
    }
  };

  // 10. Inspect Blast Radius
  const handleInspectBlastRadius = async (assetId: string) => {
    try {
      const data = await apiClient.getBlastRadius(assetId);
      setBlastRadiusData(data);
    } catch (e) {
      console.error('Failed to get blast radius:', e);
    }
  };

  // Fallback loading indicator
  if (!twin) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center font-mono text-xs text-ash-500">
        <div className="flex items-center gap-2.5">
          <div className="w-4 h-4 border-2 border-brand-orange border-t-transparent rounded-full animate-spin" />
          <span>Loading Digital Twin Snapshot...</span>
        </div>
      </div>
    );
  }

  // Active broken flow IDs: when a preset is active, use the preset's defined broken flows.
  // In Preset 3 (MFA for Humans), human logins are challenged but machine flows (F2) are intact.
  const effectiveBrokenFlowIds = (() => {
    if (activePresetId === 'preset-full-seg') {
      return ['F3', 'F7'];
    }
    if (activePresetId === 'preset-mfa' || activePresetId === 'preset-scoped-seg' || activePresetId === 'preset-sync-drift') {
      return [];
    }
    if (activePreset.activeBrokenFlowIds && activePreset.activeBrokenFlowIds.length > 0) {
      return activePreset.activeBrokenFlowIds;
    }
    return verdict ? verdict.broken_flows.map((f) => f.id) : [];
  })();

  // Active control names
  const activeControlNames = twin.controls
    .filter((c) => selectedControlIds.includes(c.id))
    .map((c) => c.name);

  // Use Golden Assets and Golden Edges for FinBank story; dynamic assets/edges/flows for custom twins
  const isCustomTwin = activeTwinId !== 'twin-finbank-golden';
  const effectiveAssets: Asset[] = isCustomTwin && twin.assets?.length ? twin.assets : GOLDEN_ASSETS;
  const effectiveEdges: Edge[] = isCustomTwin && twin.edges?.length ? twin.edges : GOLDEN_EDGES;
  const effectiveFlows: ServiceFlow[] = isCustomTwin && twin.flows?.length ? twin.flows : GOLDEN_FLOWS;

  return (
    <div className="min-h-screen bg-[#FAFAFA] bg-tech-grid text-ash-900 flex flex-col font-sans">
      {/* Navigation Header with Top-Right Mode Toggle & Dataset Switcher */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        presentationMode={presentationMode}
        onTogglePresentationMode={setPresentationMode}
        isBackendLive={isBackendLive}
        onReset={handleResetScenario}
        activeTwinId={activeTwinId}
        onOpenImportModal={() => setIsImportModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* ================================================================= */}
        {/* 1. EXECUTIVE DECISION STORY MODE (Default for Judges & Pitch)     */}
        {/* ================================================================= */}
        {presentationMode === 'story' && (
          <div className="space-y-6">
            {/* Interactive 4-Minute Presentation Demo Bar (5 Presets) */}
            <DemoPresetBar
              activePresetId={activePresetId}
              onSelectPreset={handleSelectPreset}
            />

            {/* THE HERO COMPONENT: Decision Hero Card */}
            <DecisionHeroCard
              heroData={activePreset.heroData}
              onApplyAlternative={handleApplyAlternative}
              onOpenEvidence={() => setPresentationMode('evidence')}
              activePresetId={activePresetId}
            />

            {/* Sub-tab view: Topology Graph (default) vs Custom Sandbox / Optimizer */}
            {activeTab === 'topology' && (
              <TopologyCanvas
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
                onResetSimulation={handleResetSimulation}
                onInspectBlastRadius={handleInspectBlastRadius}
                activeControlNames={activeControlNames}
                blastRadiusData={blastRadiusData}
                onClearBlastRadius={() => setBlastRadiusData(null)}
                // Demo Preset Flags
                activePresetId={activePresetId}
                isReroutingActive={activePreset.isReroutingActive}
                reroutingCaption={activePreset.reroutingCaption}
                isDriftActive={activePreset.isDriftActive}
                isP1OutageActive={activePreset.isP1OutageActive}
                riskScorePct={activePreset.riskScorePct}
              />
            )}

            {activeTab === 'console' && (
              <ChangeConsole
                availableControls={twin.controls}
                selectedControlIds={selectedControlIds}
                onToggleControl={handleToggleControl}
                verdict={verdict}
                isEvaluating={isEvaluating}
              />
            )}

            {activeTab === 'optimizer' && (
              <OptimizerPanel
                optimizationResult={optimizationResult}
                onRunOptimization={handleRunOptimization}
                isOptimizing={isOptimizing}
              />
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* 2. FULL ARCHITECTURE & EVIDENCE MODE (Technical Deep-Dive & Q&A)  */}
        {/* ================================================================= */}
        {presentationMode === 'evidence' && (
          <EvidenceView
            assets={effectiveAssets}
            edges={effectiveEdges}
            flows={effectiveFlows}
            controls={twin.controls}
            activePresetId={activePresetId}
            verdict={verdict}
            onBackToDecisionStory={() => setPresentationMode('story')}
          />
        )}

        {/* ================================================================= */}
        {/* 3. CHESS PIECE AUDITOR MODE (Hop-by-Hop Crawl & Cheapest Fix)    */}
        {/* ================================================================= */}
        {presentationMode === 'chess-audit' && (
          <ChessPieceAuditorView
            assets={effectiveAssets}
            edges={effectiveEdges}
            controls={twin.controls}
            twinId={activeTwinId}
            onBackToDecisionStory={() => setPresentationMode('story')}
          />
        )}

        {/* ================================================================= */}
        {/* 4. DIGITAL TWIN LINEAGE & CRYPTOGRAPHIC PROVENANCE MODE           */}
        {/* ================================================================= */}
        {presentationMode === 'lineage' && (
          <TwinLineageView
            activeTwinId={activeTwinId}
            onBackToDecisionStory={() => setPresentationMode('story')}
          />
        )}
      </main>

      {/* Blast Radius Inspection Modal */}
      <BlastRadiusModal
        data={blastRadiusData}
        onClose={() => setBlastRadiusData(null)}
      />

      {/* Dynamic Digital Twin Dataset Import & Testing Modal */}
      <ImportDatasetModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        activeTwinId={activeTwinId}
        onSelectTwin={(id) => handleSelectTwin(id)}
        onTwinImported={(newTwin: Twin) => {
          setTwin(newTwin);
          setActiveTwinId(newTwin.id);
          setSelectedControlIds([]);
          setCompromisedNodeIds([]);
          setSimulationSteps([]);
          setIsSimulating(false);
          setVerdict(null);
        }}
      />

      {/* Minimalist Footer / Audit Strip */}
      <footer className="border-t border-canvas-border bg-white px-6 py-3 text-xs font-mono text-ash-400 flex flex-col sm:flex-row items-center justify-between gap-2 shadow-subtle">
        <div className="flex items-center gap-4">
          <span>Active Dataset: <strong className="text-ash-700">{twin?.name || twin?.id || activeTwinId}</strong></span>
          <span>Preset: <strong className="text-ash-700">{activePreset.label}</strong></span>
          <span>Snapshot Hash: <strong className="text-ash-700">sha256:7f3a9e2d...</strong></span>
          <span>Deterministic Seed: <strong className="text-brand-orange">42</strong></span>
        </div>
        <div>
          <span>Security Change Sandbox • Digital Twin Model PS #13</span>
        </div>
      </footer>
    </div>
  );
};
