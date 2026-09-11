import React, { useState } from 'react';
import { Play, RotateCcw, AlertTriangle, ArrowRight, ShieldCheck, Lock, Activity, Network, LayoutGrid } from 'lucide-react';
import { Asset, Edge, ServiceFlow, SimulationStep } from '../types/api';
import { NodeCard, NodeVisualState } from './NodeCard';
import { NetworkGraphView } from './NetworkGraphView';

interface TopologyCanvasProps {
  assets: Asset[];
  edges?: Edge[];
  flows: ServiceFlow[];
  compromisedNodeIds: string[];
  simulationSteps: SimulationStep[];
  isSimulating: boolean;
  brokenFlowIds: string[];
  onRunSimulation: () => void;
  onResetSimulation: () => void;
  onInspectBlastRadius: (assetId: string) => void;
  activeControlNames: string[];
}

export const TopologyCanvas: React.FC<TopologyCanvasProps> = ({
  assets,
  edges = [],
  flows,
  compromisedNodeIds,
  simulationSteps,
  isSimulating,
  brokenFlowIds,
  onRunSimulation,
  onResetSimulation,
  onInspectBlastRadius,
  activeControlNames,
}) => {
  const [viewMode, setViewMode] = useState<'graph' | 'grid'>('graph');

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
    if (activeControlNames.length > 0 && (assetId === 'prod-db' || assetId === 'backup-01')) {
      return 'protected';
    }
    return 'healthy';
  };

  const getStepNumber = (assetId: string): number | undefined => {
    const step = simulationSteps.find((s) => s.asset_id === assetId);
    return step ? step.step_index : undefined;
  };

  return (
    <div className="space-y-6">
      {/* Simulation Command Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-white border border-canvas-border shadow-subtle">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-orange-light text-brand-orange border border-brand-orange-border">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ash-900 tracking-tight">
              Adversary Traversal & Business Dependency Graph
            </h3>
            <p className="text-xs text-ash-500">
              Evaluates stochastic lateral attacker expansion against active security controls and operational flows
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* View Mode Toggle */}
          <div className="flex items-center p-0.5 rounded-lg bg-ash-100 border border-ash-200 text-xs">
            <button
              onClick={() => setViewMode('graph')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                viewMode === 'graph'
                  ? 'bg-white text-brand-orange font-bold shadow-sm'
                  : 'text-ash-500 hover:text-ash-800'
              }`}
              title="Interactive Node-Link Network Graph"
            >
              <Network className="w-3.5 h-3.5" />
              <span>Network Graph</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                viewMode === 'grid'
                  ? 'bg-white text-brand-orange font-bold shadow-sm'
                  : 'text-ash-500 hover:text-ash-800'
              }`}
              title="Architectural Zone Column Grid"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Zone Grid</span>
            </button>
          </div>

          {activeControlNames.length > 0 && (
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-ash-100 border border-ash-200 text-xs font-mono text-ash-700">
              <Lock className="w-3 h-3 text-brand-orange" />
              <span>Active: {activeControlNames.join(', ')}</span>
            </div>
          )}

          <button
            onClick={onRunSimulation}
            disabled={isSimulating}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-[0.98] ${
              isSimulating
                ? 'bg-ash-200 text-ash-400 cursor-not-allowed'
                : 'bg-brand-orange hover:bg-brand-orange-hover text-white shadow-subtle'
            }`}
          >
            <Play className={`w-3.5 h-3.5 fill-current ${isSimulating ? 'animate-spin' : ''}`} />
            <span>{isSimulating ? 'Executing Simulation...' : 'Run Breach Simulation'}</span>
          </button>

          <button
            onClick={onResetSimulation}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-ash-50 text-ash-700 border border-ash-200 text-xs font-medium transition-all active:scale-[0.98] shadow-subtle"
          >
            <RotateCcw className="w-3.5 h-3.5 text-ash-400" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Main Canvas View: Interactive Network Graph or 4-Zone Enterprise Architecture Grid */}
      {viewMode === 'graph' ? (
        <NetworkGraphView
          assets={assets}
          edges={edges}
          flows={flows}
          compromisedNodeIds={compromisedNodeIds}
          simulationSteps={simulationSteps}
          isSimulating={isSimulating}
          onInspectBlastRadius={onInspectBlastRadius}
          brokenFlowIds={brokenFlowIds}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {/* Zone 1: DMZ */}
        <div className="rounded-xl bg-white border border-canvas-border p-4 space-y-3.5 shadow-subtle">
          <div className="flex items-center justify-between pb-2 border-b border-canvas-border">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <h4 className="text-xs font-mono uppercase font-bold text-ash-800 tracking-wider">
                1. DMZ Zone
              </h4>
            </div>
            <span className="text-[10px] font-mono text-ash-400">
              Public Facing
            </span>
          </div>
          <div className="space-y-3">
            {dmzAssets.map((asset) => (
              <NodeCard
                key={asset.id}
                asset={asset}
                visualState={getNodeState(asset.id)}
                stepNumber={getStepNumber(asset.id)}
                onInspectBlastRadius={onInspectBlastRadius}
              />
            ))}
          </div>
        </div>

        {/* Zone 2: Corporate LAN */}
        <div className="rounded-xl bg-white border border-canvas-border p-4 space-y-3.5 shadow-subtle">
          <div className="flex items-center justify-between pb-2 border-b border-canvas-border">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <h4 className="text-xs font-mono uppercase font-bold text-ash-800 tracking-wider">
                2. Corporate Zone
              </h4>
            </div>
            <span className="text-[10px] font-mono text-ash-400">
              Internal LAN
            </span>
          </div>
          <div className="space-y-3">
            {corpAssets.map((asset) => (
              <NodeCard
                key={asset.id}
                asset={asset}
                visualState={getNodeState(asset.id)}
                stepNumber={getStepNumber(asset.id)}
                onInspectBlastRadius={onInspectBlastRadius}
              />
            ))}
          </div>
        </div>

        {/* Zone 3: Management Zone */}
        <div className="rounded-xl bg-white border border-canvas-border p-4 space-y-3.5 shadow-subtle">
          <div className="flex items-center justify-between pb-2 border-b border-canvas-border">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              <h4 className="text-xs font-mono uppercase font-bold text-ash-800 tracking-wider">
                3. Management Zone
              </h4>
            </div>
            <span className="text-[10px] font-mono text-ash-400">
              Tier-0 Bastion
            </span>
          </div>
          <div className="space-y-3">
            {mgmtAssets.map((asset) => (
              <NodeCard
                key={asset.id}
                asset={asset}
                visualState={getNodeState(asset.id)}
                stepNumber={getStepNumber(asset.id)}
                onInspectBlastRadius={onInspectBlastRadius}
              />
            ))}
          </div>
        </div>

        {/* Zone 4: Production Data Secure Zone */}
        <div className="rounded-xl bg-white border border-canvas-border p-4 space-y-3.5 shadow-subtle">
          <div className="flex items-center justify-between pb-2 border-b border-canvas-border">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <h4 className="text-xs font-mono uppercase font-bold text-ash-800 tracking-wider">
                4. Production Zone
              </h4>
            </div>
            <span className="text-[10px] font-mono text-ash-400">
              Crown Storage
            </span>
          </div>
          <div className="space-y-3">
            {prodAssets.map((asset) => (
              <NodeCard
                key={asset.id}
                asset={asset}
                visualState={getNodeState(asset.id)}
                stepNumber={getStepNumber(asset.id)}
                onInspectBlastRadius={onInspectBlastRadius}
              />
            ))}
          </div>
        </div>
      </div>
      )}

      {/* Business Service Flows Panel */}
      <div className="rounded-xl bg-white border border-canvas-border p-5 space-y-4 shadow-subtle">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-canvas-border">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-brand-orange-light text-brand-orange border border-brand-orange-border">
                BUSINESS CONTINUITY
              </span>
              <h3 className="text-sm font-bold text-ash-900">
                Operational Business Service Flows (ServiceFlow)
              </h3>
            </div>
            <p className="text-xs text-ash-500 mt-0.5">
              Production dependencies monitored continuously for collateral disruption during proposed rule changes
            </p>
          </div>

          <div className="text-xs font-mono flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-ash-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Active ({flows.length - brokenFlowIds.length})</span>
            </span>
            <span className="flex items-center gap-1.5 text-red-600">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="font-semibold">Disrupted ({brokenFlowIds.length})</span>
            </span>
          </div>
        </div>

        {/* Flows Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {flows.map((flow) => {
            const isBroken = brokenFlowIds.includes(flow.id);
            const isCritical = flow.criticality >= 4;

            return (
              <div
                key={flow.id}
                className={`p-3 rounded-lg border transition-all duration-200 font-sans ${
                  isBroken
                    ? 'bg-red-50/70 border-red-200 shadow-sm'
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
                  <span className="truncate max-w-[110px]">{flow.src}</span>
                  <div className="flex items-center gap-1 text-ash-400">
                    <div className={`h-[1px] w-6 ${isBroken ? 'bg-red-400 dashed' : 'bg-ash-300'}`} />
                    <ArrowRight className={`w-3 h-3 ${isBroken ? 'text-red-500' : 'text-ash-400'}`} />
                  </div>
                  <span className="truncate max-w-[110px]">{flow.dst}</span>
                </div>

                {/* Severed Alert Notice */}
                {isBroken && (
                  <div className="mt-2 flex items-center gap-1.5 p-1.5 rounded bg-red-100 text-[10px] font-mono font-semibold text-red-800 border border-red-200">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0 text-red-600" />
                    <span>SERVICE OUTAGE: BLOCKED BY POLICY</span>
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
