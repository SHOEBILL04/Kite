import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn.js';

const VARIANTS = {
  primary:
    'bg-amber-400 text-slate-950 hover:bg-amber-300 disabled:bg-amber-400/40 disabled:text-slate-950/60',
  ghost:
    'border border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700 hover:text-slate-100 disabled:text-slate-600',
  danger:
    'border border-rose-400/30 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20 disabled:text-rose-300/50',
};

const SIZES = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3 text-[13px] gap-2',
  lg: 'h-10 px-4 text-sm gap-2',
};

/**
 * @param {{variant?: 'primary'|'ghost'|'danger', size?: 'sm'|'md'|'lg',
 *          loading?: boolean, icon?: React.ElementType, type?: string,
 *          disabled?: boolean, className?: string, children?: React.ReactNode}} props
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon: Icon,
  type = 'button',
  disabled = false,
  className,
  children,
  ...rest
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'focus-ring inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        'disabled:cursor-not-allowed',
        VARIANTS[variant] ?? VARIANTS.primary,
        SIZES[size] ?? SIZES.md,
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} aria-hidden="true" />
      ) : Icon ? (
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
}

export default Button;
