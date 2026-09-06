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
        'rounded-lg border border-slate-800 bg-slate-900',
        padded && 'p-4',
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
 *
 * @param {{title: React.ReactNode, subtitle?: React.ReactNode, icon?: React.ElementType,
 *          action?: React.ReactNode, className?: string}} props
 */
export function CardHeader({ title, subtitle, icon: Icon, action, className }) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3',
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" strokeWidth={1.75} /> : null}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-tight text-slate-100">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Body wrapper with the standard dense padding. */
export function CardBody({ className, children }) {
  return <div className={cn('p-4', className)}>{children}</div>;
}

export default Card;
