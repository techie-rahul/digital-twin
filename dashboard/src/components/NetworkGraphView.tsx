import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Server, 
  Database, 
  Laptop, 
  FolderGit2, 
  Cloud, 
  Crown, 
  Radio, 
  Crosshair
} from 'lucide-react';
import { Asset, Edge, ServiceFlow, SimulationStep } from '../types/api';

interface NetworkGraphViewProps {
  assets: Asset[];
  edges: Edge[];
  flows: ServiceFlow[];
  compromisedNodeIds: string[];
  simulationSteps: SimulationStep[];
  isSimulating: boolean;
  onInspectBlastRadius: (assetId: string) => void;
  brokenFlowIds?: string[];
}

interface NodePosition {
  x: number;
  y: number;
  zone: string;
}

const ZONE_COLUMNS: Record<string, { col: number; label: string; bg: string; border: string; badge: string }> = {
  dmz: { col: 0, label: '1. DMZ Zone', bg: 'bg-amber-500/5', border: 'border-amber-500/20', badge: 'text-amber-700 bg-amber-100' },
  corp: { col: 1, label: '2. Corporate Zone', bg: 'bg-blue-500/5', border: 'border-blue-500/20', badge: 'text-blue-700 bg-blue-100' },
  mgmt: { col: 2, label: '3. Management Zone', bg: 'bg-purple-500/5', border: 'border-purple-500/20', badge: 'text-purple-700 bg-purple-100' },
  prod: { col: 3, label: '4. Production Zone', bg: 'bg-rose-500/5', border: 'border-rose-500/20', badge: 'text-rose-700 bg-rose-100' },
};

