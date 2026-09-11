import React from 'react';
import { motion } from 'framer-motion';
import {
  Server,
  Database,
  Monitor,
  FolderGit2,
  Crown,
  ShieldAlert,
  ShieldCheck,
  Target,
  Radio,
  Lock,
  GitFork,
  KeyRound,
  CreditCard,
  Globe,
  Activity,
} from 'lucide-react';
import { Asset } from '../types/api';

export type NodeVisualState = 'healthy' | 'targeted' | 'compromised' | 'protected';

interface NodeCardProps {
  asset: Asset;
  visualState: NodeVisualState;
  stepNumber?: number;
  isBlastEpicenter?: boolean;
  isInBlastRadius?: boolean;
  isDimmed?: boolean;
  isReplanPivot?: boolean;
  blockedWarning?: boolean;
  isHovered?: boolean;
  onInspectBlastRadius: (assetId: string) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export const NodeCard: React.FC<NodeCardProps> = ({
  asset,
  visualState,
  stepNumber,
  isBlastEpicenter = false,
  isInBlastRadius = false,
  isDimmed = false,
  isReplanPivot = false,
  blockedWarning = false,
  isHovered = false,
  onInspectBlastRadius,
  onMouseEnter,
  onMouseLeave,
}) => {
  const getIcon = () => {
    if (asset.id === 'iam-auth') {
      return <KeyRound className="w-4 h-4 text-purple-600" />;
    }
    if (asset.id === 'siem-soc') {
      return <Activity className="w-4 h-4 text-blue-600" />;
    }
    if (asset.id === 'swift-gw') {
      return <CreditCard className="w-4 h-4 text-emerald-600" />;
    }
    if (asset.id === 'api-gw') {
      return <Globe className="w-4 h-4 text-amber-600" />;
    }
    switch (asset.kind) {
      case 'database':
        return <Database className="w-4 h-4 text-brand-orange" />;
      case 'workstation':
        return <Monitor className="w-4 h-4 text-ash-600" />;
      case 'share':
        return <FolderGit2 className="w-4 h-4 text-ash-600" />;
      case 'server':
      default:
        return <Server className="w-4 h-4 text-ash-600" />;
    }
  };

  const getZoneBadge = () => {
    switch (asset.zone) {
      case 'dmz':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'corp':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'mgmt':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'prod':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default:
        return 'bg-ash-100 text-ash-600 border-ash-200';
    }
  };

  // Determine state styling
  let cardBorder = 'border-canvas-border hover:border-ash-400 bg-white';
  let cardGlow = '';
  let statusBadge = null;

  if (isBlastEpicenter) {
    cardBorder = 'border-brand-orange ring-2 ring-brand-orange/50 bg-brand-orange-light/30 shadow-orange-glow';
    statusBadge = (
      <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-brand-orange text-white shadow-subtle animate-pulse">
        <Radio className="w-3 h-3 animate-spin" />
        <span>EPICENTER</span>
      </div>
    );
  } else if (isInBlastRadius) {
    cardBorder = 'border-amber-400 ring-2 ring-amber-400/40 bg-amber-50/50 shadow-card';
    statusBadge = (
      <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-100 text-amber-800 border border-amber-300">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
        <span>IN BLAST RADIUS</span>
      </div>
    );
  } else if (blockedWarning) {
    cardBorder = 'border-red-500 ring-2 ring-red-500/40 bg-red-50/50 shadow-alert-glow';
    statusBadge = (
      <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-600 text-white shadow-subtle animate-pulse">
        <Lock className="w-3 h-3" />
        <span>CONTAINED / BLOCKED</span>
      </div>
    );
  } else if (visualState === 'compromised') {
    cardBorder = 'border-brand-orange ring-2 ring-brand-orange/30 bg-brand-orange-light/25 shadow-orange-glow';
    cardGlow = 'animate-fall';
    statusBadge = (
      <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-brand-orange text-white shadow-subtle">
        <ShieldAlert className="w-3 h-3" />
        <span>COMPROMISED</span>
      </div>
    );
  } else if (visualState === 'targeted') {
    cardBorder = 'border-amber-400 ring-1 ring-amber-400/40 bg-amber-50/40';
    statusBadge = (
      <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-100 text-amber-800 border border-amber-300">
        <Target className="w-3 h-3 text-amber-600 animate-spin" />
        <span>TARGETED</span>
      </div>
    );
  } else if (visualState === 'protected') {
    cardBorder = 'border-emerald-400 ring-1 ring-emerald-400/30 bg-emerald-50/30';
    statusBadge = (
      <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
        <ShieldCheck className="w-3 h-3 text-emerald-600" />
        <span>CONTAINED</span>
      </div>
    );
  } else {
    statusBadge = (
      <div className="flex items-center gap-1 text-[10px] font-mono text-ash-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span>STANDBY</span>
      </div>
    );
  }

  return (
    <div
      data-asset-id={asset.id}
      className={`relative rounded-xl p-3 transition-all duration-300 font-sans border shadow-subtle cursor-pointer group select-none ${cardBorder} ${cardGlow} ${
        isDimmed ? 'opacity-25 grayscale hover:opacity-80' : 'opacity-100'
      } ${isHovered ? 'ring-2 ring-brand-orange/40 scale-[1.01]' : ''}`}
      onClick={() => onInspectBlastRadius(asset.id)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Visual Connector Handle Dots for Directed Graph Links */}
      <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-white bg-ash-400 shadow-xs group-hover:bg-brand-orange group-hover:scale-125 transition-all pointer-events-none z-10" />
      <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-white bg-ash-400 shadow-xs group-hover:bg-brand-orange group-hover:scale-125 transition-all pointer-events-none z-10" />
      {/* Epicenter Radar Expanding Pulse Rings */}
      {isBlastEpicenter && (
        <>
          <div className="absolute -inset-1.5 rounded-2xl border-2 border-brand-orange animate-ping opacity-60 pointer-events-none" />
          <div className="absolute -inset-3 rounded-3xl border border-brand-orange/30 animate-pulse pointer-events-none" />
        </>
      )}

      {/* Compromise Ripple Animation */}
      {visualState === 'compromised' && (
        <motion.div
          initial={{ scale: 0.95, opacity: 0.8 }}
          animate={{ scale: 1.05, opacity: 0 }}
          transition={{ duration: 0.8, repeat: 1 }}
          className="absolute -inset-1 rounded-2xl border-2 border-brand-orange pointer-events-none"
        />
      )}

      {/* Step Sequence Badge (breach animation cascade) */}
      {stepNumber !== undefined && (
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: [0.95, 1], opacity: 1 }}
          transition={{ type: 'spring', stiffness: 450, damping: 24 }}
          className="absolute -top-2.5 -left-2.5 px-2 py-0.5 rounded-full bg-brand-orange text-white font-mono text-[10px] font-bold flex items-center justify-center shadow-orange-glow border-2 border-white z-20 tracking-wider"
        >
          ({stepNumber})
        </motion.div>
      )}

