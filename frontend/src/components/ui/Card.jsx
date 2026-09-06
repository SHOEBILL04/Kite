import { cn } from '../../lib/cn.js';

/**
 * Modern surface primitive with crisp boundaries and elevation.
 */
export function Card({ as: Tag = 'section', className, padded = false, children, ...rest }) {
  return (
    <Tag
      className={cn(
        'rounded-[10px] border border-border-default bg-surface shadow-xs transition-shadow',
        padded && 'p-5 sm:p-6',
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * Card title row with distinct separation from card body.
 */
export function CardHeader({ title, subtitle, icon: Icon, action, className }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-b border-border-default/80 bg-subtle/40 px-5 py-3.5 rounded-t-[10px]',
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {Icon ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-default bg-surface text-action-primary shadow-2xs">
            <Icon className="h-4 w-4" strokeWidth={2} />
          </div>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold tracking-tight text-heading sm:text-base">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Body wrapper with standard padding. */
export function CardBody({ className, children }) {
  return <div className={cn('p-5 sm:p-6', className)}>{children}</div>;
}

export default Card;

