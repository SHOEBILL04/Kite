/**
 * Display formatters. Numbers rendered through these are always tabular —
 * pair them with the `tabular-nums` class so columns of figures line up.
 */

/** 24.234 -> "24.2" */
export const num = (value, digits = 1) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';

/** 0.842 -> "84.2%"  (input is a 0..1 ratio) */
export const ratioPct = (value, digits = 1) =>
  typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : '—';

/** 58.3 -> "58.3%"  (input is already 0..100) */
export const pct = (value, digits = 1) =>
  typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(digits)}%` : '—';

/** 3.9 -> "+3.9";  -1.2 -> "-1.2" */
export const signed = (value, digits = 1) =>
  typeof value === 'number' && Number.isFinite(value)
    ? `${value > 0 ? '+' : ''}${value.toFixed(digits)}`
    : '—';

/** ISO 8601 -> "5 Sep 2026, 14:22" */
export const dateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
};

/** "Prof. Monir" -> "PM" */
export const initials = (name = '') =>
  name
    .replace(/^(Prof\.|Dr\.|Mr\.|Ms\.|Mrs\.|Sec\.)\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';
