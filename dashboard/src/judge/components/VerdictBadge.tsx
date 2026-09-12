import React from 'react';
import { OctagonX, ShieldCheck, AlertTriangle, PauseCircle } from 'lucide-react';
import { DecisionVerdictType } from '../../types/presets';

interface VerdictBadgeProps {
  verdict: DecisionVerdictType;
  label?: string;
  size?: 'sm' | 'lg';
}

const STYLES: Record<DecisionVerdictType, { cls: string; Icon: React.FC<{ className?: string }> }> = {
  BLOCK: { cls: 'bg-red-50 text-red-700 border-red-300', Icon: OctagonX },
  DEPLOY: { cls: 'bg-emerald-50 text-emerald-800 border-emerald-300', Icon: ShieldCheck },
  REVIEW: { cls: 'bg-amber-50 text-amber-900 border-amber-300', Icon: AlertTriangle },
  STANDBY: { cls: 'bg-ash-100 text-ash-700 border-ash-300', Icon: PauseCircle },
};

export const VerdictBadge: React.FC<VerdictBadgeProps> = ({ verdict, label, size = 'sm' }) => {
  const { cls, Icon } = STYLES[verdict] ?? STYLES.STANDBY;
  const sizeCls = size === 'lg' ? 'px-3.5 py-1.5 text-sm gap-2' : 'px-2 py-0.5 text-[11px] gap-1.5';
  const iconCls = size === 'lg' ? 'w-4 h-4' : 'w-3 h-3';
  return (
    <span className={`inline-flex items-center rounded-lg font-mono font-bold tracking-wide border ${cls} ${sizeCls}`}>
      <Icon className={iconCls} />
      <span>{label || verdict}</span>
    </span>
  );
};
