import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, ShieldAlert, AlertTriangle, GitFork, ArrowRight, RefreshCw, Radio } from 'lucide-react';
import { Asset, Edge, ServiceFlow, Control, SimulationStep } from '../types/api';
import { DemoPresetId } from '../types/presets';

export type ViewFilterMode = 'all' | 'attack' | 'flows';

interface NodePosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  center: { x: number; y: number };
  leftAnchor: { x: number; y: number };
  rightAnchor: { x: number; y: number };
  topAnchor: { x: number; y: number };
  bottomAnchor: { x: number; y: number };
}

interface EdgePathData {
  id: string;
  src: string;
  dst: string;
  technique: string;
  d: string;
  mid: { x: number; y: number };
  nearDst?: { x: number; y: number };
  isFlow: boolean;
  flow?: ServiceFlow;
  isBlocked: boolean;
  blockedByControl?: Control;
  isSevered: boolean;
  isTraversed: boolean;
  isActiveTraversal: boolean;
  isBlockedAttempt: boolean;
  isPivotRoute: boolean;
  isInBlastRadius: boolean;
  isDimmed: boolean;
  // Preset-aware flags
  isRouteD: boolean;
  isDriftEdge: boolean;
  isHumanRouteBlocked: boolean;
  isP1SeveredFlow: boolean;
  isBaselineActivePath: boolean;
}

export type TelemetryDisplayMode = 'clean' | 'mesh';

interface TopologyEdgeOverlayProps {
  containerRef: React.RefObject<HTMLDivElement>;
  assets: Asset[];
  edges: Edge[];
  flows: ServiceFlow[];
  controls: Control[];
  selectedControlIds: string[];
  brokenFlowIds: string[];
  activeTraversal: { src: string; dst: string; isBlocked?: boolean; isPivot?: boolean } | null;
  traversedEdgeKeys: Set<string>;
  blockedEdgeKeys: Set<string>;
  pivotEdgeKeys?: Set<string>;
  blastRadiusEpicenter: string | null;
  reachableNodeIds: Set<string>;
  viewMode: ViewFilterMode;
  displayMode?: TelemetryDisplayMode;
  hoveredEdgeId: string | null;
  hoveredNodeId?: string | null;
  onHoverEdge: (edgeId: string | null) => void;
  // Preset-aware props
  activePresetId?: DemoPresetId;
  isReroutingActive?: boolean;
  reroutingCaption?: string;
  isDriftActive?: boolean;
  isP1OutageActive?: boolean;
}

