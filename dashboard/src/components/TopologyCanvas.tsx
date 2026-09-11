import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Play,
  RotateCcw,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Lock,
  Activity,
  Radio,
  Eye,
  GitFork,
  X,
  FastForward,
  Info,
} from 'lucide-react';
import { Asset, ServiceFlow, SimulationStep, Edge, Control, BlastRadiusResponse } from '../types/api';
import { DemoPresetId } from '../types/presets';
import { NodeCard, NodeVisualState } from './NodeCard';
import { TopologyEdgeOverlay, ViewFilterMode } from './TopologyEdgeOverlay';

interface TopologyCanvasProps {
  assets: Asset[];
  edges?: Edge[];
  flows: ServiceFlow[];
  controls?: Control[];
  selectedControlIds?: string[];
  compromisedNodeIds: string[];
  simulationSteps: SimulationStep[];
  isSimulating: boolean;
  brokenFlowIds: string[];
  onRunSimulation: () => void;
  onResetSimulation: () => void;
  onInspectBlastRadius: (assetId: string) => void;
  activeControlNames: string[];
  blastRadiusData?: BlastRadiusResponse | null;
  onClearBlastRadius?: () => void;
  currentTwinId?: string;
  // Demo Preset Props
  activePresetId?: DemoPresetId;
  isReroutingActive?: boolean;
  reroutingCaption?: string;
  isDriftActive?: boolean;
  isP1OutageActive?: boolean;
  riskScorePct?: number;
}

