import { Inbox } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { Button } from './Button.jsx';

/**
 * EmptyState primitive.
 * 32px muted icon, 16px/600 title, 14px text-secondary body, 48px vertical padding.
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
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <span
        className={cn(
          'mb-3 flex h-10 w-10 items-center justify-center rounded-[8px] border',
          tone === 'critical'
            ? 'border-critical-border bg-critical-bg text-critical-text'
            : 'border-border-default bg-subtle text-muted'
        )}
      >
        <Icon className="h-8 w-8" strokeWidth={1.5} />
      </span>
      <h3 className="text-base font-semibold tracking-tight text-heading">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[14px] leading-relaxed text-secondary">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export default EmptyState;
