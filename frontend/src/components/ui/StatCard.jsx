import { cn } from '../../lib/cn.js';
import { Skeleton } from './Skeleton.jsx';

const TONES = {
  neutral: 'text-slate-100',
  pass: 'text-emerald-400',
  warning: 'text-amber-400',
  critical: 'text-rose-400',
};

/**
 * A single headline figure. The number is the loudest thing in the card —
 * label above it, context beneath it, nothing else.
 *
 * @param {{label: string, value: React.ReactNode, hint?: React.ReactNode,
 *          icon?: React.ElementType, tone?: 'neutral'|'pass'|'warning'|'critical',
 *          delta?: React.ReactNode, loading?: boolean, className?: string,
 *          onClick?: () => void}} props
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

  return (
    <Tag
      onClick={onClick}
      className={cn(
        'rounded-lg border border-slate-800 bg-slate-900 p-4 text-left',
        interactive && 'focus-ring transition-colors hover:border-slate-700',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
          {label}
        </span>
        {Icon ? <Icon className="h-4 w-4 text-slate-600" strokeWidth={1.75} /> : null}
      </div>

      {loading ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : (
        <div className="mt-1.5 flex items-baseline gap-2">
          <span
            className={cn(
              'text-3xl font-semibold tabular-nums leading-none tracking-tight',
              TONES[tone] ?? TONES.neutral
            )}
          >
            {value}
          </span>
          {delta ? <span className="text-xs tabular-nums text-slate-500">{delta}</span> : null}
        </div>
      )}

      {hint ? <p className="mt-2 text-xs leading-snug text-slate-500">{hint}</p> : null}
    </Tag>
  );
}

export default StatCard;