export const TopologyCanvas: React.FC<TopologyCanvasProps> = ({
  assets,
  edges = [],
  flows,
  controls = [],
  selectedControlIds = [],
  compromisedNodeIds,
  simulationSteps,
  isSimulating,
  brokenFlowIds,
  onRunSimulation,
  onResetSimulation,
  onInspectBlastRadius,
  activeControlNames,
  blastRadiusData = null,
  onClearBlastRadius,
  currentTwinId,
  activePresetId,
  isReroutingActive,
  reroutingCaption,
  isDriftActive,
  isP1OutageActive,
  riskScorePct,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // View Filter Mode: 'all' | 'attack' | 'flows'
  const [viewMode, setViewMode] = useState<ViewFilterMode>('all');

  // Hovered connection ID for cross-component highlighting
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Local Blast Radius selection state
  const [selectedBlastNodeId, setSelectedBlastNodeId] = useState<string | null>(null);

  // Sync external blastRadiusData if passed
  useEffect(() => {
    if (blastRadiusData) {
      setSelectedBlastNodeId(blastRadiusData.source_asset_id);
    }
  }, [blastRadiusData]);

  // Compute downstream reachability for active blast radius
  const { reachableNodeIds, blastSourceAsset } = useMemo(() => {
    if (!selectedBlastNodeId) {
      return { reachableNodeIds: new Set<string>(), blastSourceAsset: null };
    }

    const source = assets.find((a) => a.id === selectedBlastNodeId) || null;
    const visited = new Set<string>();
    const queue = [selectedBlastNodeId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      // Find outbound edges from current
      edges.forEach((e) => {
        if (e.src === current && !visited.has(e.dst)) {
          visited.add(e.dst);
          queue.push(e.dst);
        }
      });
      // Also check operational flows
      flows.forEach((f) => {
        if (f.src === current && !visited.has(f.dst)) {
          visited.add(f.dst);
          queue.push(f.dst);
        }
      });
    }

    return { reachableNodeIds: visited, blastSourceAsset: source };
  }, [selectedBlastNodeId, assets, edges, flows]);

  // Derive traversed edges, blocked edges, pivot routes, and active edge traversal from simulation steps
  const { traversedEdgeKeys, blockedEdgeKeys, pivotEdgeKeys, activeTraversal, latestStep } = useMemo(() => {
    const traversed = new Set<string>();
    const blocked = new Set<string>();
    const pivots = new Set<string>();
    let active: { src: string; dst: string; isBlocked?: boolean; isPivot?: boolean } | null = null;
    let latest: SimulationStep | null = null;

    if (simulationSteps.length > 0) {
      latest = simulationSteps[simulationSteps.length - 1];

      for (let i = 0; i < simulationSteps.length; i++) {
        const step = simulationSteps[i];
        const prevStep = i > 0 ? simulationSteps[i - 1] : null;
        const srcId = step.src_asset_id || (prevStep ? prevStep.asset_id : null);

        if (srcId && srcId !== step.asset_id) {
          const key = `${srcId}->${step.asset_id}`;
          if (step.status === 'blocked') {
            blocked.add(key);
          } else {
            traversed.add(key);
          }

          if (step.is_pivot) {
            pivots.add(key);
          }

          // If this is the active latest step while simulation is running
          if (i === simulationSteps.length - 1 && isSimulating) {
            active = {
              src: srcId,
              dst: step.asset_id,
              isBlocked: step.status === 'blocked',
              isPivot: step.is_pivot,
            };
          }
        }
      }
    }

    return {
      traversedEdgeKeys: traversed,
      blockedEdgeKeys: blocked,
      pivotEdgeKeys: pivots,
      activeTraversal: active,
      latestStep: latest,
    };
  }, [simulationSteps, isSimulating]);

  // Handle in-graph Blast Radius click / toggle
  const handleInspectBlastRadius = (assetId: string) => {
    if (selectedBlastNodeId === assetId) {
      setSelectedBlastNodeId(null);
      if (onClearBlastRadius) onClearBlastRadius();
    } else {
      setSelectedBlastNodeId(assetId);
    }
  };

  const handleClearBlast = () => {
    setSelectedBlastNodeId(null);
    if (onClearBlastRadius) onClearBlastRadius();
  };

  // Segment assets into architectural zones
  const dmzAssets = assets.filter((a) => a.zone === 'dmz');
  const corpAssets = assets.filter((a) => a.zone === 'corp');
  const mgmtAssets = assets.filter((a) => a.zone === 'mgmt');
  const prodAssets = assets.filter((a) => a.zone === 'prod');

  const getNodeState = (assetId: string): NodeVisualState => {
    if (compromisedNodeIds.includes(assetId)) {
      return 'compromised';
    }
    // Protected node verification
    const isCrownJewel = assets.find((a) => a.id === assetId)?.crown_jewel;
    if (
      activeControlNames.length > 0 &&
      (isCrownJewel || assetId === 'prod-db' || assetId === 'backup-01') &&
      !compromisedNodeIds.includes(assetId)
    ) {
      return 'protected';
    }
    return 'healthy';
  };

  const getStepNumber = (assetId: string): number | undefined => {
    const step = simulationSteps.find((s) => s.asset_id === assetId && s.status === 'compromised');
    return step ? step.step_index : undefined;
  };

  const isStepBlocked = (assetId: string): boolean => {
    const step = simulationSteps.find((s) => s.asset_id === assetId && s.status === 'blocked');
    return !!step;
  };

  const isStepPivot = (assetId: string): boolean => {
    const step = simulationSteps.find((s) => s.asset_id === assetId && s.is_pivot);
    return !!step;
  };

  return (
    <div className="space-y-6">
      {/* Simulation Command Bar */}
      <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 p-4 rounded-xl bg-white border border-canvas-border shadow-subtle">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-brand-orange-light text-brand-orange border border-brand-orange-border">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-ash-900 tracking-tight">
                Adversary Traversal & Business Dependency Graph
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-brand-orange-light text-brand-orange border border-brand-orange-border">
                DIGITAL TWIN V2.1
              </span>
            </div>
            <p className="text-xs text-ash-500 mt-0.5">
              Interactive directed topology graph modelling lateral adversary movement, active security controls, and operational flows
            </p>
          </div>
        </div>

        {/* Action Controls Strip */}
        <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto justify-start xl:justify-end">
          {/* View Filter Mode Toggle */}
          <div className="flex items-center rounded-lg border border-canvas-border bg-ash-50 p-0.5 text-xs font-mono">
            <button
              onClick={() => setViewMode('all')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                viewMode === 'all'
                  ? 'bg-white text-ash-900 font-bold shadow-subtle'
                  : 'text-ash-500 hover:text-ash-800'
              }`}
            >
              All Links
            </button>
            <button
              onClick={() => setViewMode('attack')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                viewMode === 'attack'
                  ? 'bg-white text-brand-orange font-bold shadow-subtle'
                  : 'text-ash-500 hover:text-ash-800'
              }`}
            >
              Attack Vectors
            </button>
            <button
              onClick={() => setViewMode('flows')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                viewMode === 'flows'
                  ? 'bg-white text-emerald-700 font-bold shadow-subtle'
                  : 'text-ash-500 hover:text-ash-800'
              }`}
            >
              Service Flows
            </button>
          </div>

          {/* Active Controls Indicator */}
          {activeControlNames.length > 0 && (
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-ash-100 border border-ash-200 text-xs font-mono text-ash-700">
              <Lock className="w-3 h-3 text-brand-orange" />
              <span className="truncate max-w-[200px]" title={activeControlNames.join(', ')}>
                Active: {activeControlNames.join(', ')}
              </span>
            </div>
          )}

          {/* Run Simulation Button */}
          <button
            onClick={onRunSimulation}
            disabled={isSimulating}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-[0.98] ${
              isSimulating
                ? 'bg-ash-200 text-ash-400 cursor-not-allowed'
                : 'bg-brand-orange hover:bg-brand-orange-hover text-white shadow-subtle'
            }`}
          >
            <Play className={`w-3.5 h-3.5 fill-current ${isSimulating ? 'animate-spin' : ''}`} />
            <span>{isSimulating ? 'Simulating Breach...' : 'Run Breach Simulation'}</span>
          </button>

          {/* Reset Simulation Button */}
          <button
            onClick={onResetSimulation}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-ash-50 text-ash-700 border border-ash-200 text-xs font-medium transition-all active:scale-[0.98] shadow-subtle"
            title="Reset simulation markers and trajectory"
          >
            <RotateCcw className="w-3.5 h-3.5 text-ash-400" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Active Blast Radius HUD Banner */}
      {selectedBlastNodeId && blastSourceAsset && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-amber-50/80 border border-amber-300 shadow-subtle animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500 text-white shadow-subtle">
              <Radio className="w-4 h-4 animate-spin" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-amber-800">
                  INTERACTIVE BLAST RADIUS ACTIVE
                </span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-200 text-amber-900">
                  Source: {blastSourceAsset.name} ({blastSourceAsset.id})
                </span>
              </div>
              <p className="text-xs text-amber-800 mt-0.5 font-sans">
                Showing all downstream reachable assets (<strong>{reachableNodeIds.size} reachable nodes</strong>). Unaffected assets and edges are dimmed.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onInspectBlastRadius(selectedBlastNodeId)}
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-mono font-semibold transition-colors shadow-subtle"
            >
              View CAB Modal
            </button>
            <button
              onClick={handleClearBlast}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-mono font-semibold transition-colors shadow-subtle"
            >
              <X className="w-3 h-3" />
              <span>Clear Blast Radius</span>
            </button>
          </div>
        </div>
      )}

      {/* Adversary Simulation Telemetry HUD Strip */}
      {simulationSteps.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-white border border-canvas-border shadow-subtle">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg text-white shadow-subtle ${
                latestStep?.status === 'blocked'
                  ? 'bg-red-600 animate-pulse'
                  : latestStep?.is_pivot
                  ? 'bg-amber-500 animate-pulse'
                  : latestStep?.asset_id === 'prod-db'
                  ? 'bg-brand-orange animate-bounce'
                  : 'bg-brand-orange'
              }`}
            >
              {latestStep?.status === 'blocked' ? (
                <Lock className="w-4 h-4" />
              ) : latestStep?.is_pivot ? (
                <GitFork className="w-4 h-4" />
              ) : (
                <Activity className="w-4 h-4" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-ash-500">
                  ATTACK TRAJECTORY STEP {latestStep?.step_index} / {simulationSteps.length}
                </span>
                {latestStep?.is_pivot && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    ADVERSARY RE-PLANNING ACTIVE
                  </span>
                )}
                {latestStep?.status === 'blocked' && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-red-100 text-red-800 border border-red-300">
                    BLOCKED BY DEFENSIVE CONTROL
                  </span>
                )}
              </div>
              <p className="text-xs text-ash-800 font-sans font-medium mt-0.5">
                {latestStep?.notes || `Adversary target: ${latestStep?.asset_name} via ${latestStep?.technique}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-ash-600">
            <span>Cumulative Cost: <strong>${latestStep ? (latestStep.cost * 100).toFixed(0) : 0}</strong></span>
            <span>Noise: <strong>{latestStep ? (latestStep.noise * 100).toFixed(0) : 0}%</strong></span>
          </div>
        </div>
      )}

      {/* Main 4-Zone Enterprise Architecture Directed Graph Container */}
      <div
        ref={containerRef}
        className="relative rounded-2xl bg-ash-50/60 border border-canvas-border p-6 shadow-subtle min-h-[580px] overflow-visible select-none"
      >
        {/* Directed SVG Graph Overlay Layer */}
        <TopologyEdgeOverlay
          containerRef={containerRef}
          assets={assets}
          edges={edges}
          flows={flows}
          controls={controls}
          selectedControlIds={selectedControlIds}
          brokenFlowIds={brokenFlowIds}
          activeTraversal={activeTraversal}
          traversedEdgeKeys={traversedEdgeKeys}
          blockedEdgeKeys={blockedEdgeKeys}
          pivotEdgeKeys={pivotEdgeKeys}
          blastRadiusEpicenter={selectedBlastNodeId}
          reachableNodeIds={reachableNodeIds}
          viewMode={viewMode}
          hoveredEdgeId={hoveredEdgeId}
          onHoverEdge={setHoveredEdgeId}
          currentTwinId={currentTwinId}
          activePresetId={activePresetId}
          isReroutingActive={isReroutingActive}
          reroutingCaption={reroutingCaption}
          isDriftActive={isDriftActive}
          isP1OutageActive={isP1OutageActive}
        />

        {/* 4 Architectural Zone Columns Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8 relative z-10">
          {/* Zone 1: DMZ (Public Facing) */}
          <div className="rounded-xl bg-white/75 backdrop-blur-sm border border-canvas-border p-3.5 space-y-3 shadow-subtle flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-canvas-border mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-xs" />
                  <h4 className="text-xs font-mono uppercase font-bold text-ash-800 tracking-wider">
                    1. DMZ Zone
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-ash-400">
                  Public Ingress
                </span>
              </div>
              <div className="space-y-2.5">
                {dmzAssets.map((asset) => (
                  <NodeCard
                    key={asset.id}
                    asset={asset}
                    visualState={getNodeState(asset.id)}
                    stepNumber={getStepNumber(asset.id)}
                    isBlastEpicenter={selectedBlastNodeId === asset.id}
                    isInBlastRadius={reachableNodeIds.has(asset.id)}
                    isDimmed={!!selectedBlastNodeId && selectedBlastNodeId !== asset.id && !reachableNodeIds.has(asset.id)}
                    isReplanPivot={isStepPivot(asset.id)}
                    blockedWarning={isStepBlocked(asset.id)}
                    isHovered={hoveredNodeId === asset.id}
                    onInspectBlastRadius={handleInspectBlastRadius}
                    onMouseEnter={() => setHoveredNodeId(asset.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                  />
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-canvas-border text-[10px] font-mono text-ash-400 flex items-center justify-between">
              <span>Untrusted Boundary</span>
              <span>{dmzAssets.length} Ingress Nodes</span>
            </div>
          </div>

          {/* Zone 2: Corporate LAN (Internal LAN & Build Systems) */}
          <div className="rounded-xl bg-white/75 backdrop-blur-sm border border-canvas-border p-3.5 space-y-3 shadow-subtle flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-canvas-border mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-xs" />
                  <h4 className="text-xs font-mono uppercase font-bold text-ash-800 tracking-wider">
                    2. Corporate LAN
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-ash-400">
                  Workstations & CI
                </span>
              </div>
              <div className="space-y-2.5">
                {corpAssets.map((asset) => (
                  <NodeCard
                    key={asset.id}
                    asset={asset}
                    visualState={getNodeState(asset.id)}
                    stepNumber={getStepNumber(asset.id)}
                    isBlastEpicenter={selectedBlastNodeId === asset.id}
                    isInBlastRadius={reachableNodeIds.has(asset.id)}
                    isDimmed={!!selectedBlastNodeId && selectedBlastNodeId !== asset.id && !reachableNodeIds.has(asset.id)}
                    isReplanPivot={isStepPivot(asset.id)}
                    blockedWarning={isStepBlocked(asset.id)}
                    isHovered={hoveredNodeId === asset.id}
                    onInspectBlastRadius={handleInspectBlastRadius}
                    onMouseEnter={() => setHoveredNodeId(asset.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                  />
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-canvas-border text-[10px] font-mono text-ash-400 flex items-center justify-between">
              <span>Lateral Expansion</span>
              <span>{corpAssets.length} Workstations/Agents</span>
            </div>
          </div>

          {/* Zone 3: Management Bastion (Tier-0 Bastion & Backup Vault) */}
          <div className="rounded-xl bg-white/75 backdrop-blur-sm border border-canvas-border p-3.5 space-y-3 shadow-subtle flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-canvas-border mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-xs" />
                  <h4 className="text-xs font-mono uppercase font-bold text-ash-800 tracking-wider">
                    3. Management Bastion
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-ash-400">
                  Tier-0 Gateway & IAM
                </span>
              </div>
              <div className="space-y-2.5">
                {mgmtAssets.map((asset) => (
                  <NodeCard
                    key={asset.id}
                    asset={asset}
                    visualState={getNodeState(asset.id)}
                    stepNumber={getStepNumber(asset.id)}
                    isBlastEpicenter={selectedBlastNodeId === asset.id}
                    isInBlastRadius={reachableNodeIds.has(asset.id)}
                    isDimmed={!!selectedBlastNodeId && selectedBlastNodeId !== asset.id && !reachableNodeIds.has(asset.id)}
                    isReplanPivot={isStepPivot(asset.id)}
                    blockedWarning={isStepBlocked(asset.id)}
                    isHovered={hoveredNodeId === asset.id}
                    onInspectBlastRadius={handleInspectBlastRadius}
                    onMouseEnter={() => setHoveredNodeId(asset.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                  />
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-canvas-border text-[10px] font-mono text-ash-400 flex items-center justify-between">
              <span>Choke Point Barrier</span>
              <span>{mgmtAssets.length} Bastions / Identity</span>
            </div>
          </div>

          {/* Zone 4: Production Data Secure Zone (Crown Storage) */}
          <div className="rounded-xl bg-white/75 backdrop-blur-sm border border-canvas-border p-3.5 space-y-3 shadow-subtle flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-canvas-border mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs" />
                  <h4 className="text-xs font-mono uppercase font-bold text-ash-800 tracking-wider">
                    4. Production Data Zone
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-ash-400">
                  Crown Jewels & Clearing
                </span>
              </div>
              <div className="space-y-2.5">
                {prodAssets.map((asset) => (
                  <NodeCard
                    key={asset.id}
                    asset={asset}
                    visualState={getNodeState(asset.id)}
                    stepNumber={getStepNumber(asset.id)}
                    isBlastEpicenter={selectedBlastNodeId === asset.id}
                    isInBlastRadius={reachableNodeIds.has(asset.id)}
                    isDimmed={!!selectedBlastNodeId && selectedBlastNodeId !== asset.id && !reachableNodeIds.has(asset.id)}
                    isReplanPivot={isStepPivot(asset.id)}
                    blockedWarning={isStepBlocked(asset.id)}
                    isHovered={hoveredNodeId === asset.id}
                    onInspectBlastRadius={handleInspectBlastRadius}
                    onMouseEnter={() => setHoveredNodeId(asset.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                  />
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-canvas-border text-[10px] font-mono text-ash-400 flex items-center justify-between">
              <span>Tier-0 Ledger Target</span>
              <span>{prodAssets.length} Crown Assets</span>
            </div>
          </div>
        </div>
      </div>

      {/* Business Service Flows Panel (Operational Dependencies) */}
      <div className="rounded-xl bg-white border border-canvas-border p-5 space-y-4 shadow-subtle">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-canvas-border">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-brand-orange-light text-brand-orange border border-brand-orange-border">
                BUSINESS CONTINUITY
              </span>
              <h3 className="text-sm font-bold text-ash-900">
                Operational Business Service Flows (ServiceFlow Registry)
              </h3>
            </div>
            <p className="text-xs text-ash-500 mt-0.5">
              Legitimate enterprise dependencies rendered as cyan/emerald dashed paths on the graph, audited for collateral severance
            </p>
          </div>

          <div className="text-xs font-mono flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-ash-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Active ({flows.length - brokenFlowIds.length})</span>
            </span>
            <span className="flex items-center gap-1.5 text-red-600">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="font-semibold">Severed ({brokenFlowIds.length})</span>
            </span>
          </div>
        </div>

        {/* Flows Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {flows.map((flow) => {
            const isBroken = brokenFlowIds.includes(flow.id);
            const isCritical = flow.criticality >= 4;
            const flowEdgeId = `flow-${flow.id}`;
            const isFlowHovered = hoveredEdgeId === flowEdgeId;

            return (
              <div
                key={flow.id}
                onMouseEnter={() => setHoveredEdgeId(flowEdgeId)}
                onMouseLeave={() => setHoveredEdgeId(null)}
                className={`p-3 rounded-lg border transition-all duration-200 font-sans cursor-pointer ${
                  isBroken
                    ? 'bg-red-50/80 border-red-300 shadow-sm'
                    : isFlowHovered
                    ? 'bg-emerald-50/70 border-emerald-400 shadow-sm scale-[1.01]'
                    : 'bg-ash-100/40 border-canvas-border hover:border-ash-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                        isBroken
                          ? 'bg-red-600 text-white'
                          : 'bg-ash-200 text-ash-700'
                      }`}
                    >
                      {flow.id}
                    </span>
                    <h5
                      className={`text-xs font-semibold leading-tight ${
                        isBroken ? 'text-red-900' : 'text-ash-900'
                      }`}
                    >
                      {flow.name}
                    </h5>
                  </div>

                  <span
                    className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold border ${
                      isCritical
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-ash-100 text-ash-600 border-ash-200'
                    }`}
                  >
                    Crit {flow.criticality}
                  </span>
                </div>

                {/* Connection Flow: Src -> Dst */}
                <div className="flex items-center justify-between text-[10px] font-mono pt-1.5 border-t border-canvas-border text-ash-600">
                  <span className="truncate max-w-[110px]" title={flow.src}>
                    {flow.src}
                  </span>
                  <div className="flex items-center gap-1 text-ash-400">
                    <div
                      className={`h-[1.5px] w-6 ${
                        isBroken ? 'bg-red-500' : 'bg-emerald-500'
                      } border-dashed`}
                    />
                    <ArrowRight
                      className={`w-3 h-3 ${
                        isBroken ? 'text-red-500' : 'text-emerald-600'
                      }`}
                    />
                  </div>
                  <span className="truncate max-w-[110px]" title={flow.dst}>
                    {flow.dst}
                  </span>
                </div>

                {/* Severed Alert Notice */}
                {isBroken && (
                  <div className="mt-2 flex items-center gap-1.5 p-1.5 rounded bg-red-100/90 text-[10px] font-mono font-semibold text-red-800 border border-red-300">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0 text-red-600 animate-pulse" />
                    <span>SEVERED SERVICE FLOW: BLOCKED BY POLICY</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
