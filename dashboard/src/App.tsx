import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { TopologyCanvas } from './components/TopologyCanvas';
import { ChangeConsole } from './components/ChangeConsole';
import { OptimizerPanel } from './components/OptimizerPanel';
import { BlastRadiusModal } from './components/BlastRadiusModal';
import { ImportExportModal } from './components/ImportExportModal';
import { apiClient } from './api/client';
import { Twin, ChangeVerdict, OptimizationResult, BlastRadiusResponse, SimulationStep } from './types/api';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'topology' | 'console' | 'optimizer'>('topology');
  const [twin, setTwin] = useState<Twin | null>(null);
  const [isBackendLive, setIsBackendLive] = useState<boolean>(false);
  const [isImportExportOpen, setIsImportExportOpen] = useState<boolean>(false);


  // Selected defensive controls for CAB change sandbox
  const [selectedControlIds, setSelectedControlIds] = useState<string[]>(['ctrl-network-seg']);
  const [verdict, setVerdict] = useState<ChangeVerdict | null>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  // Simulation & "Falling Nodes" state
  const [compromisedNodeIds, setCompromisedNodeIds] = useState<string[]>([]);
  const [simulationSteps, setSimulationSteps] = useState<SimulationStep[]>([]);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // Optimizer state
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [availableTwins, setAvailableTwins] = useState<Array<{ id: string; asset_count: number }>>([]);

  // Blast Radius Modal state
  const [blastRadiusData, setBlastRadiusData] = useState<BlastRadiusResponse | null>(null);

  // 1. Initial Load: Twin & Health
  useEffect(() => {
    async function init() {
      try {
        const twinData = await apiClient.getTwin();
        setTwin(twinData);
        if (twinData.controls.length > 0) {
          setSelectedControlIds([twinData.controls[0].id]);
        }

        const twinsList = await apiClient.listTwins();
        setAvailableTwins(twinsList);

        // Ping health check to determine if backend is live
        try {
          const healthRes = await fetch('/api/');
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

  // 3. Control Toggle Handler
  const handleToggleControl = (controlId: string) => {
    setSelectedControlIds((prev) =>
      prev.includes(controlId) ? prev.filter((id) => id !== controlId) : [...prev, controlId]
    );
  };

  // 4. Live Breach Simulation (Falling nodes cascade)
  const handleRunSimulation = async () => {
    if (!twin || isSimulating) return;

    setIsSimulating(true);
    setCompromisedNodeIds([]);
    setSimulationSteps([]);

    try {
      const res = await apiClient.simulate({
        twin_id: twin.id,
        agent_id: 'adv-admin',
        seed: 42,
        n_walks: 200,
        control_ids: selectedControlIds,
      });

      // Animate the breach step-by-step
      if (res.attack_trajectory && res.attack_trajectory.length > 0) {
        let currentStep = 0;
        const totalSteps = res.attack_trajectory.length;

        const interval = setInterval(() => {
          if (currentStep < totalSteps) {
            const step = res.attack_trajectory[currentStep];
            setSimulationSteps((prev) => [...prev, step]);
            setCompromisedNodeIds((prev) => (prev.includes(step.asset_id) ? prev : [...prev, step.asset_id]));
            currentStep++;
          } else {
            clearInterval(interval);
            setIsSimulating(false);
          }
        }, 500);
      } else {
        setCompromisedNodeIds(res.compromised_nodes);
        setIsSimulating(false);
      }
    } catch (e) {
      console.error('Breach simulation failed:', e);
      setIsSimulating(false);
    }
  };

  // 5. Reset Simulation
  const handleResetSimulation = () => {
    setCompromisedNodeIds([]);
    setSimulationSteps([]);
    setIsSimulating(false);
  };

  // 6. Reset Scenario to Baseline
  const handleResetScenario = () => {
    if (twin && twin.controls.length > 0) {
      setSelectedControlIds([twin.controls[0].id]);
    } else {
      setSelectedControlIds([]);
    }
    handleResetSimulation();
    setOptimizationResult(null);
  };

  // Switch between loaded scenarios
  const handleSelectTwin = async (twinId: string) => {
    try {
      const loadedTwin = await apiClient.getTwin(twinId);
      setTwin(loadedTwin);
      setSelectedControlIds(loadedTwin.controls.length > 0 ? [loadedTwin.controls[0].id] : []);
      handleResetSimulation();
      setOptimizationResult(null);
    } catch (e) {
      console.error('Failed to switch twin scenario:', e);
    }
  };

  // 7. Solve Portfolio Optimization
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

  // 8. Inspect Blast Radius
  const handleInspectBlastRadius = async (assetId: string) => {
    try {
      const data = await apiClient.getBlastRadius(assetId);
      setBlastRadiusData(data);
    } catch (e) {
      console.error('Failed to get blast radius:', e);
    }
  };

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

  // Determine broken flow IDs from current verdict
  const brokenFlowIds = verdict ? verdict.broken_flows.map((f) => f.id) : [];

  // Active control names
  const activeControlNames = twin.controls
    .filter((c) => selectedControlIds.includes(c.id))
    .map((c) => c.name);

  return (
    <div className="min-h-screen bg-[#FAFAFA] bg-tech-grid text-ash-900 flex flex-col font-sans">
      {/* Navigation Header */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isBackendLive={isBackendLive}
        onReset={handleResetScenario}
        onOpenImportExport={() => setIsImportExportOpen(true)}
        currentTwinId={twin.id}
        onSelectTwin={handleSelectTwin}
        availableTwins={availableTwins}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {activeTab === 'topology' && (
          <TopologyCanvas
            assets={twin.assets}
            edges={twin.edges}
            flows={twin.flows}
            compromisedNodeIds={compromisedNodeIds}
            simulationSteps={simulationSteps}
            isSimulating={isSimulating}
            brokenFlowIds={brokenFlowIds}
            onRunSimulation={handleRunSimulation}
            onResetSimulation={handleResetSimulation}
            onInspectBlastRadius={handleInspectBlastRadius}
            activeControlNames={activeControlNames}
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
      </main>

      {/* Blast Radius Inspection Modal */}
      <BlastRadiusModal
        data={blastRadiusData}
        onClose={() => setBlastRadiusData(null)}
      />

      {/* Import / Export Modal */}
      <ImportExportModal
        isOpen={isImportExportOpen}
        onClose={() => setIsImportExportOpen(false)}
        currentTwin={twin}
        onTwinImported={async (newTwin) => {
          setTwin(newTwin);
          setSelectedControlIds(newTwin.controls.length > 0 ? [newTwin.controls[0].id] : []);
          handleResetSimulation();
          setOptimizationResult(null);
          const twinsList = await apiClient.listTwins();
          setAvailableTwins(twinsList);
        }}
      />


      {/* Minimalist Footer / Metadata Strip */}
      <footer className="border-t border-canvas-border bg-white px-6 py-3 text-xs font-mono text-ash-400 flex flex-col sm:flex-row items-center justify-between gap-2 shadow-subtle">
        <div className="flex items-center gap-4">
          <span>Snapshot Hash: <strong className="text-ash-700">sha256:7f3a9e2d...</strong></span>
          <span>Deterministic Seed: <strong className="text-brand-orange">42</strong></span>
        </div>
        <div>
          <span>Security Change Sandbox • Digital Twin Model</span>
        </div>
      </footer>
    </div>
  );
};
