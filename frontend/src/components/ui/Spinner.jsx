import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn.js';

const SIZES = { sm: 'h-3.5 w-3.5', md: 'h-5 w-5', lg: 'h-8 w-8' };

/**
 * @param {{size?: 'sm'|'md'|'lg', label?: string, className?: string}} props
 */
export function Spinner({ size = 'md', label = 'Loading', className }) {
  return (
    <span role="status" aria-live="polite" className={cn('inline-flex items-center gap-2', className)}>
      <Loader2 className={cn('animate-spin text-amber-400', SIZES[size] ?? SIZES.md)} strokeWidth={2} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Centered spinner for a panel that owns its own vertical space. */
export function SpinnerBlock({ label = 'Running analysis', className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-16', className)}>
      <Spinner size="lg" label={label} />
      <p className="text-xs text-slate-500">{label}…</p>
    </div>
  );
}

export default Spinner;
