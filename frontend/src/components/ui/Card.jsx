import { cn } from '../../lib/cn.js';

/**
 * Surface primitive. Everything on a page sits inside one of these.
 *
 * @param {{as?: any, className?: string, padded?: boolean, children: React.ReactNode}} props
 */
export function Card({ as: Tag = 'section', className, padded = false, children, ...rest }) {
  return (
    <Tag
      className={cn(
        'rounded-[8px] border border-border-default bg-surface shadow-elevation',
        padded && 'p-5',
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * Card title row. `action` sits flush right — put filters or buttons there.
 * No bottom divider line per design specs.
 *
 * @param {{title: React.ReactNode, subtitle?: React.ReactNode, icon?: React.ElementType,
 *          action?: React.ReactNode, className?: string}} props
 */
export function CardHeader({ title, subtitle, icon: Icon, action, className }) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 px-5 pt-5 pb-3',
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} /> : null}
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold tracking-tight text-heading">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Body wrapper with standard padding. */
export function CardBody({ className, children }) {
  return <div className={cn('px-5 pb-5 pt-2', className)}>{children}</div>;
}

export default Card;
