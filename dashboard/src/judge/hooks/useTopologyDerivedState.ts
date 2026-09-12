import { useMemo } from 'react';
import { Asset, Edge, ServiceFlow, Control, SimulationStep } from '../../types/api';
import { NodeVisualState } from '../../components/NodeCard';

// Extracted verbatim from components/TopologyCanvas.tsx (blast-radius BFS, step derivation,
// zone bucketing and node-state helpers) so the lean topology view shares the same logic.

interface Args {
  assets: Asset[];
  edges: Edge[];
  flows: ServiceFlow[];
  controls: Control[];
  selectedControlIds: string[];
  activeControlNames: string[];
  compromisedNodeIds: string[];
  simulationSteps: SimulationStep[];
  isSimulating: boolean;
  selectedBlastNodeId: string | null;
}

export type ActiveTraversal = { src: string; dst: string; isBlocked?: boolean; isPivot?: boolean } | null;

export function getNormalizedZone(zone: string): 'dmz' | 'corp' | 'mgmt' | 'prod' {
  const z = (zone || '').toLowerCase();
  if (z.includes('dmz') || z.includes('public') || z.includes('external') || z.includes('edge') || z.includes('pump') || z.includes('cdn')) return 'dmz';
  if (z.includes('corp') || z.includes('lan') || z.includes('user') || z.includes('workstation') || z.includes('dev') || z.includes('station') || z.includes('runner')) return 'corp';
  if (z.includes('mgmt') || z.includes('admin') || z.includes('iam') || z.includes('auth') || z.includes('bastion') || z.includes('pacs') || z.includes('jump')) return 'mgmt';
  return 'prod';
}

export function useTopologyDerivedState({
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
}: Args) {
  // Downstream reachability for the active blast radius (edges + operational flows)
  const { reachableNodeIds, blastSourceAsset } = useMemo(() => {
    if (!selectedBlastNodeId) {
      return { reachableNodeIds: new Set<string>(), blastSourceAsset: null as Asset | null };
    }
    const source = assets.find((a) => a.id === selectedBlastNodeId) || null;
    const visited = new Set<string>();
    const queue = [selectedBlastNodeId];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      edges.forEach((e) => {
        if (e.src === current && !visited.has(e.dst)) {
          visited.add(e.dst);
          queue.push(e.dst);
        }
      });
      flows.forEach((f) => {
        if (f.src === current && !visited.has(f.dst)) {
          visited.add(f.dst);
          queue.push(f.dst);
        }
      });
    }
    return { reachableNodeIds: visited, blastSourceAsset: source };
  }, [selectedBlastNodeId, assets, edges, flows]);

  // Traversed / blocked / pivot edges and the active traversal from simulation steps
  const { traversedEdgeKeys, blockedEdgeKeys, pivotEdgeKeys, activeTraversal, latestStep } = useMemo(() => {
    const traversed = new Set<string>();
    const blocked = new Set<string>();
    const pivots = new Set<string>();
    let active: ActiveTraversal = null;
    let latest: SimulationStep | null = null;

    if (simulationSteps.length > 0) {
      latest = simulationSteps[simulationSteps.length - 1];
      for (let i = 0; i < simulationSteps.length; i++) {
        const step = simulationSteps[i];
        const prevStep = i > 0 ? simulationSteps[i - 1] : null;
        const srcId = step.src_asset_id || (prevStep ? prevStep.asset_id : null);
        if (srcId && srcId !== step.asset_id) {
          const key = `${srcId}->${step.asset_id}`;
          if (step.status === 'blocked') blocked.add(key);
          else traversed.add(key);
          if (step.is_pivot) pivots.add(key);
          if (i === simulationSteps.length - 1 && isSimulating) {
            active = { src: srcId, dst: step.asset_id, isBlocked: step.status === 'blocked', isPivot: step.is_pivot };
          }
        }
      }
    }
    return { traversedEdgeKeys: traversed, blockedEdgeKeys: blocked, pivotEdgeKeys: pivots, activeTraversal: active, latestStep: latest };
  }, [simulationSteps, isSimulating]);

  const zones = useMemo(
    () => ({
      dmz: assets.filter((a) => getNormalizedZone(a.zone) === 'dmz'),
      corp: assets.filter((a) => getNormalizedZone(a.zone) === 'corp'),
      mgmt: assets.filter((a) => getNormalizedZone(a.zone) === 'mgmt'),
      prod: assets.filter((a) => getNormalizedZone(a.zone) === 'prod'),
    }),
    [assets],
  );

  const getNodeState = (assetId: string): NodeVisualState => {
    if (compromisedNodeIds.includes(assetId)) return 'compromised';
    const assetObj = assets.find((a) => a.id === assetId);
    const isTargetOrCrown = assetObj?.crown_jewel || assetId === 'prod-db' || assetId === 'backup-01';
    const isProtectedByControl = controls.some((c) => selectedControlIds.includes(c.id) && c.scope.includes(assetId));
    if (
      (activeControlNames.length > 0 || selectedControlIds.length > 0) &&
      (isProtectedByControl || isTargetOrCrown) &&
      !compromisedNodeIds.includes(assetId)
    ) {
      return 'protected';
    }
    return 'healthy';
  };

  const getStepNumber = (assetId: string): number | undefined =>
    simulationSteps.find((s) => s.asset_id === assetId && s.status === 'compromised')?.step_index;
  const isStepBlocked = (assetId: string): boolean =>
    simulationSteps.some((s) => s.asset_id === assetId && s.status === 'blocked');
  const isStepPivot = (assetId: string): boolean =>
    simulationSteps.some((s) => s.asset_id === assetId && s.is_pivot);

  return {
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
  };
}
