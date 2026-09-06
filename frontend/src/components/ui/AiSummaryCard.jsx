import { Sparkles } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { Skeleton } from './Skeleton.jsx';

/**
 * The `ai_summary` string from any audit response. This is the only amber-bordered
 * panel in the app — it should read as the one interpretive voice on the page,
 * distinct from the measured numbers around it.
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
      className={cn('rounded-lg border border-amber-400/30 bg-amber-400/[0.04] p-4', className)}
      aria-label={title}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" strokeWidth={1.75} aria-hidden="true" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-300">{title}</h2>
        </div>
        {meta ? <div className="text-[11px] tabular-nums text-slate-500">{meta}</div> : null}
      </header>

      {loading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ) : (
        <p className="mt-2.5 text-[13px] leading-relaxed text-slate-300">{summary}</p>
      )}
    </section>
  );
}

export default AiSummaryCard;
