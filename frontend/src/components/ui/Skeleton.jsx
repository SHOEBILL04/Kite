import { cn } from '../../lib/cn.js';

/**
 * Loading placeholder. Shimmer runs --bg-subtle -> --bg-hover.
 *
 * @param {{className?: string}} props
 */
export function Skeleton({ className }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-[4px] bg-subtle', className)} />;
}

/**
 * Skeleton rows shaped like a `Table` body.
 *
 * @param {{rows?: number, cols?: number, className?: string}} props
 */
export function SkeletonTable({ rows = 5, cols = 4, className }) {
  return (
    <div className={cn('divide-y divide-border-default', className)}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex h-[44px] items-center gap-3 px-3 py-2.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-3.5', c === 0 ? 'w-1/3' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