      {/* Re-planning Pivot Route Pill */}
      {isReplanPivot && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="absolute -top-2.5 right-2 px-2 py-0.5 rounded-full bg-amber-500 text-white font-mono text-[9px] font-bold shadow-subtle border border-amber-300 flex items-center gap-1 z-20"
        >
          <GitFork className="w-2.5 h-2.5" />
          <span>RE-PLAN PIVOT</span>
        </motion.div>
      )}

      {/* Top Row: Icon + Name + Crown Jewel */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-ash-100 flex items-center justify-center border border-ash-200 group-hover:border-ash-300 transition-colors">
            {getIcon()}
          </div>
          <div>
            <h4 className="text-xs font-semibold text-ash-900 tracking-tight leading-tight group-hover:text-brand-orange transition-colors">
              {asset.name}
            </h4>
            <span className="text-[10px] font-mono text-ash-400">
              {asset.id}
            </span>
          </div>
        </div>

        {asset.crown_jewel && (
          <div
            title="Tier-0 Target Asset"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand-orange-light text-brand-orange border border-brand-orange-border text-[9px] font-mono font-bold"
          >
            <Crown className="w-2.5 h-2.5 fill-current" />
            <span>TIER-0</span>
          </div>
        )}
      </div>

      {/* Middle Row: Criticality Bar + Zone Tag */}
      <div className="flex items-center justify-between gap-2 py-1.5 border-t border-canvas-border text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-ash-400">Crit:</span>
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((lvl) => (
              <span
                key={lvl}
                className={`w-1.5 h-2.5 rounded-[1px] ${
                  lvl <= asset.criticality
                    ? asset.criticality >= 4
                      ? 'bg-brand-orange'
                      : 'bg-ash-700'
                    : 'bg-ash-200'
                }`}
              />
            ))}
          </div>
          <span className="font-mono text-[10px] font-medium text-ash-600">
            {asset.criticality}/5
          </span>
        </div>

        <span
          className={`px-1.5 py-0.2 rounded text-[9px] font-mono uppercase font-semibold border ${getZoneBadge()}`}
        >
          {asset.zone}
        </span>
      </div>

      {/* Bottom Row: Status Badge & Blast Radius Trigger */}
      <div className="mt-2 flex items-center justify-between pt-1.5 border-t border-canvas-border text-xs">
        {statusBadge}

        <button
          onClick={(e) => {
            e.stopPropagation();
            onInspectBlastRadius(asset.id);
          }}
          className={`text-[10px] font-mono flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded ${
            isBlastEpicenter
              ? 'bg-brand-orange text-white font-bold'
              : 'text-ash-400 hover:text-brand-orange hover:bg-brand-orange-light'
          }`}
          title="Calculate Downstream Blast Radius Reachability"
        >
          <Radio className="w-2.5 h-2.5" />
          <span>Blast Radius</span>
        </button>
      </div>
    </div>
  );
};
