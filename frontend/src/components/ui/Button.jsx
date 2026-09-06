import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn.js';

const VARIANTS = {
  primary:
    'bg-action-primary text-action-text hover:bg-action-hover disabled:opacity-50',
  secondary:
    'bg-surface text-primary border border-border-default hover:bg-hover hover:border-border-strong disabled:opacity-50',
  ghost:
    'bg-transparent text-secondary hover:bg-hover hover:text-primary disabled:opacity-50',
  danger:
    'bg-critical-bg text-critical-text border border-critical-border hover:opacity-90 disabled:opacity-50',
};

const SIZES = {
  sm: 'h-8 px-3 text-xs gap-1.5 min-h-[32px]',
  md: 'h-9 px-3.5 text-[13px] gap-2 min-h-[36px]',
  lg: 'h-11 px-4 text-sm gap-2 min-h-[44px]',
};

/**
 * @param {{variant?: 'primary'|'secondary'|'ghost'|'danger', size?: 'sm'|'md'|'lg',
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
        'focus-ring inline-flex items-center justify-center rounded-[6px] font-medium transition-colors cursor-pointer',
        'disabled:cursor-not-allowed',
        VARIANTS[variant] ?? VARIANTS.primary,
        SIZES[size] ?? SIZES.md,
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" strokeWidth={2} aria-hidden="true" />
      ) : Icon ? (
        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
}

export default Button;