export const NetworkGraphView: React.FC<NetworkGraphViewProps> = ({
  assets,
  edges,
  flows,
  compromisedNodeIds,
  simulationSteps,
  isSimulating,
  onInspectBlastRadius,
  brokenFlowIds = [],
}) => {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Group assets by zone
  const assetsByZone = useMemo(() => {
    const map: Record<string, Asset[]> = { dmz: [], corp: [], mgmt: [], prod: [] };
    for (const a of assets) {
      const z = a.zone in map ? a.zone : 'corp';
      map[z].push(a);
    }
    return map;
  }, [assets]);

  // Determine dynamic canvas height based on the zone with the most nodes
  const maxNodesInCol = Math.max(
    ...Object.values(assetsByZone).map((list) => list.length),
    3
  );
  const svgWidth = 1060;
  const svgHeight = Math.max(520, maxNodesInCol * 115 + 100);

  // Calculate layout coordinates for each node
  const nodePositions = useMemo(() => {
    const positions: Record<string, NodePosition> = {};
    const colXCoordinates = [135, 395, 665, 925];

    Object.entries(assetsByZone).forEach(([zoneKey, zoneAssets]) => {
      const colIdx = ZONE_COLUMNS[zoneKey]?.col ?? 1;
      const x = colXCoordinates[colIdx];
      const count = zoneAssets.length;
      if (count === 0) return;

      const totalUsableHeight = svgHeight - 120;
      const stepY = totalUsableHeight / (count + 1);

      zoneAssets.forEach((asset, idx) => {
        positions[asset.id] = {
          x,
          y: 75 + stepY * (idx + 1),
          zone: zoneKey,
        };
      });
    });

    return positions;
  }, [assetsByZone, svgHeight]);

  // Determine active attack edges from simulationSteps sequence
  const attackEdges = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < simulationSteps.length - 1; i++) {
      const srcId = simulationSteps[i].asset_id;
      const dstId = simulationSteps[i + 1].asset_id;
      set.add(`${srcId}->${dstId}`);
    }
    return set;
  }, [simulationSteps]);

  // Helper for icon based on asset kind
  const renderAssetIcon = (kind: string, isCompromised: boolean) => {
    const props = { className: `w-5 h-5 ${isCompromised ? 'text-rose-600' : 'text-ash-700'}` };
    switch (kind) {
      case 'database': return <Database {...props} />;
      case 'workstation': return <Laptop {...props} />;
      case 'share': return <FolderGit2 {...props} />;
      case 'cloud_role': return <Cloud {...props} />;
      default: return <Server {...props} />;
    }
  };

  const selectedAsset = assets.find((a) => a.id === selectedNodeId);

  return (
    <div className="relative w-full rounded-2xl bg-white border border-canvas-border shadow-subtle overflow-hidden font-sans">
      {/* Topology Header Info */}
      <div className="flex flex-wrap items-center justify-between px-6 py-3.5 bg-ash-50/70 border-b border-canvas-border gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-bold text-ash-800">
            <Radio className="w-4 h-4 text-brand-orange animate-pulse" />
            <span>Interactive Attack Traversal Graph</span>
          </div>
          <span className="text-ash-400">|</span>
          <span className="text-ash-500 font-mono text-[11px]">
            {assets.length} Assets • {edges.length} Attack Edges • {flows.length} Service Flows
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-[11px] font-medium text-ash-600">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-ash-300 rounded" />
            <span>Attack Vector</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 bg-rose-500 rounded shadow-sm" />
            <span className="text-rose-700 font-bold">Breach Path</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Crown className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
            <span>Crown Jewel</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping" />
            <span className="text-rose-600 font-semibold">Compromised</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative overflow-x-auto select-none p-4">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full min-w-[850px] h-auto"
          style={{ maxHeight: '720px' }}
        >
          <defs>
            {/* Standard Edge Arrowhead */}
            <marker
              id="arrow-default"
              viewBox="0 0 10 10"
              refX="38"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#CBD5E1" />
            </marker>

            {/* Hovered Edge Arrowhead */}
            <marker
              id="arrow-hover"
              viewBox="0 0 10 10"
              refX="38"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#F97316" />
            </marker>

            {/* Compromised / Active Attack Arrowhead */}
            <marker
              id="arrow-attack"
              viewBox="0 0 10 10"
              refX="38"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#EF4444" />
            </marker>

            {/* Glow Filter for Active Attack Path */}
            <filter id="glow-attack" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* 1. Zone Background Swimlanes */}
          {[
            { key: 'dmz', x: 20, w: 235, label: '1. DMZ Zone', sub: 'Public Facing Ingress', color: '#F59E0B' },
            { key: 'corp', x: 280, w: 235, label: '2. Corporate Zone', sub: 'Internal Workstations & Build', color: '#3B82F6' },
            { key: 'mgmt', x: 545, w: 240, label: '3. Management Zone', sub: 'Bastion Jumpbox & Directory', color: '#8B5CF6' },
            { key: 'prod', x: 810, w: 230, label: '4. Production Zone', sub: 'Critical Databases & Workloads', color: '#EF4444' },
          ].map((zone) => (
            <g key={zone.key}>
              <rect
                x={zone.x}
                y={15}
                width={zone.w}
                height={svgHeight - 30}
                rx={14}
                fill={zone.color}
                fillOpacity="0.03"
                stroke={zone.color}
                strokeOpacity="0.2"
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
              <text
                x={zone.x + 14}
                y={38}
                fill={zone.color}
                fontSize="11"
                fontWeight="700"
                fontFamily="ui-monospace, monospace"
                letterSpacing="0.05em"
              >
                {zone.label.toUpperCase()}
              </text>
              <text
                x={zone.x + 14}
                y={52}
                fill="#94A3B8"
                fontSize="9.5"
                fontFamily="sans-serif"
              >
                {zone.sub}
              </text>
            </g>
          ))}

          {/* 2. Render Directed Attack Edges */}
          {edges.map((edge) => {
            const src = nodePositions[edge.src];
            const dst = nodePositions[edge.dst];
            if (!src || !dst) return null;

            const edgeKey = `${edge.src}->${edge.dst}`;
            const isAttackEdge = attackEdges.has(edgeKey);
            const isIncidentToHover = hoveredNodeId === edge.src || hoveredNodeId === edge.dst;

            // Calculate smooth cubic bezier curve
            const dx = dst.x - src.x;
            const dy = dst.y - src.y;
            const curveOffset = Math.min(Math.abs(dx) * 0.45, 120);

            // Handle intra-zone or reverse edges cleanly
            let pathD = '';
            if (dx >= 0) {
              pathD = `M ${src.x} ${src.y} C ${src.x + curveOffset} ${src.y}, ${dst.x - curveOffset} ${dst.y}, ${dst.x} ${dst.y}`;
            } else {
              // Backward edge
              const arcY = (src.y + dst.y) / 2 - 50;
              pathD = `M ${src.x} ${src.y} Q ${(src.x + dst.x) / 2} ${arcY}, ${dst.x} ${dst.y}`;
            }

            // Midpoint coordinates for edge technique tag
            const midX = (src.x + dst.x) / 2;
            const midY = (src.y + dst.y) / 2;

            return (
              <g key={edgeKey} className="transition-all duration-300">
                {/* Background path for easy hover targeting */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={20}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredNodeId(edge.src)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                />

                {/* Base Path line */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={
                    isAttackEdge
                      ? '#EF4444'
                      : isIncidentToHover
                      ? '#F97316'
                      : '#CBD5E1'
                  }
                  strokeWidth={isAttackEdge ? 3 : isIncidentToHover ? 2.2 : 1.4}
                  strokeDasharray={isAttackEdge ? 'none' : isIncidentToHover ? '5 3' : 'none'}
                  markerEnd={
                    isAttackEdge
                      ? 'url(#arrow-attack)'
                      : isIncidentToHover
                      ? 'url(#arrow-hover)'
                      : 'url(#arrow-default)'
                  }
                  filter={isAttackEdge ? 'url(#glow-attack)' : undefined}
                />

                {/* Animated traveling breach particle pulse */}
                {isAttackEdge && (
                  <circle r="4.5" fill="#EF4444" className="filter drop-shadow-sm">
                    <animateMotion
                      path={pathD}
                      dur="1.8s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}

                {/* Technique pill on attack path or hover */}
                {(isAttackEdge || isIncidentToHover) && (
                  <g transform={`translate(${midX}, ${midY})`}>
                    <rect
                      x={-42}
                      y={-9}
                      width={84}
                      height={18}
                      rx={9}
                      fill={isAttackEdge ? '#EF4444' : '#1E293B'}
                      fillOpacity={0.9}
                    />
                    <text
                      x={0}
                      y={3.5}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize="9"
                      fontFamily="ui-monospace, monospace"
                      fontWeight="600"
                    >
                      {edge.technique.length > 14 ? `${edge.technique.slice(0, 12)}..` : edge.technique}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* 3. Render Nodes */}
          {assets.map((asset) => {
            const pos = nodePositions[asset.id];
            if (!pos) return null;

            const isCompromised = compromisedNodeIds.includes(asset.id);
            const isHovered = hoveredNodeId === asset.id;
            const isSelected = selectedNodeId === asset.id;
            const step = simulationSteps.find((s) => s.asset_id === asset.id);
            const stepNum = step?.step_index;

            return (
              <g
                key={asset.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                className="cursor-pointer group"
                onClick={() => setSelectedNodeId(isSelected ? null : asset.id)}
                onMouseEnter={() => setHoveredNodeId(asset.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
              >
                {/* Expanding Compromise Pulse Ring */}
                {isCompromised && (
                  <circle
                    r={34}
                    fill="none"
                    stroke="#EF4444"
                    strokeWidth={2}
                    className="animate-ping opacity-60"
                  />
                )}

                {/* Hover / Selection Ring */}
                {(isHovered || isSelected) && (
                  <circle
                    r={34}
                    fill="none"
                    stroke={isSelected ? '#F97316' : '#94A3B8'}
                    strokeWidth={2.5}
                    strokeDasharray="4 3"
                    className="animate-spin-slow"
                  />
                )}

                {/* Outer Node Circle Base */}
                <circle
                  r={26}
                  fill="#FFFFFF"
                  stroke={
                    isCompromised
                      ? '#EF4444'
                      : asset.crown_jewel
                      ? '#F59E0B'
                      : isHovered
                      ? '#F97316'
                      : '#E2E8F0'
                  }
                  strokeWidth={isCompromised ? 3 : asset.crown_jewel ? 2.5 : 2}
                  className="transition-all duration-200 filter drop-shadow-sm"
                />

                {/* Node Center Icon Area */}
                <g transform="translate(-10, -10)">
                  {renderAssetIcon(asset.kind, isCompromised)}
                </g>

                {/* Crown Jewel Floating Indicator Badge */}
                {asset.crown_jewel && (
                  <g transform="translate(-8, -34)">
                    <rect x={-4} y={-3} width={24} height={16} rx={8} fill="#FEF3C7" stroke="#F59E0B" strokeWidth={1} />
                    <Crown className="w-3.5 h-3.5 text-amber-600 fill-amber-500 ml-0.5 mt-0.5" />
                  </g>
                )}

                {/* Compromised Step Number Badge */}
                {isCompromised && stepNum !== undefined && (
                  <g transform="translate(14, -26)">
                    <circle r={10} fill="#EF4444" stroke="#FFFFFF" strokeWidth={2} />
                    <text
                      x={0}
                      y={3.5}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize="10"
                      fontWeight="bold"
                      fontFamily="ui-monospace, monospace"
                    >
                      {stepNum}
                    </text>
                  </g>
                )}

                {/* Criticality stars under icon */}
                <g transform="translate(0, 17)">
                  <rect x={-14} y={-4} width={28} height={9} rx={4.5} fill="#F8FAFC" stroke="#CBD5E1" strokeWidth={0.75} />
                  <text
                    x={0}
                    y={3}
                    textAnchor="middle"
                    fill={asset.criticality >= 4 ? '#EF4444' : '#64748B'}
                    fontSize="7.5"
                    fontWeight="bold"
                    fontFamily="ui-monospace, monospace"
                  >
                    {'★'.repeat(Math.min(asset.criticality, 5))}
                  </text>
                </g>

                {/* Asset Label (Name & ID) */}
                <text
                  x={0}
                  y={38}
                  textAnchor="middle"
                  fill={isCompromised ? '#991B1B' : '#0F172A'}
                  fontSize="11"
                  fontWeight={isCompromised || isSelected ? '700' : '600'}
                  fontFamily="sans-serif"
                >
                  {asset.name.length > 20 ? `${asset.name.slice(0, 18)}...` : asset.name}
                </text>
                <text
                  x={0}
                  y={50}
                  textAnchor="middle"
                  fill="#64748B"
                  fontSize="9.5"
                  fontFamily="ui-monospace, monospace"
                >
                  {asset.id}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Node Detail Popup Drawer on Selection */}
      <AnimatePresence>
        {selectedAsset && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-4 right-4 max-w-sm w-full bg-white/95 backdrop-blur-md rounded-xl border border-canvas-border shadow-2xl p-4 text-xs space-y-3 z-30"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm text-ash-900">{selectedAsset.name}</span>
                  {selectedAsset.crown_jewel && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                      <Crown className="w-2.5 h-2.5 fill-current" /> Crown Jewel
                    </span>
                  )}
                </div>
                <div className="font-mono text-[10px] text-ash-500">{selectedAsset.id}</div>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="text-ash-400 hover:text-ash-700 p-1"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-ash-50 p-2.5 rounded-lg border border-ash-200/70">
              <div>Zone: <span className="font-bold uppercase text-ash-800">{selectedAsset.zone}</span></div>
              <div>Kind: <span className="font-bold text-ash-800">{selectedAsset.kind}</span></div>
              <div>Criticality: <span className="font-bold text-brand-orange">{selectedAsset.criticality}/5</span></div>
              <div>Status: <span className={`font-bold ${compromisedNodeIds.includes(selectedAsset.id) ? 'text-rose-600' : 'text-emerald-600'}`}>
                {compromisedNodeIds.includes(selectedAsset.id) ? 'COMPROMISED' : 'STANDBY'}
              </span></div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => onInspectBlastRadius(selectedAsset.id)}
                className="px-3 py-1.5 rounded-lg bg-brand-orange hover:bg-brand-orange-hover text-white font-semibold flex items-center gap-1.5 transition-colors shadow-subtle"
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>Inspect Blast Radius</span>
              </button>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="px-3 py-1.5 rounded-lg border border-ash-200 text-ash-600 hover:bg-ash-100 font-medium"
              >
                Close
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
