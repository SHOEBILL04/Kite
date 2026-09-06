import { cn } from '../../lib/cn.js';

/**
 * Dense data table. Wrap in a `Card` for a bordered surface.
 * Row 44px, Header 40px, cell padding 12px horizontal.
 */
export function Table({ className, children, ...rest }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-[13px]', className)} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function THead({ className, children }) {
  return (
    <thead className={cn('sticky top-0 z-10 border-b border-border-default bg-subtle', className)}>
      {children}
    </thead>
  );
}

export function TBody({ className, children }) {
  return <tbody className={cn('divide-y divide-border-default', className)}>{children}</tbody>;
}

/**
 * @param {{hover?: boolean, selected?: boolean, severity?: 'pass'|'warning'|'critical'|'info'}} props
 */
export function TR({ hover = true, selected = false, severity, className, children, ...rest }) {
  const SEVERITY_BORDER = {
    pass: 'border-l-[3px] border-l-pass-border',
    warning: 'border-l-[3px] border-l-warning-border',
    critical: 'border-l-[3px] border-l-critical-border',
    info: 'border-l-[3px] border-l-info-border',
  };

  return (
    <tr
      className={cn(
        'h-[44px] transition-colors border-b border-border-default',
        hover && 'hover:bg-hover',
        selected && 'bg-subtle',
        severity && SEVERITY_BORDER[severity],
        className
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' };

/** @param {{align?: 'left'|'right'|'center'}} props */
export function TH({ align = 'left', className, children, ...rest }) {
  return (
    <th
      scope="col"
      className={cn(
        'h-10 px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-muted',
        ALIGN[align],
        className
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

/** @param {{align?: 'left'|'right'|'center', numeric?: boolean}} props */
export function TD({ align = 'left', numeric = false, className, children, ...rest }) {
  return (
    <td
      className={cn(
        'px-3 py-2.5 align-middle text-secondary',
        numeric && 'tabular-nums text-primary font-medium',
        ALIGN[align],
        className
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

export default Table;