export const TopologyEdgeOverlay: React.FC<TopologyEdgeOverlayProps> = ({
  containerRef,
  assets,
  edges,
  flows,
  controls,
  selectedControlIds,
  brokenFlowIds,
  activeTraversal,
  traversedEdgeKeys,
  blockedEdgeKeys,
  pivotEdgeKeys,
  blastRadiusEpicenter,
  reachableNodeIds,
  viewMode,
  displayMode = 'clean',
  hoveredEdgeId,
  hoveredNodeId,
  onHoverEdge,
  activePresetId,
  isReroutingActive = false,
  reroutingCaption,
  isDriftActive = false,
  isP1OutageActive = false,
}) => {
  const [nodePositions, setNodePositions] = useState<Record<string, NodePosition>>({});

  // Compute node bounding boxes relative to container
  const updatePositions = useCallback(() => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const scrollLeft = containerRef.current.scrollLeft || 0;
    const scrollTop = containerRef.current.scrollTop || 0;

    const positions: Record<string, NodePosition> = {};
    const elements = containerRef.current.querySelectorAll<HTMLElement>('[data-asset-id]');

    elements.forEach((el) => {
      const assetId = el.getAttribute('data-asset-id');
      if (!assetId) return;
      const rect = el.getBoundingClientRect();
      const x = rect.left - containerRect.left + scrollLeft;
      const y = rect.top - containerRect.top + scrollTop;
      const width = rect.width;
      const height = rect.height;

      positions[assetId] = {
        id: assetId,
        x,
        y,
        width,
        height,
        center: { x: x + width / 2, y: y + height / 2 },
        leftAnchor: { x, y: y + height / 2 },
        rightAnchor: { x: x + width, y: y + height / 2 },
        topAnchor: { x: x + width / 2, y },
        bottomAnchor: { x: x + width / 2, y: y + height },
      };
    });

    setNodePositions(positions);
  }, [containerRef]);

  // Track layout resize
  useEffect(() => {
    updatePositions();
    const handleResize = () => updatePositions();
    window.addEventListener('resize', handleResize);

    const observer = new ResizeObserver(() => {
      updatePositions();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    // Delayed update to ensure font layout & CSS adjustments settle
    const timer = setTimeout(updatePositions, 80);
    const timer2 = setTimeout(updatePositions, 300);

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      clearTimeout(timer);
      clearTimeout(timer2);
    };
  }, [containerRef, updatePositions, assets]);

  // Check if an edge is blocked by active security controls
  const checkEdgeBlocked = useCallback(
    (src: string, dst: string, technique: string): { blocked: boolean; control?: Control } => {
      // Check full segmentation preset override
      if (isP1OutageActive || activePresetId === 'preset-full-seg') {
        if (dst === 'prod-db') {
          const segCtrl = controls.find((c) => c.id === 'ctrl-network-seg');
          return { blocked: true, control: segCtrl };
        }
      }

      // Check MFA for humans override
      if (isReroutingActive || activePresetId === 'preset-mfa') {
        if ((src === 'ws-dev' && dst === 'jump-01') || (src === 'jump-01' && dst === 'prod-db')) {
          const mfaCtrl = controls.find((c) => c.id === 'ctrl-mfa');
          return { blocked: true, control: mfaCtrl };
        }
      }

      // Check scoped segmentation override
      if (activePresetId === 'preset-scoped-seg') {
        if ((src === 'ws-dev' && dst === 'jump-01') || (src === 'ci-runner' && dst === 'jump-01')) {
          const mfaCtrl = controls.find((c) => c.id === 'ctrl-mfa' || c.id === 'ctrl-scoped-seg');
          return { blocked: true, control: mfaCtrl };
        }
      }

      for (const ctrlId of selectedControlIds) {
        const ctrl = controls.find((c) => c.id === ctrlId);
        if (!ctrl) continue;
        const dstMatch = ctrl.scope.includes(dst);
        const techMatch =
          ctrl.blocks.includes(technique) ||
          ctrl.blocks.includes('network_segmentation') ||
          ctrl.blocks.some((b) => b.toLowerCase() === technique.toLowerCase());

        if (dstMatch && techMatch) {
          return { blocked: true, control: ctrl };
        }
      }
      return { blocked: false };
    },
    [controls, selectedControlIds, isP1OutageActive, isReroutingActive, activePresetId]
  );

  // Precompute lane ordering map to prevent edge overlap bunching
  const calculatePath = useCallback(
    (
      srcPos: NodePosition,
      dstPos: NodePosition,
      outIdx = 0,
      outTotal = 1,
      inIdx = 0,
      inTotal = 1,
      isFlow = false
    ) => {
      const dx = dstPos.center.x - srcPos.center.x;
      const dy = dstPos.center.y - srcPos.center.y;

      // Stagger vertical offsets along the height of the card for multi-connection nodes
      const outShift = (outIdx - (outTotal - 1) / 2) * 8;
      const inShift = (inIdx - (inTotal - 1) / 2) * 8;

      let start: { x: number; y: number };
      let end: { x: number; y: number };
      let cp1: { x: number; y: number };
      let cp2: { x: number; y: number };

      // Case 1: Inter-column (left-to-right flow across zones, dx > 40)
      if (dx > 40) {
        start = { x: srcPos.rightAnchor.x, y: srcPos.rightAnchor.y + outShift };
        end = { x: dstPos.leftAnchor.x, y: dstPos.leftAnchor.y + inShift };
        const curveDist = Math.max(dx * 0.45, 30);
        cp1 = { x: start.x + curveDist, y: start.y };
        cp2 = { x: end.x - curveDist, y: end.y };
      }
      // Case 2: Same column (intra-zone vertical links, |dx| <= 40)
      else if (Math.abs(dx) <= 40) {
        const containerWidth = containerRef.current?.clientWidth || 1100;
        const isRightmostZone = srcPos.center.x > containerWidth * 0.68;

        if (isRightmostZone) {
          // Loop on the LEFT side of cards in rightmost zone to stay cleanly inside the gutter
          start = { x: srcPos.leftAnchor.x, y: srcPos.leftAnchor.y + outShift };
          end = { x: dstPos.leftAnchor.x, y: dstPos.leftAnchor.y + inShift };
          const loopW = 18 + (outIdx % 2) * 6;
          cp1 = { x: start.x - loopW, y: start.y + (dy > 0 ? 14 : -14) };
          cp2 = { x: end.x - loopW, y: end.y - (dy > 0 ? 14 : -14) };
        } else {
          // Loop on the RIGHT side of cards
          start = { x: srcPos.rightAnchor.x, y: srcPos.rightAnchor.y + outShift };
          end = { x: dstPos.rightAnchor.x, y: dstPos.rightAnchor.y + inShift };
          const loopW = 18 + (outIdx % 2) * 6;
          cp1 = { x: start.x + loopW, y: start.y + (dy > 0 ? 14 : -14) };
          cp2 = { x: end.x + loopW, y: end.y - (dy > 0 ? 14 : -14) };
        }
      }
      // Case 3: Backward connection
      else {
        start = { x: srcPos.leftAnchor.x, y: srcPos.leftAnchor.y + outShift };
        end = { x: dstPos.rightAnchor.x, y: dstPos.rightAnchor.y + inShift };
        const curveDist = Math.max(Math.abs(dx) * 0.42, 40);
        cp1 = { x: start.x - curveDist, y: start.y + 25 };
        cp2 = { x: end.x + curveDist, y: end.y + 25 };
      }

      const d = `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y}`;

      // Accurate midpoint via cubic bezier formula at t = 0.5
      const midX = 0.125 * start.x + 0.375 * cp1.x + 0.375 * cp2.x + 0.125 * end.x;
      const midY = 0.125 * start.y + 0.375 * cp1.y + 0.375 * cp2.y + 0.125 * end.y;

      // High-arc point at t = 0.75 along the curve (avoids card collisions on upward drift vectors)
      const nearDstX = 0.0156 * start.x + 0.1406 * cp1.x + 0.4219 * cp2.x + 0.4219 * end.x;
      const nearDstY = 0.0156 * start.y + 0.1406 * cp1.y + 0.4219 * cp2.y + 0.4219 * end.y;

      return { d, start, end, mid: { x: midX, y: midY }, nearDst: { x: nearDstX, y: nearDstY } };
    },
    [containerRef]
  );

  // Compile all edge paths
  const edgePathList: EdgePathData[] = useMemo(() => {
    const list: EdgePathData[] = [];
    const isBlastMode = blastRadiusEpicenter !== null;

    // Route D definition (the automated machine route)
    const isRouteDEdgeCheck = (s: string, d: string) => {
      return (
        (s === 'web-dmz' && d === 'ci-runner') ||
        (s === 'ci-runner' && d === 'backup-01') ||
        (s === 'backup-01' && d === 'prod-db')
      );
    };

    // Precompute lane ordering map
    const outEdgesMap: Record<string, string[]> = {};
    const inEdgesMap: Record<string, string[]> = {};

    const registerLane = (src: string, dst: string, key: string) => {
      if (!outEdgesMap[src]) outEdgesMap[src] = [];
      if (!outEdgesMap[src].includes(key)) outEdgesMap[src].push(key);
      if (!inEdgesMap[dst]) inEdgesMap[dst] = [];
      if (!inEdgesMap[dst].includes(key)) inEdgesMap[dst].push(key);
    };

    if (viewMode === 'all' || viewMode === 'attack') {
      edges.forEach((e) => {
        if (e.src === 'ws-contractor' && !isDriftActive && activePresetId !== 'preset-sync-drift') return;
        registerLane(e.src, e.dst, `${e.src}->${e.dst}`);
      });
    }
    if (viewMode === 'all' || viewMode === 'flows') {
      flows.forEach((f) => registerLane(f.src, f.dst, `flow-${f.id}`));
    }

    // 1. Process regular attack / lateral edges
    if (viewMode === 'all' || viewMode === 'attack') {
      edges.forEach((edge) => {
        // Skip drift edge unless drift preset is active
        if (edge.src === 'ws-contractor' && !isDriftActive && activePresetId !== 'preset-sync-drift') {
          return;
        }

        const srcPos = nodePositions[edge.src];
        const dstPos = nodePositions[edge.dst];
        if (!srcPos || !dstPos) return;

        const edgeKey = `${edge.src}->${edge.dst}`;
        const outList = outEdgesMap[edge.src] || [edgeKey];
        const inList = inEdgesMap[edge.dst] || [edgeKey];
        const outIdx = Math.max(0, outList.indexOf(edgeKey));
        const inIdx = Math.max(0, inList.indexOf(edgeKey));

        const pathInfo = calculatePath(srcPos, dstPos, outIdx, outList.length, inIdx, inList.length, false);
        const isTraversed = traversedEdgeKeys.has(edgeKey);
        const isBlockedAttempt = blockedEdgeKeys.has(edgeKey);
        const isActiveTraversal =
          activeTraversal !== null &&
          activeTraversal.src === edge.src &&
          activeTraversal.dst === edge.dst;

        const { blocked, control } = checkEdgeBlocked(edge.src, edge.dst, edge.technique);

        const isRouteD = isRouteDEdgeCheck(edge.src, edge.dst);
        const isDriftEdge = edge.src === 'ws-contractor' && edge.dst === 'jump-01';
        const isHumanRouteBlocked =
          isReroutingActive &&
          ((edge.src === 'ws-dev' && edge.dst === 'jump-01') ||
            (edge.src === 'jump-01' && edge.dst === 'prod-db') ||
            (edge.src === 'web-dmz' && edge.dst === 'jump-01'));

        const isInBlastRadius =
          isBlastMode &&
          (edge.src === blastRadiusEpicenter ||
            (reachableNodeIds.has(edge.src) && reachableNodeIds.has(edge.dst)));

        const isDimmed =
          (isBlastMode && !isInBlastRadius) ||
          (isReroutingActive && isHumanRouteBlocked) ||
          (isDriftActive && !isDriftEdge && !blocked);

        list.push({
          id: `edge-${edge.src}-${edge.dst}-${edge.technique}`,
          src: edge.src,
          dst: edge.dst,
          technique: edge.technique,
          d: pathInfo.d,
          mid: pathInfo.mid,
          nearDst: pathInfo.nearDst,
          isFlow: false,
          isBlocked: blocked || isHumanRouteBlocked,
          blockedByControl: control,
          isSevered: false,
          isTraversed,
          isActiveTraversal,
          isBlockedAttempt,
          isPivotRoute:
            (!!activeTraversal?.isPivot && isActiveTraversal) ||
            (!!pivotEdgeKeys && pivotEdgeKeys.has(edgeKey)),
          isInBlastRadius,
          isDimmed,
          isRouteD,
          isDriftEdge,
          isHumanRouteBlocked,
          isP1SeveredFlow: false,
          isBaselineActivePath: false,
        });
      });
    }

    // 2. Process business operational flows
    if (viewMode === 'all' || viewMode === 'flows') {
      flows.forEach((flow) => {
        const srcPos = nodePositions[flow.src];
        const dstPos = nodePositions[flow.dst];
        if (!srcPos || !dstPos) return;

        const flowKey = `flow-${flow.id}`;
        const outList = outEdgesMap[flow.src] || [flowKey];
        const inList = inEdgesMap[flow.dst] || [flowKey];
        const outIdx = Math.max(0, outList.indexOf(flowKey));
        const inIdx = Math.max(0, inList.indexOf(flowKey));

        const pathInfo = calculatePath(srcPos, dstPos, outIdx, outList.length, inIdx, inList.length, true);
        const isSevered =
          brokenFlowIds.includes(flow.id) ||
          ((isP1OutageActive || activePresetId === 'preset-full-seg') && (flow.id === 'F3' || flow.id === 'F7'));

        const isP1SeveredFlow = flow.id === 'F3' && isSevered;

        const isInBlastRadius =
          isBlastMode &&
          (flow.src === blastRadiusEpicenter ||
            (reachableNodeIds.has(flow.src) && reachableNodeIds.has(flow.dst)));

        const isDimmed = (isBlastMode && !isInBlastRadius) || (isDriftActive && !isSevered);

        list.push({
          id: `flow-${flow.id}`,
          src: flow.src,
          dst: flow.dst,
          technique: flow.technique,
          d: pathInfo.d,
          mid: pathInfo.mid,
          isFlow: true,
          flow,
          isBlocked: false,
          isSevered,
          isTraversed: false,
          isActiveTraversal: false,
          isBlockedAttempt: false,
          isPivotRoute: false,
          isInBlastRadius,
          isDimmed,
          isRouteD: false,
          isDriftEdge: false,
          isHumanRouteBlocked: false,
          isP1SeveredFlow,
          isBaselineActivePath: false,
        });
      });
    }

    return list;
  }, [
    edges,
    flows,
    nodePositions,
    calculatePath,
    traversedEdgeKeys,
    blockedEdgeKeys,
    pivotEdgeKeys,
    activeTraversal,
    checkEdgeBlocked,
    blastRadiusEpicenter,
    reachableNodeIds,
    viewMode,
    isReroutingActive,
    isDriftActive,
    isP1OutageActive,
    activePresetId,
    brokenFlowIds,
  ]);

  return (
    <div className="absolute inset-0 pointer-events-none z-30">
      <svg className="w-full h-full overflow-visible">
        <defs>
          {/* Default Edge Arrow (Crisp slate gray) */}
          <marker
            id="arrow-default"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#64748B" />
          </marker>

          {/* Traversed Attacker Arrow (Brand Orange #FF5500) */}
          <marker
            id="arrow-traversed"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#FF5500" />
          </marker>

          {/* Blocked Edge Arrow (Muted Red) */}
          <marker
            id="arrow-blocked"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#EF4444" />
          </marker>

          {/* Legitimate business flow arrow (clean cyan/blue #0284C7) */}
          <marker
            id="arrow-flow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#0284C7" />
          </marker>

          {/* Severed flow arrow (pulsing alert red #EF4444) */}
          <marker
            id="arrow-severed"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#EF4444" />
          </marker>

          {/* Route D Rerouting Arrow (Purple #8B5CF6) */}
          <marker
            id="arrow-route-d"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6.5"
            markerHeight="6.5"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#8B5CF6" />
          </marker>

          {/* Sync Drift Arrow (Amber/Orange #FF5500) */}
          <marker
            id="arrow-drift"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#FF5500" />
          </marker>

          {/* Glow Filters */}
          <filter id="glow-orange" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="glow-purple" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 1. Base Line Strokes & Hit Targets */}
        {edgePathList.map((edge) => {
          const isDirectlyHovered = hoveredEdgeId === edge.id;
          const isNodeConnected =
            hoveredNodeId !== null &&
            hoveredNodeId !== undefined &&
            (edge.src === hoveredNodeId || edge.dst === hoveredNodeId);
          const isHovered = isDirectlyHovered || isNodeConnected;

          // =================================================================
          // A. P1 Business Outage Flow: Pulsing Alert Red/Orange
          // =================================================================
          if (edge.isP1SeveredFlow) {
            return (
              <g key={edge.id}>
                <path
                  d={edge.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="18"
                  className="pointer-events-auto cursor-pointer"
                  onMouseEnter={() => onHoverEdge(edge.id)}
                  onMouseLeave={() => onHoverEdge(null)}
                />
                {/* Pulsing red halo */}
                <path
                  d={edge.d}
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth="6"
                  opacity={0.3}
                  className="animate-pulse"
                />
                {/* Main severed line */}
                <path
                  d={edge.d}
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth="2.8"
                  strokeDasharray="6 4"
                  className="filter drop-shadow-[0_0_8px_rgba(239,68,68,0.7)]"
                  markerEnd="url(#arrow-severed)"
                />
              </g>
            );
          }

          // =================================================================
          // B. Generic Severed Business Flow
          // =================================================================
          if (edge.isSevered) {
            return (
              <g key={edge.id}>
                <path
                  d={edge.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="16"
                  className="pointer-events-auto cursor-pointer"
                  onMouseEnter={() => onHoverEdge(edge.id)}
                  onMouseLeave={() => onHoverEdge(null)}
                />
                <path
                  d={edge.d}
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth="2.5"
                  strokeDasharray="5 4"
                  className="filter drop-shadow-[0_0_6px_rgba(239,68,68,0.5)]"
                  markerEnd="url(#arrow-severed)"
                  opacity={edge.isDimmed ? 0.25 : 1}
                />
              </g>
            );
          }

          // =================================================================
          // C. Attacker Rerouting: Route D (Automated CI/CD Machine Route)
          // =================================================================
          if (edge.isRouteD && isReroutingActive) {
            return (
              <g key={edge.id}>
                <path
                  d={edge.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="18"
                  className="pointer-events-auto cursor-pointer"
                  onMouseEnter={() => onHoverEdge(edge.id)}
                  onMouseLeave={() => onHoverEdge(null)}
                />
                {/* Purple Outer Glow */}
                <path
                  d={edge.d}
                  fill="none"
                  stroke="#8B5CF6"
                  strokeWidth="6"
                  opacity={0.25}
                  filter="url(#glow-purple)"
                />
                {/* Primary Solid Animated Line */}
                <path
                  d={edge.d}
                  fill="none"
                  stroke="#8B5CF6"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  className="filter drop-shadow-[0_0_6px_rgba(139,92,246,0.6)]"
                  markerEnd="url(#arrow-route-d)"
                />
                {/* Traveling particle along Route D */}
                <circle r="4.5" fill="#C084FC" className="filter drop-shadow-[0_0_6px_#8B5CF6]">
                  <animateMotion path={edge.d} dur="1.8s" repeatCount="indefinite" />
                </circle>
              </g>
            );
          }

          // =================================================================
          // D. Sync Drift: Contractor Admin Grant Flashing In
          // =================================================================
          if (edge.isDriftEdge && isDriftActive) {
            return (
              <g key={edge.id}>
                <path
                  d={edge.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="18"
                  className="pointer-events-auto cursor-pointer"
                  onMouseEnter={() => onHoverEdge(edge.id)}
                  onMouseLeave={() => onHoverEdge(null)}
                />
                <path
                  d={edge.d}
                  fill="none"
                  stroke="#FF5500"
                  strokeWidth="6"
                  opacity={0.3}
                  className="animate-pulse"
                />
                <path
                  d={edge.d}
                  fill="none"
                  stroke="#FF5500"
                  strokeWidth="3"
                  strokeDasharray="6 3"
                  className="filter drop-shadow-[0_0_8px_rgba(255,85,0,0.6)]"
                  markerEnd="url(#arrow-drift)"
                />
                <circle r="4" fill="#FF5500">
                  <animateMotion path={edge.d} dur="1.2s" repeatCount="indefinite" />
                </circle>
              </g>
            );
          }

          // =================================================================
          // E. Active Breach Simulation Traversal
          // =================================================================
          if (edge.isActiveTraversal) {
            return (
              <g key={edge.id}>
                <path
                  d={edge.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="18"
                  className="pointer-events-auto cursor-pointer"
                  onMouseEnter={() => onHoverEdge(edge.id)}
                  onMouseLeave={() => onHoverEdge(null)}
                />
                <path
                  d={edge.d}
                  fill="none"
                  stroke={edge.isBlockedAttempt ? '#EF4444' : '#FF5500'}
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  opacity={0.35}
                />
                <motion.path
                  d={edge.d}
                  fill="none"
                  stroke={edge.isBlockedAttempt ? '#EF4444' : '#FF5500'}
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.45, ease: 'easeInOut' }}
                  filter={edge.isBlockedAttempt ? 'url(#glow-red)' : 'url(#glow-orange)'}
                  markerEnd={edge.isBlockedAttempt ? 'url(#arrow-blocked)' : 'url(#arrow-traversed)'}
                />
                <circle
                  r="4.5"
                  fill={edge.isBlockedAttempt ? '#EF4444' : '#FF5500'}
                  className="filter drop-shadow-[0_0_5px_#FF5500]"
                >
                  <animateMotion path={edge.d} dur="0.45s" repeatCount="1" fill="freeze" />
                </circle>
              </g>
            );
          }

          // =================================================================
          // F. Baseline Primary Compromise Path (Solid Animated Line)
          // =================================================================
          if (edge.isBaselineActivePath && !edge.isBlocked) {
            return (
              <g key={edge.id}>
                <path
                  d={edge.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="18"
                  className="pointer-events-auto cursor-pointer"
                  onMouseEnter={() => onHoverEdge(edge.id)}
                  onMouseLeave={() => onHoverEdge(null)}
                />
                {/* Outer Orange Glow */}
                <path
                  d={edge.d}
                  fill="none"
                  stroke="#FF5500"
                  strokeWidth="5"
                  opacity={0.2}
                  filter="url(#glow-orange)"
                />
                {/* Solid Line */}
                <path
                  d={edge.d}
                  fill="none"
                  stroke="#FF5500"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  className="filter drop-shadow-[0_0_5px_rgba(255,85,0,0.4)]"
                  markerEnd="url(#arrow-traversed)"
                />
                {/* Traveling Attacker Particle */}
                <circle r="4" fill="#FF5500" className="filter drop-shadow-[0_0_4px_#FF5500]">
                  <animateMotion path={edge.d} dur="2s" repeatCount="indefinite" />
                </circle>
              </g>
            );
          }

          // =================================================================
          // G. Traversed Attack Edge from Simulation
          // =================================================================
          if (edge.isTraversed) {
            return (
              <g key={edge.id}>
                <path
                  d={edge.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="16"
                  className="pointer-events-auto cursor-pointer"
                  onMouseEnter={() => onHoverEdge(edge.id)}
                  onMouseLeave={() => onHoverEdge(null)}
                />
                <path
                  d={edge.d}
                  fill="none"
                  stroke="#FF5500"
                  strokeWidth="2.5"
                  className="filter drop-shadow-[0_0_4px_rgba(255,85,0,0.35)]"
                  markerEnd="url(#arrow-traversed)"
                  opacity={edge.isDimmed ? 0.25 : 1}
                />
              </g>
            );
          }

          // =================================================================
          // H. Blocked Edge (Red dashed line with visible Lock icon)
          // =================================================================
          if (edge.isBlocked) {
            return (
              <g key={edge.id}>
                <path
                  d={edge.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="18"
                  className="pointer-events-auto cursor-pointer"
                  onMouseEnter={() => onHoverEdge(edge.id)}
                  onMouseLeave={() => onHoverEdge(null)}
                />
                <path
                  d={edge.d}
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth={isHovered ? 3.2 : 2.4}
                  strokeDasharray="5 4"
                  opacity={edge.isDimmed ? 0.25 : 0.95}
                  markerEnd="url(#arrow-blocked)"
                />
              </g>
            );
          }

          // =================================================================
          // I. Legitimate Business Flow (Clean Cyan/Blue Dashed Lines)
          // =================================================================
          if (edge.isFlow) {
            return (
              <g key={edge.id}>
                <path
                  d={edge.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="18"
                  className="pointer-events-auto cursor-pointer"
                  onMouseEnter={() => onHoverEdge(edge.id)}
                  onMouseLeave={() => onHoverEdge(null)}
                />
                <path
                  d={edge.d}
                  fill="none"
                  stroke="#0284C7"
                  strokeWidth={isHovered ? 3.2 : 2.2}
                  strokeDasharray="6 4"
                  opacity={edge.isDimmed ? 0.15 : isHovered ? 1 : 0.95}
                  markerEnd="url(#arrow-flow)"
                />
              </g>
            );
          }

          // =================================================================
          // J. Dimmed Human-Led Route during Re-planning
          // =================================================================
          if (edge.isHumanRouteBlocked) {
            return (
              <g key={edge.id}>
                <path
                  d={edge.d}
                  fill="none"
                  stroke="#94A3B8"
                  strokeWidth="1.8"
                  strokeDasharray="4 4"
                  opacity={0.3}
                  markerEnd="url(#arrow-default)"
                />
              </g>
            );
          }

          // =================================================================
          // K. Normal High-Contrast Line
          // =================================================================
          return (
            <g key={edge.id}>
              <path
                d={edge.d}
                fill="none"
                stroke="transparent"
                strokeWidth="18"
                className="pointer-events-auto cursor-pointer"
                onMouseEnter={() => onHoverEdge(edge.id)}
                onMouseLeave={() => onHoverEdge(null)}
              />
              <path
                d={edge.d}
                fill="none"
                stroke={isHovered ? '#FF5500' : '#94A3B8'}
                strokeWidth={isHovered ? 3.2 : 2.2}
                strokeLinecap="round"
                opacity={edge.isDimmed ? 0.15 : isHovered ? 1 : 0.85}
                markerEnd={isHovered ? 'url(#arrow-traversed)' : 'url(#arrow-default)'}
              />
            </g>
          );
        })}

        {/* 2. Shockwave Warning Ripple on Blocked Attempts */}
        {edgePathList
          .filter((e) => e.isBlockedAttempt || (e.isActiveTraversal && e.isBlocked))
          .map((edge) => (
            <g key={`ripple-${edge.id}`}>
              <motion.circle
                cx={edge.mid.x}
                cy={edge.mid.y}
                initial={{ r: 4, opacity: 1 }}
                animate={{ r: 24, opacity: 0 }}
                transition={{ duration: 0.8, repeat: 2, ease: 'easeOut' }}
                fill="none"
                stroke="#EF4444"
                strokeWidth="2"
              />
            </g>
          ))}
      </svg>

      {/* 3. HTML Interactive Overlay Badges */}
      {edgePathList.map((edge) => {
        const isDirectlyHovered = hoveredEdgeId === edge.id;
        const isNodeConnected =
          hoveredNodeId !== null &&
          hoveredNodeId !== undefined &&
          (edge.src === hoveredNodeId || edge.dst === hoveredNodeId);
        const isHovered = isDirectlyHovered || isNodeConnected;

        // ===================================================================
        // 1. P1 Outage Alert Badge: Floating on severed Payroll flow
        // ===================================================================
        if (edge.isP1SeveredFlow) {
          return (
            <div
              key={`badge-p1-${edge.id}`}
              style={{ left: edge.mid.x, top: edge.mid.y }}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto z-40"
              onMouseEnter={() => onHoverEdge(edge.id)}
              onMouseLeave={() => onHoverEdge(null)}
            >
              <div
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-600 text-white text-[10px] font-mono font-bold shadow-alert-glow border border-red-500 whitespace-nowrap cursor-pointer hover:scale-105 transition-transform animate-bounce"
                title="P1 Operational Outage: Payroll API cannot reach Core Banking Database!"
              >
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-white animate-pulse" />
                <span>⚠️ P1 BUSINESS OUTAGE: PAYROLL BLOCKED</span>
              </div>
            </div>
          );
        }

        // ===================================================================
        // 2. Generic Severed Business Flow Badge
        // ===================================================================
        if (edge.isSevered) {
          return (
            <div
              key={`badge-${edge.id}`}
              style={{ left: edge.mid.x, top: edge.mid.y }}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto z-30"
              onMouseEnter={() => onHoverEdge(edge.id)}
              onMouseLeave={() => onHoverEdge(null)}
            >
              <div
                className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-600 text-white text-[9px] font-mono font-bold shadow-alert-glow border border-red-500 whitespace-nowrap cursor-pointer hover:scale-105 transition-transform"
                title={`Severed Business Flow: ${edge.flow?.id} (${edge.flow?.name})`}
              >
                <AlertTriangle className="w-3 h-3 flex-shrink-0 text-white animate-pulse" />
                <span>SERVICE OUTAGE ({edge.flow?.id})</span>
              </div>
            </div>
          );
        }

        // ===================================================================
        // 3. Attacker Rerouting Caption: Floating on Route D
        // ===================================================================
        if (edge.isRouteD && isReroutingActive) {
          // Render caption specifically on the middle leg (ci-runner ➔ backup-01)
          if (edge.src === 'ci-runner' && edge.dst === 'backup-01') {
            return (
              <div
                key={`badge-reroute-${edge.id}`}
                style={{ left: edge.mid.x, top: edge.mid.y - 12 }}
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto z-35"
                onMouseEnter={() => onHoverEdge(edge.id)}
                onMouseLeave={() => onHoverEdge(null)}
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-700 text-white text-[10px] font-mono font-bold shadow-subtle border border-purple-500 whitespace-nowrap cursor-pointer hover:scale-105 transition-transform"
                >
                  <GitFork className="w-3.5 h-3.5 text-purple-200 animate-pulse" />
                  <span>Attacker selects alternative route (Route D: Automated CI/CD path)</span>
                </motion.div>
              </div>
            );
          }

          // Subtle Route D chip on other legs
          return (
            <div
              key={`badge-rd-${edge.id}`}
              style={{ left: edge.mid.x, top: edge.mid.y }}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto z-25"
              onMouseEnter={() => onHoverEdge(edge.id)}
              onMouseLeave={() => onHoverEdge(null)}
            >
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-300 text-[9px] font-mono font-bold shadow-subtle">
                <span>Route D: {edge.technique}</span>
              </div>
            </div>
          );
        }

        // ===================================================================
        // 4. Sync Drift Badge (Contractor Admin Grant)
        // ===================================================================
        if (edge.isDriftEdge && isDriftActive) {
          if (edge.dst !== 'jump-01') return null;
          const pos = edge.nearDst || edge.mid;

          return (
            <div
              key={`badge-drift-${edge.id}`}
              style={{ left: pos.x + 24, top: pos.y + 12 }}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto z-40"
              onMouseEnter={() => onHoverEdge(edge.id)}
              onMouseLeave={() => onHoverEdge(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center px-3 py-1.5 rounded-lg bg-brand-orange text-white shadow-orange-glow border border-orange-400 cursor-pointer animate-pulse select-none text-center"
              >
                <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold uppercase tracking-wider text-orange-100">
                  <RefreshCw className="w-3 h-3 text-white animate-spin" style={{ animationDuration: '3s' }} />
                  <span>Unapproved Privilege Drift</span>
                </div>
                <span className="text-[10px] font-mono font-black tracking-tight whitespace-nowrap">
                  Contractor Admin Grant (T1078)
                </span>
              </motion.div>
            </div>
          );
        }

        // ===================================================================
        // 5. Active Control Block: Crisp Circular Lock Shield directly on edge
        // ===================================================================
        if (edge.isBlocked) {
          return (
            <div
              key={`badge-lock-${edge.id}`}
              style={{ left: edge.mid.x, top: edge.mid.y }}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto z-30"
              onMouseEnter={() => onHoverEdge(edge.id)}
              onMouseLeave={() => onHoverEdge(null)}
            >
              <div
                className={`flex items-center justify-center w-5 h-5 rounded-full border shadow-sm transition-all hover:scale-125 cursor-pointer ${
                  edge.isHumanRouteBlocked
                    ? 'bg-ash-100 border-ash-400 text-ash-700'
                    : 'bg-white border-red-500 text-red-600 shadow-alert-glow'
                }`}
                title={`Blocked by security control: ${edge.blockedByControl?.name || 'Active Defensive Policy'}`}
              >
                <Lock className="w-2.5 h-2.5" />
              </div>
            </div>
          );
        }

        // ===================================================================
        // 6. Traversed Attack Edge Badge from Simulation
        // ===================================================================
        if (edge.isTraversed || edge.isActiveTraversal) {
          return (
            <div
              key={`badge-trav-${edge.id}`}
              style={{ left: edge.mid.x, top: edge.mid.y }}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto z-25"
              onMouseEnter={() => onHoverEdge(edge.id)}
              onMouseLeave={() => onHoverEdge(null)}
            >
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-brand-orange text-white border border-brand-orange-border shadow-orange-glow whitespace-nowrap"
              >
                <ArrowRight className="w-2.5 h-2.5" />
                <span>{edge.technique}</span>
              </motion.div>
            </div>
          );
        }

        // ===================================================================
        // 7. Hovered Edge Detailed Tooltip Pill
        // ===================================================================
        if (isHovered) {
          return (
            <div
              key={`badge-hover-${edge.id}`}
              style={{ left: edge.mid.x, top: edge.mid.y - 14 }}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto z-40"
              onMouseEnter={() => onHoverEdge(edge.id)}
              onMouseLeave={() => onHoverEdge(null)}
            >
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono font-bold shadow-card whitespace-nowrap cursor-pointer ${
                  edge.isFlow
                    ? 'bg-sky-700 text-white border border-sky-400'
                    : edge.isBlocked
                    ? 'bg-red-700 text-white border border-red-500'
                    : 'bg-brand-orange text-white border border-brand-orange-border shadow-orange-glow'
                }`}
              >
                {edge.isFlow ? (
                  <span>{edge.flow?.id}: {edge.flow?.name}</span>
                ) : edge.isBlocked ? (
                  <>
                    <Lock className="w-3 h-3 text-red-200" />
                    <span>BLOCKED: {edge.technique} ({edge.blockedByControl?.name || 'Policy'})</span>
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-3 h-3 text-white" />
                    <span>⚔️ {edge.technique}</span>
                  </>
                )}
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
};
