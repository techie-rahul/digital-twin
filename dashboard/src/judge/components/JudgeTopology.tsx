import React, { useState, useRef, useEffect } from 'react';
import { Play, RotateCcw, Lock, X, Radio } from 'lucide-react';
import { Asset, ServiceFlow, SimulationStep, Edge, Control, BlastRadiusResponse } from '../../types/api';
import { DemoPresetId } from '../../types/presets';
import { NodeCard } from '../../components/NodeCard';
import { TopologyEdgeOverlay, ViewFilterMode } from '../../components/TopologyEdgeOverlay';
import { useTopologyDerivedState } from '../hooks/useTopologyDerivedState';
import { JudgeFlowsPanel } from './JudgeFlowsPanel';

interface JudgeTopologyProps {
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
  activePresetId?: DemoPresetId;
  isReroutingActive?: boolean;
  reroutingCaption?: string;
  isDriftActive?: boolean;
  isP1OutageActive?: boolean;
  riskScorePct?: number;
}

const ZONES: { key: 'dmz' | 'corp' | 'mgmt' | 'prod'; label: string; dot: string }[] = [
  { key: 'dmz', label: 'DMZ', dot: 'bg-amber-500' },
  { key: 'corp', label: 'Corporate LAN', dot: 'bg-blue-500' },
  { key: 'mgmt', label: 'Management Bastion', dot: 'bg-purple-500' },
  { key: 'prod', label: 'Production', dot: 'bg-emerald-500' },
];

export const JudgeTopology: React.FC<JudgeTopologyProps> = ({
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
  activePresetId,
  isReroutingActive,
  reroutingCaption,
  isDriftActive,
  isP1OutageActive,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<ViewFilterMode>('all');
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedBlastNodeId, setSelectedBlastNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (blastRadiusData) setSelectedBlastNodeId(blastRadiusData.source_asset_id);
  }, [blastRadiusData]);

  const {
    reachableNodeIds,
    blastSourceAsset,
    traversedEdgeKeys,
    blockedEdgeKeys,
    pivotEdgeKeys,
    activeTraversal,
    latestStep,
    zones,
    getNodeState,
    getStepNumber,
    isStepBlocked,
    isStepPivot,
  } = useTopologyDerivedState({
    assets,
    edges,
    flows,
    controls,
    selectedControlIds,
    activeControlNames,
    compromisedNodeIds,
    simulationSteps,
    isSimulating,
    selectedBlastNodeId,
  });

  const handleInspectBlastRadius = (assetId: string) => {
    if (selectedBlastNodeId === assetId) {
      setSelectedBlastNodeId(null);
      onClearBlastRadius?.();
    } else {
      setSelectedBlastNodeId(assetId);
    }
  };

  const handleClearBlast = () => {
    setSelectedBlastNodeId(null);
    onClearBlastRadius?.();
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-white border border-canvas-border shadow-subtle">
        <div className="flex items-center rounded-lg border border-canvas-border bg-ash-100 p-0.5 text-xs font-mono">
          {(['all', 'attack', 'flows'] as ViewFilterMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-2.5 py-1 rounded-md transition-colors capitalize ${
                viewMode === mode ? 'bg-white text-ash-900 font-bold shadow-subtle' : 'text-ash-500 hover:text-ash-800'
              }`}
            >
              {mode === 'all' ? 'All links' : mode === 'attack' ? 'Attack vectors' : 'Service flows'}
            </button>
          ))}
        </div>

        {activeControlNames.length > 0 && (
          <span className="text-xs font-mono text-ash-600 truncate max-w-[280px]" title={activeControlNames.join(', ')}>
            Active: {activeControlNames.join(', ')}
          </span>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={onRunSimulation}
            disabled={isSimulating}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              isSimulating ? 'bg-ash-200 text-ash-400 cursor-not-allowed' : 'bg-brand-orange hover:bg-brand-orange-hover text-white'
            }`}
          >
            <Play className={`w-3.5 h-3.5 fill-current ${isSimulating ? 'animate-spin' : ''}`} />
            <span>{isSimulating ? 'Simulating…' : 'Run breach simulation'}</span>
          </button>
          <button
            onClick={onResetSimulation}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white hover:bg-ash-100 text-ash-700 border border-ash-200 text-xs font-medium transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-ash-400" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Blast radius strip */}
      {selectedBlastNodeId && blastSourceAsset && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs">
          <span className="flex items-center gap-2 text-amber-900">
            <Radio className="w-3.5 h-3.5 text-amber-600" />
            Blast radius from <strong>{blastSourceAsset.name}</strong>: {reachableNodeIds.size} reachable nodes
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onInspectBlastRadius(selectedBlastNodeId)}
              className="px-2 py-1 rounded-md bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-mono font-semibold"
            >
              Details
            </button>
            <button
              onClick={handleClearBlast}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-mono font-semibold"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Simulation strip */}
      {simulationSteps.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-lg bg-white border border-canvas-border text-xs">
          <span className="flex items-center gap-2 text-ash-800">
            {latestStep?.status === 'blocked' && <Lock className="w-3.5 h-3.5 text-red-600" />}
            <span className="font-mono text-[10px] uppercase text-ash-400">
              Step {latestStep?.step_index}/{simulationSteps.length}
            </span>
            <span>{latestStep?.notes || `${latestStep?.asset_name} via ${latestStep?.technique}`}</span>
          </span>
          <span className="font-mono text-ash-500">
            Cost ${latestStep ? (latestStep.cost * 100).toFixed(0) : 0} · Noise {latestStep ? (latestStep.noise * 100).toFixed(0) : 0}%
          </span>
        </div>
      )}

      {/* Graph */}
      <div ref={containerRef} className="relative rounded-2xl bg-ash-100/50 border border-canvas-border p-5 min-h-[560px] overflow-visible select-none">
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
          activePresetId={activePresetId}
          isReroutingActive={isReroutingActive}
          reroutingCaption={reroutingCaption}
          isDriftActive={isDriftActive}
          isP1OutageActive={isP1OutageActive}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 relative z-10">
          {ZONES.map(({ key, label, dot }) => (
            <div key={key} className="rounded-xl bg-white/80 backdrop-blur-sm border border-canvas-border p-3 space-y-2.5">
              <div className="flex items-center gap-2 pb-2 border-b border-canvas-border">
                <span className={`w-2 h-2 rounded-full ${dot}`} />
                <h4 className="text-[11px] font-mono uppercase font-bold text-ash-700 tracking-wide">{label}</h4>
              </div>
              <div className="space-y-2">
                {zones[key].map((asset) => (
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
          ))}
        </div>
      </div>

      <JudgeFlowsPanel flows={flows} brokenFlowIds={brokenFlowIds} onHoverFlow={setHoveredEdgeId} />
    </div>
  );
};
