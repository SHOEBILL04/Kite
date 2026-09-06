import { cn } from '../../lib/cn.js';

/**
 * Semantic colour is reserved for verdicts — never decoration.
 * `neutral` is the default for anything that is not a judgement.
 */
const VARIANTS = {
  pass: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  warning: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
  critical: 'border-rose-400/25 bg-rose-400/10 text-rose-300',
  neutral: 'border-slate-700 bg-slate-800/60 text-slate-300',
};

/**
 * @param {{variant?: 'pass'|'warning'|'critical'|'neutral', dot?: boolean,
 *          className?: string, children: React.ReactNode}} props
 */
export function Badge({ variant = 'neutral', dot = false, className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium leading-4',
        VARIANTS[variant] ?? VARIANTS.neutral,
        className
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export default Badge;
