import { cn } from '../../lib/cn.js';
import { Skeleton } from './Skeleton.jsx';

const TONE_CONFIG = {
  neutral: {
    borderAccent: 'border-t-green-600',
    badgeBg: 'bg-emerald-50 text-green-900 border-green-200/80',
    valueText: 'text-heading',
  },
  pass: {
    borderAccent: 'border-t-emerald-600',
    badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
    valueText: 'text-pass-text',
  },
  warning: {
    borderAccent: 'border-t-amber-500',
    badgeBg: 'bg-amber-50 text-amber-800 border-amber-200/80',
    valueText: 'text-warning-text',
  },
  critical: {
    borderAccent: 'border-t-rose-600',
    badgeBg: 'bg-rose-50 text-rose-800 border-rose-200/80',
    valueText: 'text-critical-text',
  },
};

/**
 * A distinguished KPI headline card.
 * Features a top tone accent, dedicated icon badge, bold typography, and footer hint.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  delta,
  loading = false,
  className,
  onClick,
}) {
  const interactive = typeof onClick === 'function';
  const Tag = interactive ? 'button' : 'div';
  const cfg = TONE_CONFIG[tone] ?? TONE_CONFIG.neutral;

  return (
    <Tag
      onClick={onClick}
      className={cn(
        'group relative flex flex-col justify-between overflow-hidden rounded-[10px] border border-border-default border-t-[3.5px] bg-surface p-5 text-left transition-all duration-150 shadow-xs hover:shadow-sm hover:border-border-strong',
        cfg.borderAccent,
        interactive && 'focus-ring cursor-pointer hover:-translate-y-[1px]',
        className
      )}
    >
      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
            {label}
          </span>
          {Icon ? (
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition-transform group-hover:scale-105',
                cfg.badgeBg
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
            </div>
          ) : null}
        </div>

        {loading ? (
          <Skeleton className="mt-3 h-8 w-28" />
        ) : (
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className={cn(
                'text-[26px] sm:text-[28px] font-extrabold tracking-tight tabular-nums leading-none',
                cfg.valueText
              )}
            >
              {value}
            </span>
            {delta ? (
              <span className="text-xs font-semibold tabular-nums text-muted">{delta}</span>
            ) : null}
          </div>
        )}
      </div>

      {hint ? (
        <div className="mt-3.5 flex items-center gap-2 border-t border-border-default/70 pt-2.5 text-[12px] leading-snug text-muted">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong" />
          <span className="truncate">{hint}</span>
        </div>
      ) : null}
    </Tag>
  );
}

export default StatCard;

