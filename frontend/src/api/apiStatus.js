/**
 * Which path served the last API response — Live, Cached, or Fixture.
 *
 * `client.js` unwraps the `{ data }` envelope before any caller sees it, so the
 * `meta` block the backend stamps on would be thrown away. This module is where
 * the interceptor parks it on the way past, and it is deliberately a tiny
 * hand-rolled store rather than context: the axios interceptor is not inside
 * the React tree and cannot dispatch into it.
 */

/** @typedef {'live'|'cached'|'fixture'|'deterministic'|'mock'|'offline'|'unknown'} ApiSource */

const listeners = new Set();

/** @type {{source: ApiSource, driver: string|null, latencyMs: number|null, at: number|null}} */
let state = { source: 'unknown', driver: null, latencyMs: null, at: null };

export const getApiStatus = () => state;

/** Subscribe to changes. Returns an unsubscribe function (useSyncExternalStore shape). */
export function subscribeApiStatus(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next) {
  // Skip a re-render when nothing meaningful moved.
  if (next.source === state.source && next.driver === state.driver && next.latencyMs === state.latencyMs) {
    return;
  }
  state = next;
  listeners.forEach((l) => l());
}

/** Record the `meta` block from a successful response. */
export function recordApiMeta(meta) {
  if (!meta || typeof meta !== 'object') return;

  const source = ['live', 'cached', 'fixture', 'deterministic'].includes(meta.source)
    ? meta.source
    : 'unknown';

  publish({
    source,
    driver: meta.driver ?? null,
    latencyMs: typeof meta.latency_ms === 'number' ? meta.latency_ms : null,
    at: Date.now(),
  });
}

/** Mock mode never touches the network; say so rather than claiming a live path. */
export function recordMockMode() {
  publish({ source: 'mock', driver: 'mock.js', latencyMs: null, at: Date.now() });
}

/** A request that never reached the API at all. */
export function recordOffline() {
  publish({ source: 'offline', driver: null, latencyMs: null, at: Date.now() });
}
