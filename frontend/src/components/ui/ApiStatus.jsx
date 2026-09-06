import { useSyncExternalStore } from 'react';
import { getApiStatus, subscribeApiStatus } from '../../api/apiStatus.js';

const TONES = {
  live: {
    label: 'Live',
    dot: 'bg-pass-text',
    ring: 'shadow-[0_0_0_3px_var(--status-pass-border)]',
    text: 'text-pass-text',
    border: 'border-pass-border',
    hint: 'Served by a live model call.',
  },
  cached: {
    label: 'Cached',
    dot: 'bg-info-text',
    ring: 'shadow-[0_0_0_3px_var(--status-info-border)]',
    text: 'text-info-text',
    border: 'border-info-border',
    hint: 'Served from the warm AI cache — no network call.',
  },
  fixture: {
    label: 'Fixture',
    dot: 'bg-warning-text',
    ring: 'shadow-[0_0_0_3px_var(--status-warning-border)]',
    text: 'text-warning-text',
    border: 'border-warning-border',
    hint: 'No model reachable — served from a recorded fixture.',
  },
  deterministic: {
    label: 'Deterministic',
    dot: 'bg-muted',
    ring: '',
    text: 'text-secondary',
    border: 'border-border-default',
    hint: 'Computed in PHP with no AI involved.',
  },
  mock: {
    label: 'Fixture',
    dot: 'bg-warning-text',
    ring: '',
    text: 'text-warning-text',
    border: 'border-warning-border',
    hint: 'Frontend mock mode — the network is never touched.',
  },
  offline: {
    label: 'Offline',
    dot: 'bg-critical-text',
    ring: '',
    text: 'text-critical-text',
    border: 'border-critical-border',
    hint: 'The API could not be reached.',
  },
  unknown: {
    label: 'Idle',
    dot: 'bg-muted',
    ring: '',
    text: 'text-muted',
    border: 'border-border-default',
    hint: 'No request made yet.',
  },
};

export default function ApiStatus({ className = '' }) {
  const status = useSyncExternalStore(subscribeApiStatus, getApiStatus, getApiStatus);
  const tone = TONES[status.source] ?? TONES.unknown;

  const title = [
    tone.hint,
    status.driver && status.driver !== 'none' ? `Driver: ${status.driver}` : null,
    typeof status.latencyMs === 'number' ? `${status.latencyMs} ms` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      title={title}
      aria-label={`API source: ${tone.label}. ${tone.hint}`}
      className={`flex items-center gap-2 rounded-full border ${tone.border} bg-subtle px-2.5 py-1 ${className}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot} ${tone.ring}`} aria-hidden="true" />
      <span className={`text-[11px] font-medium leading-none ${tone.text}`}>{tone.label}</span>
      {typeof status.latencyMs === 'number' ? (
        <span className="hidden text-[11px] leading-none text-muted tabular-nums sm:inline">
          {status.latencyMs}ms
        </span>
      ) : null}
    </div>
  );
}
