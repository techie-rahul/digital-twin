import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Play,
  Pause,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  Server,
  Database,
  Laptop,
  CheckCircle2,
  Layers,
  Flame,
  ArrowRight,
  Radio,
  GitFork,
  Target,
  CornerDownRight,
  Cpu,
  Info,
} from 'lucide-react';
import {
  Asset,
  Edge,
  Control,
  CrawlAuditResult,
  NodeAudit,
  SeverityLevel,
} from '../types/api';
import { apiClient } from '../api/client';
import { GOLDEN_ASSETS, GOLDEN_EDGES, GOLDEN_FLOWS } from '../data/topologyData';

interface ChessPieceAuditorViewProps {
  assets: Asset[];
  edges?: Edge[];
  controls: Control[];
  twinId?: string;
  onBackToDecisionStory?: () => void;
}

// Fixed canvas coordinates (percentages) for default FinBank layout
const NODE_COORDINATES: Record<string, { x: number; y: number }> = {
  // DMZ (12%)
  internet: { x: 12, y: 22 },
  'web-dmz': { x: 12, y: 55 },
  'api-gw': { x: 12, y: 82 },

  // CORP (38%)
  'ws-dev': { x: 38, y: 20 },
  'ci-runner': { x: 38, y: 50 },
  fileshare: { x: 38, y: 78 },
  'ws-hr': { x: 38, y: 92 },

  // MGMT (64%)
  'jump-01': { x: 64, y: 25 },
  'backup-01': { x: 64, y: 62 },
  'iam-auth': { x: 64, y: 88 },

  // PROD (88%)
  'payroll-api': { x: 88, y: 32 },
  'prod-db': { x: 88, y: 72 },
};

