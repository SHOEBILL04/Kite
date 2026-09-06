import { cn } from '../../lib/cn.js';

/**
 * Loading placeholder. Size it with utility classes so it occupies exactly the
 * space the real content will — no layout shift on resolve.
 *
 * @param {{className?: string}} props
 */
export function Skeleton({ className }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded bg-slate-800/80', className)} />;
}

/**
 * Skeleton rows shaped like a `Table` body.
 *
 * @param {{rows?: number, cols?: number, className?: string}} props
 */
export function SkeletonTable({ rows = 5, cols = 4, className }) {
  return (
    <div className={cn('divide-y divide-slate-800/70', className)}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3 px-3 py-2.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-3.5', c === 0 ? 'w-1/3' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
