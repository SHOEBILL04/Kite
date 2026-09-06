import { cn } from '../../lib/cn.js';

const VARIANTS = {
  pass: 'bg-pass-bg border-pass-border text-pass-text',
  warning: 'bg-warning-bg border-warning-border text-warning-text',
  critical: 'bg-critical-bg border-critical-border text-critical-text',
  info: 'bg-info-bg border-info-border text-info-text',
  neutral: 'bg-subtle border-border-default text-secondary',
};

/**
 * @param {{variant?: 'pass'|'warning'|'critical'|'info'|'neutral', dot?: boolean,
 *          className?: string, children: React.ReactNode}} props
 */
export function Badge({ variant = 'neutral', dot = false, className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] border px-2 py-0.5 text-[11px] font-medium uppercase leading-4 tracking-wide',
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
