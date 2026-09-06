import { Badge } from './Badge.jsx';

/** Backend severity (`low|medium|high`) -> verdict colour. */
const SEVERITY_VARIANT = {
  low: 'pass',
  medium: 'warning',
  high: 'critical',
};

const SEVERITY_LABEL = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/**
 * The one place severity is translated into colour. Use this everywhere a
 * `Severity` from the contract is displayed so the mapping never diverges.
 *
 * @param {{severity: 'low'|'medium'|'high', label?: string, className?: string}} props
 */
export function SeverityPill({ severity, label, className }) {
  return (
    <Badge variant={SEVERITY_VARIANT[severity] ?? 'neutral'} dot className={className}>
      {label ?? SEVERITY_LABEL[severity] ?? severity}
    </Badge>
  );
}

export { SEVERITY_VARIANT, SEVERITY_LABEL };
export default SeverityPill;
