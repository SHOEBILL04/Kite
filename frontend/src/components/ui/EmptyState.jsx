import { Inbox } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { Button } from './Button.jsx';

/**
 * Shown when a panel has nothing to render — no results, no selection yet, or
 * an error the user can retry. Keep `title` a statement, `description` a
 * next step.
 *
 * @param {{title: string, description?: string, icon?: React.ElementType,
 *          actionLabel?: string, onAction?: () => void, tone?: 'neutral'|'critical',
 *          className?: string}} props
 */
export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  actionLabel,
  onAction,
  tone = 'neutral',
  className,
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <span
        className={cn(
          'mb-3 flex h-10 w-10 items-center justify-center rounded-lg border',
          tone === 'critical'
            ? 'border-rose-400/25 bg-rose-400/10 text-rose-400'
            : 'border-slate-800 bg-slate-950 text-slate-600'
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={1.5} />
      </span>
      <h3 className="text-sm font-semibold tracking-tight text-slate-200">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <Button variant="ghost" size="sm" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export default EmptyState;
