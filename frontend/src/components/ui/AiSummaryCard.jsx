import { Sparkles } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { Skeleton } from './Skeleton.jsx';

/**
 * AI Analysis Card.
 * Uses --bg-subtle, 1px --border-strong, Sparkles in --green-500.
 *
 * @param {{summary?: string, title?: string, meta?: React.ReactNode,
 *          loading?: boolean, className?: string}} props
 */
export function AiSummaryCard({
  summary,
  title = 'AI Analysis',
  meta,
  loading = false,
  className,
}) {
  return (
    <section
      className={cn('rounded-[8px] border border-border-strong bg-subtle p-5 shadow-elevation', className)}
      aria-label={title}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-green-500" strokeWidth={1.75} aria-hidden="true" />
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted">{title}</h2>
        </div>
        {meta ? <div className="text-[11px] tabular-nums text-muted">{meta}</div> : null}
      </header>

      {loading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ) : (
        <p className="mt-3 text-[14px] leading-[1.6] text-secondary">{summary}</p>
      )}
    </section>
  );
}

export default AiSummaryCard;
