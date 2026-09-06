import { useSyncExternalStore } from 'react';
import { getApiStatus, subscribeApiStatus } from '../../api/apiStatus.js';

/**
 * Which path served the most recent API response.
 *
 * Every audit in this app is computed deterministically in PHP and only
 * *explained* by a model, so the answer is correct on all three paths. This
 * badge exists so that is visible rather than merely claimed: a reviewer can
 * pull the network cable and watch it move Live -> Cached -> Fixture while the
 * findings stay put.
 */
const TONES = {
  live: {
    label: 'Live',
    dot: 'bg-emerald-400',
    ring: 'shadow-[0_0_0_3px_rgba(52,211,153,0.15)]',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    hint: 'Served by a live model call.',
  },
  cached: {
    label: 'Cached',
    dot: 'bg-sky-400',
    ring: 'shadow-[0_0_0_3px_rgba(56,189,248,0.15)]',
    text: 'text-sky-300',
    border: 'border-sky-500/30',
    hint: 'Served from the warm AI cache — no network call.',
  },
  fixture: {
    label: 'Fixture',
    dot: 'bg-amber-400',
    ring: 'shadow-[0_0_0_3px_rgba(251,191,36,0.15)]',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    hint: 'No model reachable — served from a recorded fixture.',
  },
  deterministic: {
    label: 'Deterministic',
    dot: 'bg-slate-400',
    ring: '',
    text: 'text-slate-300',
    border: 'border-slate-700',
    hint: 'Computed in PHP with no AI involved.',
  },
  mock: {
    label: 'Fixture',
    dot: 'bg-amber-400',
    ring: '',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    hint: 'Frontend mock mode — the network is never touched.',
  },
  offline: {
    label: 'Offline',
    dot: 'bg-rose-400',
    ring: '',
    text: 'text-rose-300',
    border: 'border-rose-500/30',
    hint: 'The API could not be reached.',
  },
  unknown: {
    label: 'Idle',
    dot: 'bg-slate-600',
    ring: '',
    text: 'text-slate-400',
    border: 'border-slate-700',
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
      className={`flex items-center gap-2 rounded-full border ${tone.border} bg-slate-900/60 px-2.5 py-1 ${className}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot} ${tone.ring}`} aria-hidden="true" />
      <span className={`text-[11px] font-medium leading-none ${tone.text}`}>{tone.label}</span>
      {typeof status.latencyMs === 'number' ? (
        <span className="hidden text-[11px] leading-none text-slate-500 tabular-nums sm:inline">
          {status.latencyMs}ms
        </span>
      ) : null}
    </div>
  );
}