export const ChessPieceAuditorView: React.FC<ChessPieceAuditorViewProps> = ({
  assets = GOLDEN_ASSETS,
  edges = [],
  controls,
  twinId = 'twin-finbank-golden',
  onBackToDecisionStory,
}) => {
  const activeEdges = useMemo(() => (edges && edges.length > 0 ? edges : GOLDEN_EDGES), [edges]);

  // Dynamic node coordinate resolution (uses fixed coords if available, else distributes by zone)
  const getNodeCoords = useMemo(() => {
    return (assetId: string): { x: number; y: number } => {
      if (NODE_COORDINATES[assetId]) return NODE_COORDINATES[assetId];
      const asset = assets.find((a) => a.id === assetId);
      const zone = (asset?.zone || 'dmz').toLowerCase();
      let x = 12;
      if (zone.includes('corp') || zone.includes('lan') || zone.includes('user') || zone.includes('station')) x = 38;
      else if (zone.includes('mgmt') || zone.includes('admin') || zone.includes('auth') || zone.includes('pacs') || zone.includes('cognito')) x = 64;
      else if (zone.includes('prod') || zone.includes('db') || zone.includes('lake') || zone.includes('rds')) x = 88;

      const zoneAssets = assets.filter((a) => {
        const az = (a.zone || 'dmz').toLowerCase();
        if (x === 12) return az.includes('dmz') || az.includes('public') || az.includes('pump') || az.includes('api');
        if (x === 38) return az.includes('corp') || az.includes('lan') || az.includes('user') || az.includes('station') || az.includes('runner');
        if (x === 64) return az.includes('mgmt') || az.includes('admin') || az.includes('auth') || az.includes('pacs') || az.includes('cognito') || az.includes('jump');
        return az.includes('prod') || az.includes('db') || az.includes('lake') || az.includes('rds');
      });
      const idx = Math.max(zoneAssets.findIndex((a) => a.id === assetId), 0);
      const total = Math.max(zoneAssets.length, 1);
      const y = total <= 1 ? 50 : 20 + (idx / (total - 1)) * 65;
      return { x, y: Math.round(y) };
    };
  }, [assets]);

  // Crawl configuration state
  const [startNode, setStartNode] = useState<string>('internet');
  const [targetNode, setTargetNode] = useState<string>('prod-db');
  const [maxHops, setMaxHops] = useState<number>(8);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Crawl results state
  const [auditResult, setAuditResult] = useState<CrawlAuditResult | null>(null);
  const [activeHopIndex, setActiveHopIndex] = useState<number>(0);
  const [selectedPathIndex, setSelectedPathIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Manual override if user clicks a branch move directly on the chessboard
  const [currentNodeId, setCurrentNodeId] = useState<string>('internet');
  const [visitedNodes, setVisitedNodes] = useState<string[]>(['internet']);

  // Severity filter for findings table
  const [severityFilter, setSeverityFilter] = useState<'ALL' | SeverityLevel>('ALL');

  // Trigger autonomous crawl
  const handleRunCrawl = async () => {
    setIsLoading(true);
    setIsPlaying(false);
    try {
      const res = await apiClient.crawlAudit({
        twin_id: twinId,
        start_node: startNode,
        target_node: targetNode,
        max_depth: maxHops,
      });
      setAuditResult(res);
      setSelectedPathIndex(0);
      setActiveHopIndex(0);
      if (res.paths[0]?.path[0]) {
        setCurrentNodeId(res.paths[0].path[0]);
        setVisitedNodes([res.paths[0].path[0]]);
      }
    } catch (e) {
      console.error('Failed to run crawl audit:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // Sync start and target nodes when active twin or assets change
  useEffect(() => {
    if (assets && assets.length > 0) {
      const defaultStart = assets.find((a) => (a.zone || '').toLowerCase().includes('dmz'))?.id || assets[0].id;
      const defaultTarget = assets.find((a) => a.crown_jewel)?.id || assets[assets.length - 1].id;
      setStartNode(defaultStart);
      setTargetNode(defaultTarget);
      setCurrentNodeId(defaultStart);
      setVisitedNodes([defaultStart]);
    }
  }, [twinId, assets]);

  // Initial and reactive load on twinId change
  useEffect(() => {
    handleRunCrawl();
  }, [twinId]);

  const activePath = auditResult?.paths[selectedPathIndex] || null;

  // Sync currentNodeId when activeHopIndex changes in path
  useEffect(() => {
    if (activePath && activePath.path[activeHopIndex]) {
      const nodeId = activePath.path[activeHopIndex];
      setCurrentNodeId(nodeId);
      setVisitedNodes(activePath.path.slice(0, activeHopIndex + 1));
    }
  }, [activeHopIndex, activePath]);

  // Auto-play stepper ticker
  useEffect(() => {
    let timer: any;
    if (isPlaying && activePath) {
      timer = setInterval(() => {
        setActiveHopIndex((prev) => {
          if (prev < activePath.node_audits.length - 1) {
            return prev + 1;
          } else {
            setIsPlaying(false);
            return prev;
          }
        });
      }, 1600);
    }
    return () => clearInterval(timer);
  }, [isPlaying, activePath]);

  // Active Hop Audit Data
  const activeHop: NodeAudit | null = useMemo(() => {
    if (!activePath) return null;
    const found = activePath.node_audits.find((n) => n.asset_id === currentNodeId);
    return found || activePath.node_audits[activeHopIndex] || null;
  }, [activePath, currentNodeId, activeHopIndex]);

  // Outgoing moves from current node (enriched with PS #13 critical threat path metadata)
  const outgoingBranchMoves = useMemo(() => {
    const apiEdges = activeHop?.outgoing_edges || [];
    const topologyEdges = activeEdges.filter((e) => e.src === currentNodeId);

    const enriched = topologyEdges.map((te) => {
      const matched = apiEdges.find((ae) => ae.dst === te.dst && ae.technique === te.technique);
      return {
        ...te,
        is_critical_path: matched?.is_critical_path ?? false,
        crown_jewel_distance: matched?.crown_jewel_distance ?? -1,
        threat_level: matched?.threat_level ?? ('MEDIUM' as SeverityLevel),
        threat_rationale: matched?.threat_rationale ?? '',
        mitre_id: matched?.mitre_id,
        dst_zone: matched?.dst_zone,
      };
    });

    const threatRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return enriched.sort((a, b) => {
      // 1. Critical path trajectory first
      if (a.is_critical_path !== b.is_critical_path) {
        return a.is_critical_path ? -1 : 1;
      }
      // 2. Proximity to Crown Jewel (1 hop before 2 hops)
      if (a.crown_jewel_distance > 0 && b.crown_jewel_distance > 0) {
        if (a.crown_jewel_distance !== b.crown_jewel_distance) {
          return a.crown_jewel_distance - b.crown_jewel_distance;
        }
      } else if (a.crown_jewel_distance > 0) {
        return -1;
      } else if (b.crown_jewel_distance > 0) {
        return 1;
      }
      // 3. Threat level
      return (threatRank[a.threat_level] ?? 2) - (threatRank[b.threat_level] ?? 2);
    });
  }, [currentNodeId, activeHop]);

  // Filtered vulnerabilities for active node
  const filteredVulnerabilities = useMemo(() => {
    if (!activeHop) return [];
    if (severityFilter === 'ALL') return activeHop.vulnerabilities;
    return activeHop.vulnerabilities.filter((v) => v.severity === severityFilter);
  }, [activeHop, severityFilter]);

  // Move chess piece directly to a candidate node
  const handleSelectBranchMove = (dstId: string) => {
    setIsPlaying(false);
    setCurrentNodeId(dstId);
    setVisitedNodes((prev) => (prev.includes(dstId) ? prev : [...prev, dstId]));

    // If this node is in the current path, sync the index
    if (activePath) {
      const idx = activePath.path.indexOf(dstId);
      if (idx !== -1) {
        setActiveHopIndex(idx);
      }
    }
  };

  // Helper for zone styling
  const getZoneBadge = (zone: string) => {
    switch (zone?.toLowerCase()) {
      case 'dmz':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'corp':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'mgmt':
        return 'bg-purple-50 text-purple-800 border-purple-200';
      case 'prod':
        return 'bg-red-50 text-red-800 border-red-200';
      default:
        return 'bg-ash-100 text-ash-700 border-ash-200';
    }
  };

  // Severity badge helper
  const getSeverityBadge = (severity: SeverityLevel) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-50 text-red-700 border-red-200 font-bold';
      case 'HIGH':
        return 'bg-orange-50 text-orange-700 border-orange-200 font-semibold';
      case 'MEDIUM':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'LOW':
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  // Helper icon
  const getAssetIcon = (kind: string, crownJewel: boolean) => {
    if (crownJewel) return <Flame className="w-3.5 h-3.5 text-brand-orange" />;
    switch (kind) {
      case 'database':
        return <Database className="w-3.5 h-3.5 text-indigo-600" />;
      case 'workstation':
        return <Laptop className="w-3.5 h-3.5 text-emerald-600" />;
      case 'share':
        return <Layers className="w-3.5 h-3.5 text-blue-600" />;
      default:
        return <Server className="w-3.5 h-3.5 text-ash-700" />;
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12 font-sans">
      {/* 1. Cohesive Header Toolbar */}
      <div className="bg-white border border-canvas-border rounded-xl px-5 py-3.5 shadow-subtle flex flex-col xl:flex-row items-center justify-between gap-4">
        {/* Title & Badge */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-brand-orange text-white flex items-center justify-center font-mono text-base shadow-subtle">
            ♟️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-ash-900 tracking-tight">
                Chess Piece Security Auditor
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-brand-light text-brand-orange border border-brand-border">
                PS #13 Threat Vector Engine
              </span>
            </div>
            <p className="text-[11px] text-ash-400">
              Evaluates candidate attack trajectories toward Crown Jewels & recommends CAB-safe chokepoints
            </p>
          </div>
        </div>

        {/* Unified Controls Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Start Node */}
          <div className="flex items-center gap-1.5 bg-ash-50 border border-ash-200 rounded-lg px-2.5 py-1 text-xs">
            <span className="text-ash-400 font-mono text-[10px] uppercase font-semibold">Start:</span>
            <select
              value={startNode}
              onChange={(e) => setStartNode(e.target.value)}
              className="bg-transparent text-xs font-mono font-bold text-ash-800 focus:outline-none cursor-pointer"
            >
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id} ({a.zone.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* Target Node */}
          <div className="flex items-center gap-1.5 bg-ash-50 border border-ash-200 rounded-lg px-2.5 py-1 text-xs">
            <span className="text-ash-400 font-mono text-[10px] uppercase font-semibold">Target:</span>
            <select
              value={targetNode}
              onChange={(e) => setTargetNode(e.target.value)}
              className="bg-transparent text-xs font-mono font-bold text-ash-800 focus:outline-none cursor-pointer"
            >
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id} {a.crown_jewel ? '★' : `(${a.zone.toUpperCase()})`}
                </option>
              ))}
            </select>
          </div>

          {/* Max Hops */}
          <div className="hidden sm:flex items-center gap-1.5 bg-ash-50 border border-ash-200 rounded-lg px-2.5 py-1 text-xs">
            <span className="text-ash-400 font-mono text-[10px] uppercase font-semibold">Max Hops:</span>
            <select
              value={maxHops}
              onChange={(e) => setMaxHops(Number(e.target.value))}
              className="bg-transparent text-xs font-mono font-bold text-ash-800 focus:outline-none cursor-pointer"
            >
              <option value={4}>4</option>
              <option value={6}>6</option>
              <option value={8}>8</option>
              <option value={10}>10</option>
            </select>
          </div>

          {/* Run Crawl Trigger */}
          <button
            onClick={handleRunCrawl}
            disabled={isLoading}
            className="px-3.5 py-1.5 rounded-lg bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.98] text-white text-xs font-bold shadow-subtle flex items-center gap-1.5 transition-all cursor-pointer"
          >
            {isLoading ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                <span>Auditing...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run Crawl</span>
              </>
            )}
          </button>

          {/* Step Back */}
          <button
            onClick={() => {
              setIsPlaying(false);
              setActiveHopIndex((prev) => Math.max(0, prev - 1));
            }}
            disabled={activeHopIndex === 0}
            className="p-1.5 rounded-lg border border-ash-200 text-ash-600 hover:text-ash-900 hover:bg-ash-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-subtle"
            title="Previous Hop"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Auto Crawl Toggle */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="px-2.5 py-1 rounded-lg border border-brand-border bg-brand-light text-brand-orange hover:bg-brand-orange hover:text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-subtle"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Auto Walk</span>
              </>
            )}
          </button>

          {/* Step Forward */}
          <button
            onClick={() => {
              setIsPlaying(false);
              if (activePath) {
                setActiveHopIndex((prev) =>
                  Math.min(activePath.node_audits.length - 1, prev + 1)
                );
              }
            }}
            disabled={!activePath || activeHopIndex === activePath.node_audits.length - 1}
            className="p-1.5 rounded-lg border border-ash-200 text-ash-600 hover:text-ash-900 hover:bg-ash-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-subtle"
            title="Next Hop"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Back to Decision Story */}
          {onBackToDecisionStory && (
            <button
              onClick={onBackToDecisionStory}
              className="px-2.5 py-1 text-xs font-semibold text-ash-500 hover:text-ash-800 transition-colors ml-1"
            >
              Exit
            </button>
          )}
        </div>
      </div>

      {/* 2. Main Two-Column Layout: Visual Master Chessboard (Left) + Move Engine Panel (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* ================================================================= */}
        {/* LEFT COLUMN: VISUAL MASTER CHESSBOARD (7 of 12 cols)              */}
        {/* ================================================================= */}
        <div className="xl:col-span-7 bg-white border border-canvas-border rounded-xl p-5 shadow-subtle space-y-4">
          {/* Canvas Header */}
          <div className="flex items-center justify-between border-b border-ash-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-ash-900">
                <Target className="w-3.5 h-3.5 text-brand-orange" />
                <span>TOPOLOGY CHESSBOARD</span>
              </div>
              <span className="text-[10px] font-mono text-ash-400">
                Active Node: <strong className="text-brand-orange">{currentNodeId}</strong>
              </span>
            </div>

            {/* Path Selector Tabs */}
            {auditResult && auditResult.paths.length > 1 && (
              <div className="flex items-center gap-1">
                {auditResult.paths.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setSelectedPathIndex(idx);
                      setActiveHopIndex(0);
                      setIsPlaying(false);
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                      selectedPathIndex === idx
                        ? 'bg-brand-orange text-white shadow-subtle'
                        : 'bg-ash-100 text-ash-600 hover:bg-ash-200'
                    }`}
                  >
                    Path {idx + 1}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Interactive SVG & HTML Canvas Area */}
          <div className="relative w-full h-[520px] bg-[#FAFAFA] border border-ash-200/80 rounded-xl overflow-hidden p-4 select-none">
            {/* Zone Column Background Watermarks */}
            <div className="absolute inset-0 grid grid-cols-4 pointer-events-none text-[11px] font-mono font-bold text-ash-300">
              <div className="border-r border-ash-200/60 p-2 text-center uppercase">1. DMZ</div>
              <div className="border-r border-ash-200/60 p-2 text-center uppercase">2. Corp LAN</div>
              <div className="border-r border-ash-200/60 p-2 text-center uppercase">3. Mgmt Bastion</div>
              <div className="p-2 text-center uppercase">4. Prod Vault</div>
            </div>

            {/* SVG Bézier Edges Layer */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              <defs>
                {/* Flowing Laser Gradient for Primary Attack Branch */}
                <linearGradient id="primaryEdgeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FF5500" />
                  <stop offset="100%" stopColor="#EF4444" />
                </linearGradient>
                {/* Secondary Alternative Fork Gradient */}
                <linearGradient id="forkEdgeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#A855F7" />
                  <stop offset="100%" stopColor="#6366F1" />
                </linearGradient>
              </defs>

              {/* Baseline Background Edges */}
              {activeEdges.map((edge, idx) => {
                const srcCoords = getNodeCoords(edge.src);
                const dstCoords = getNodeCoords(edge.dst);
                if (!srcCoords || !dstCoords) return null;

                const isCurrentOutgoing = edge.src === currentNodeId;
                const isVisited =
                  visitedNodes.includes(edge.src) && visitedNodes.includes(edge.dst);

                // If outgoing from current node, will be rendered in highlighted layer below
                if (isCurrentOutgoing) return null;

                const x1 = `${srcCoords.x}%`;
                const y1 = `${srcCoords.y}%`;
                const x2 = `${dstCoords.x}%`;
                const y2 = `${dstCoords.y}%`;

                return (
                  <line
                    key={idx}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={isVisited ? '#F87171' : '#E4E4E7'}
                    strokeWidth={isVisited ? 2.5 : 1.2}
                    strokeDasharray={isVisited ? '4 2' : 'none'}
                    strokeOpacity={isVisited ? 0.9 : 0.6}
                  />
                );
              })}

              {/* Dynamic Branching Moves Layer (Outgoing from Current Position) */}
              {outgoingBranchMoves.map((edge, idx) => {
                const srcCoords = getNodeCoords(edge.src);
                const dstCoords = getNodeCoords(edge.dst);
                if (!srcCoords || !dstCoords) return null;

                const isPrimary = idx === 0; // Primary candidate move
                const x1 = `${srcCoords.x}%`;
                const y1 = `${srcCoords.y}%`;
                const x2 = `${dstCoords.x}%`;
                const y2 = `${dstCoords.y}%`;

                return (
                  <g key={`branch-${idx}`}>
                    {/* Glowing outer track */}
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={isPrimary ? 'rgba(255, 85, 0, 0.3)' : 'rgba(168, 85, 247, 0.3)'}
                      strokeWidth={8}
                      strokeLinecap="round"
                    />
                    {/* Animated animated flowing laser line */}
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={isPrimary ? 'url(#primaryEdgeGradient)' : 'url(#forkEdgeGradient)'}
                      strokeWidth={3}
                      strokeDasharray="6 4"
                      className="animate-pulse"
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}
            </svg>

            {/* Interactive Nodes Layer */}
            {assets.map((asset) => {
              const coords = getNodeCoords(asset.id);

              const isCurrent = asset.id === currentNodeId;
              const isVisited = visitedNodes.includes(asset.id);
              const isCandidateMove = outgoingBranchMoves.some((e) => e.dst === asset.id);
              const isTarget = asset.id === targetNode;

              return (
                <div
                  key={asset.id}
                  style={{
                    left: `${coords.x}%`,
                    top: `${coords.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  className="absolute z-10"
                >
                  {/* Floating Chess Pawn for Current Position */}
                  {isCurrent && (
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-orange text-white text-[11px] font-mono font-bold shadow-orange-glow animate-bounce whitespace-nowrap z-20">
                      <span>♟️ Adversary Here</span>
                    </div>
                  )}

                  {/* Candidate Move Fork Badge */}
                  {isCandidateMove && !isCurrent && (
                    <button
                      onClick={() => handleSelectBranchMove(asset.id)}
                      className="absolute -top-6 left-1/2 -translate-x-1/2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-600 hover:bg-purple-700 text-white text-[9px] font-mono font-bold shadow-subtle transition-all cursor-pointer whitespace-nowrap z-20 active:scale-95"
                    >
                      <GitFork className="w-2.5 h-2.5" />
                      <span>Move ⑂</span>
                    </button>
                  )}

                  {/* Node Button */}
                  <button
                    onClick={() => handleSelectBranchMove(asset.id)}
                    className={`relative p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${
                      isCurrent
                        ? 'bg-white border-brand-orange shadow-orange-glow ring-4 ring-brand-orange/30 scale-105'
                        : isCandidateMove
                        ? 'bg-purple-50/90 border-purple-300 ring-2 ring-purple-400/40 hover:scale-105 shadow-subtle'
                        : isVisited
                        ? 'bg-red-50/90 border-red-200 text-ash-800'
                        : 'bg-white border-ash-200 hover:border-ash-300 text-ash-700 hover:shadow-subtle'
                    }`}
                  >
                    {/* Node Icon */}
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs font-bold ${
                        isCurrent
                          ? 'bg-brand-orange text-white'
                          : isCandidateMove
                          ? 'bg-purple-100 text-purple-800'
                          : isVisited
                          ? 'bg-red-100 text-red-800'
                          : 'bg-ash-100 text-ash-600'
                      }`}
                    >
                      {getAssetIcon(asset.kind, asset.crown_jewel)}
                    </div>

                    <div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-mono font-bold text-ash-900">
                          {asset.id}
                        </span>
                        {asset.crown_jewel && (
                          <Flame className="w-3 h-3 text-brand-orange animate-pulse" />
                        )}
                        {isTarget && (
                          <Target className="w-3 h-3 text-red-600" />
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[9px] text-ash-400 font-mono">
                        <span className="uppercase font-semibold">{asset.zone}</span>
                        <span>•</span>
                        <span>Crit {asset.criticality}</span>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Stepper Progress Bar at Bottom of Canvas */}
          {activePath && (
            <div className="pt-2 border-t border-ash-100 flex items-center justify-between text-xs font-mono text-ash-500">
              <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                <span className="text-[10px] text-ash-400 uppercase font-semibold mr-1">
                  Active Sequence:
                </span>
                {activePath.path.map((nodeId, idx) => {
                  const isCur = nodeId === currentNodeId;
                  const isDone = visitedNodes.includes(nodeId);
                  return (
                    <React.Fragment key={nodeId}>
                      <button
                        onClick={() => handleSelectBranchMove(nodeId)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer transition-all ${
                          isCur
                            ? 'bg-brand-orange text-white shadow-subtle ring-1 ring-brand-orange/40'
                            : isDone
                            ? 'bg-red-50 text-red-700 border border-red-100'
                            : 'bg-ash-100 text-ash-600'
                        }`}
                      >
                        {isCur ? '♟️ ' : ''}
                        {nodeId}
                      </button>
                      {idx < activePath.path.length - 1 && (
                        <ArrowRight className="w-3 h-3 text-ash-300" />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
              <span className="text-[11px] shrink-0 ml-2">
                Hop {activeHopIndex + 1} of {activePath.path.length}
              </span>
            </div>
          )}
        </div>

        {/* ================================================================= */}
        {/* RIGHT COLUMN: CHESS MOVE ENGINE & FINDINGS (5 of 12 cols)         */}
        {/* ================================================================= */}
        <div className="xl:col-span-5 space-y-4">
          {/* Active Node Identity Card */}
          <div className="bg-white border border-canvas-border rounded-xl p-5 shadow-subtle space-y-3">
            <div className="flex items-center justify-between border-b border-ash-100 pb-2.5">
              <div>
                <span className="text-[10px] font-mono text-ash-400 uppercase tracking-wider block">
                  Current Chess Piece Position
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-lg">♟️</span>
                  <h3 className="text-sm font-bold font-mono text-ash-900">
                    {activeHop?.asset_name || currentNodeId}
                  </h3>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${getZoneBadge(
                  activeHop?.zone || 'dmz'
                )}`}
              >
                {activeHop?.zone || 'DMZ'}
              </span>
            </div>

            {/* Risk Gauge */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-ash-500">Node Exposure Score</span>
                <span className="font-bold text-red-600">
                  {(activeHop?.risk_score || 7.2).toFixed(1)} / 10.0
                </span>
              </div>
              <div className="w-full h-2 bg-ash-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-red-600 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (activeHop?.risk_score || 7.2) * 10)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Candidate Legal Moves (PS #13 Threat Trajectory Ranking) */}
          <div className="bg-white border-2 border-purple-200 rounded-xl p-4 shadow-subtle space-y-3 bg-gradient-to-br from-purple-50/40 to-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900 font-mono">
                <GitFork className="w-4 h-4 text-purple-600" />
                <span>Candidate Moves from This Hop ({outgoingBranchMoves.length})</span>
              </div>
              <span className="text-[10px] font-mono text-purple-600 font-semibold">
                PS #13 Threat Ranking
              </span>
            </div>

            {outgoingBranchMoves.length === 0 ? (
              <div className="py-4 text-center text-xs font-mono text-ash-400">
                ★ Target or Choke Point reached — no further outgoing moves.
              </div>
            ) : (
              <div className="space-y-2.5">
                {outgoingBranchMoves.map((edge, idx) => {
                  const dstAsset = assets.find((a) => a.id === edge.dst);
                  const isCrossZone = activeHop?.zone !== dstAsset?.zone;

                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border transition-all space-y-1.5 ${
                        edge.is_critical_path
                          ? 'border-red-300 bg-red-50/50 hover:border-red-400 shadow-subtle'
                          : 'border-purple-200/80 bg-white hover:border-purple-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-mono font-bold text-ash-900">
                            ♟️ Move #{idx + 1}: → {edge.dst}
                          </span>
                          {edge.is_critical_path && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-red-100 text-red-700 border border-red-200 animate-pulse">
                              ★ CRITICAL THREAT LINE
                            </span>
                          )}
                          {dstAsset?.crown_jewel && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-0.5">
                              <Flame className="w-2.5 h-2.5 text-brand-orange" />
                              <span>CROWN JEWEL</span>
                            </span>
                          )}
                        </div>

                        <button
                          onClick={() => handleSelectBranchMove(edge.dst)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold shadow-subtle transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                            edge.is_critical_path
                              ? 'bg-red-600 hover:bg-red-700 text-white'
                              : 'bg-purple-600 hover:bg-purple-700 text-white'
                          }`}
                        >
                          Play Move ⑂
                        </button>
                      </div>

                      {/* Threat Metadata */}
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
                        <span className="px-1.5 py-0.2 rounded bg-ash-100 text-ash-700 font-semibold">
                          {edge.technique}
                        </span>
                        {edge.crown_jewel_distance !== undefined && edge.crown_jewel_distance >= 0 && (
                          <span
                            className={`px-1.5 py-0.2 rounded font-semibold ${
                              edge.crown_jewel_distance === 0
                                ? 'bg-red-100 text-red-800 border border-red-200'
                                : edge.crown_jewel_distance === 1
                                ? 'bg-orange-100 text-orange-800 border border-orange-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {edge.crown_jewel_distance === 0
                              ? 'Direct Crown Jewel Target'
                              : `${edge.crown_jewel_distance} hop from Crown Jewel`}
                          </span>
                        )}
                        {isCrossZone && (
                          <span className="text-amber-700 font-semibold">
                            [Zone Boundary Crossing]
                          </span>
                        )}
                      </div>

                      {edge.threat_rationale && (
                        <p className="text-[11px] text-ash-600 leading-snug font-sans pt-0.5">
                          {edge.threat_rationale}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* PS #13 Chokepoint Interception Remediation */}
          <div className="bg-white border-2 border-brand-orange/40 rounded-xl p-4 shadow-subtle space-y-3 bg-gradient-to-br from-brand-light/40 to-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-brand-orange font-mono">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Chokepoint Interception (PS #13 Defense)</span>
              </div>
              {activeHop?.recommended_fix && (
                <span className="text-xs font-bold font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  ${activeHop.recommended_fix.cost.toLocaleString()}
                </span>
              )}
            </div>

            {activeHop?.recommended_fix ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <div className="text-xs font-bold font-mono text-ash-900">
                    {activeHop.recommended_fix.control_name}
                  </div>
                  {activeHop.recommended_fix.paths_eliminated !== undefined &&
                    activeHop.recommended_fix.paths_eliminated > 0 && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        ⚡ Severs {activeHop.recommended_fix.paths_eliminated} Critical Path(s)
                      </span>
                    )}
                </div>

                <p className="text-[11px] text-ash-600 leading-relaxed">
                  {activeHop.recommended_fix.description}
                </p>

                {/* CAB Business Flow Continuity Status */}
                <div className="pt-1">
                  {activeHop.recommended_fix.is_safe === false ? (
                    <div className="p-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-amber-800">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        <span>CAB Warning: Business Flow Disruption</span>
                      </div>
                      <p className="text-[10px] leading-tight text-amber-800">
                        Disrupts critical business flow(s):{' '}
                        <strong className="font-mono">
                          {activeHop.recommended_fix.broken_flows?.join(', ') || 'None'}
                        </strong>{' '}
                        (Criticality ≥ 4). Deploying locally without CAB exception risks platform outage.
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-mono font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>CAB Approved: 100% Operational Continuity (Zero business flows broken)</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-xs text-ash-400 italic py-2">
                No individual fix required for this node.
              </div>
            )}
          </div>

          {/* Node Exposures & MITRE Technique Table */}
          <div className="bg-white border border-canvas-border rounded-xl p-4 shadow-subtle space-y-3">
            <div className="flex items-center justify-between border-b border-ash-100 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold font-mono text-ash-900 uppercase">
                <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
                <span>Node Findings ({activeHop?.vulnerabilities.length || 0})</span>
              </div>

              {/* Quick Filter */}
              <div className="flex items-center gap-1">
                {(['ALL', 'CRITICAL', 'HIGH'] as const).map((sev) => (
                  <button
                    key={sev}
                    onClick={() => setSeverityFilter(sev)}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition-all cursor-pointer ${
                      severityFilter === sev
                        ? 'bg-ash-800 text-white font-bold'
                        : 'bg-ash-100 text-ash-500'
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            {filteredVulnerabilities.length === 0 ? (
              <div className="py-4 text-center text-xs text-ash-400 font-mono">
                No findings match the selected filter.
              </div>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {filteredVulnerabilities.map((vuln, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg border border-ash-200 bg-ash-50/50 hover:bg-white transition-all space-y-1"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-mono border ${getSeverityBadge(
                            vuln.severity
                          )}`}
                        >
                          {vuln.severity}
                        </span>
                        <span className="text-xs font-bold text-ash-900 truncate max-w-[180px]">
                          {vuln.title}
                        </span>
                      </div>
                      {vuln.mitre_id && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                          {vuln.mitre_id}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-ash-600 leading-relaxed">
                      {vuln.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Executive Roll-Up Summary (End of Crawl) */}
      {auditResult && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-canvas-border rounded-xl p-4 shadow-subtle">
            <span className="text-[10px] font-mono text-ash-400 uppercase tracking-wider block mb-1">
              Paths Explored
            </span>
            <span className="text-xl font-bold font-mono text-ash-900">
              {auditResult.paths.length} routes
            </span>
          </div>

          <div className="bg-white border border-canvas-border rounded-xl p-4 shadow-subtle">
            <span className="text-[10px] font-mono text-ash-400 uppercase tracking-wider block mb-1">
              Total Vulnerabilities
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold font-mono text-red-600">
                {auditResult.summary.total_vulnerabilities}
              </span>
              <span className="text-[10px] font-mono text-ash-400">
                ({auditResult.summary.critical_count} Crit)
              </span>
            </div>
          </div>

          <div className="bg-white border border-canvas-border rounded-xl p-4 shadow-subtle">
            <span className="text-[10px] font-mono text-ash-400 uppercase tracking-wider block mb-1">
              Weakest Link Asset
            </span>
            <span className="text-lg font-bold font-mono text-brand-orange truncate block">
              {auditResult.summary.weakest_node || 'None'}
            </span>
          </div>

          <div className="bg-white border border-canvas-border rounded-xl p-4 shadow-subtle">
            <span className="text-[10px] font-mono text-ash-400 uppercase tracking-wider block mb-1">
              Total Remediation Budget
            </span>
            <span className="text-xl font-bold font-mono text-emerald-600">
              ${auditResult.summary.total_fix_cost.toLocaleString()}
            </span>
          </div>

          {/* Prioritized Chokepoint Portfolio Table */}
          {auditResult.summary.prioritized_fixes.length > 0 && (
            <div className="bg-white border border-canvas-border rounded-xl p-4 shadow-subtle space-y-3">
              <div className="flex items-center justify-between border-b border-ash-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-brand-orange" />
                  <span className="text-xs font-bold font-mono text-ash-900 uppercase">
                    Prioritized Chokepoint Remediation Portfolio (PS #13 Cut-Set)
                  </span>
                </div>
                <span className="text-[10px] font-mono text-ash-500">
                  Ranked by Attack Path Elimination & CAB Continuity
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {auditResult.summary.prioritized_fixes.map((fix) => (
                  <div
                    key={fix.control_id}
                    className="p-3 rounded-lg border border-ash-200 bg-ash-50/40 hover:bg-white transition-all space-y-2"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-mono font-bold text-ash-900 truncate">
                        {fix.control_name}
                      </span>
                      <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                        ${fix.cost.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-ash-500">
                      <span>Protects:</span>
                      <span className="font-semibold text-ash-800">
                        {fix.protects_nodes.join(', ')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-1 pt-1 text-[10px] font-mono">
                      {fix.paths_eliminated !== undefined && fix.paths_eliminated > 0 ? (
                        <span className="px-1.5 py-0.5 rounded font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          ⚡ Severs {fix.paths_eliminated} path(s)
                        </span>
                      ) : (
                        <span className="text-ash-400">0 critical paths</span>
                      )}

                      {fix.is_safe === false ? (
                        <span className="px-1.5 py-0.5 rounded font-bold bg-amber-50 text-amber-800 border border-amber-300">
                          ⚠ CAB Breakage ({fix.broken_flows?.join(', ') || 'Flows'})
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          ✓ CAB Safe
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
