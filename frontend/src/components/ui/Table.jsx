import { cn } from '../../lib/cn.js';

/**
 * Dense data table. Wrap in a `Card` for a bordered surface; the wrapper here
 * only owns horizontal overflow so wide tables never widen the page.
 *
 * Compose it:
 *   <Table>
 *     <THead><TR><TH>Section</TH><TH align="right">Mean</TH></TR></THead>
 *     <TBody>
 *       <TR><TD>Section A</TD><TD align="right" numeric>24.2</TD></TR>
 *     </TBody>
 *   </Table>
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
    <thead className={cn('border-b border-slate-800 bg-slate-900/60', className)}>{children}</thead>
  );
}

export function TBody({ className, children }) {
  return <tbody className={cn('divide-y divide-slate-800/70', className)}>{children}</tbody>;
}

/** @param {{hover?: boolean, selected?: boolean}} props */
export function TR({ hover = true, selected = false, className, children, ...rest }) {
  return (
    <tr
      className={cn(
        hover && 'transition-colors hover:bg-slate-800/40',
        selected && 'bg-amber-400/5',
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
        'px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500',
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
        'px-3 py-2 align-middle text-slate-300',
        numeric && 'tabular-nums text-slate-200',
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
