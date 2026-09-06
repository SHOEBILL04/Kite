import { cn } from '../../lib/cn.js';
import { Skeleton } from './Skeleton.jsx';

const TONES = {
  neutral: 'text-heading',
  pass: 'text-pass-text',
  warning: 'text-warning-text',
  critical: 'text-critical-text',
};

/**
 * A single headline figure. Min-height 104px, 20px padding.
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
        'min-h-[104px] rounded-[8px] border border-border-default bg-surface p-5 text-left transition-all shadow-elevation',
        interactive && 'focus-ring cursor-pointer hover:border-border-strong hover:-translate-y-[1px]',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">
          {label}
        </span>
        {Icon ? <Icon className="h-5 w-5 text-green-500 opacity-60" strokeWidth={1.75} /> : null}
      </div>

      {loading ? (
        <Skeleton className="mt-2 h-8 w-24" />
      ) : (
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className={cn(
              'text-[28px] font-semibold tabular-nums leading-none tracking-tight',
              TONES[tone] ?? TONES.neutral
            )}
          >
            {value}
          </span>
          {delta ? <span className="text-xs tabular-nums text-muted">{delta}</span> : null}
        </div>
      )}

      {hint ? <p className="mt-2 text-xs leading-snug text-muted">{hint}</p> : null}
    </Tag>
  );
}

export default StatCard;
