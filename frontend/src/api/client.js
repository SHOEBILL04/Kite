import axios from 'axios';
import { resolveMock } from './mock.js';
import { recordApiMeta, recordMockMode, recordOffline } from './apiStatus.js';

/**
 * The single HTTP entry point for the app.
 *
 * Two behaviours everything else depends on:
 *  1. The `{ data: ... }` Laravel envelope is unwrapped here, so callers receive
 *     the payload described in `contract.js` directly.
 *  2. With `VITE_USE_MOCK=true` the network is never touched — requests resolve
 *     from `mock.js` after an 800 ms delay so loading states stay honest.
 *     One env var flips the entire app.
 */

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';
export const MOCK_LATENCY_MS = 800;

export const TOKEN_KEY = 'cf_token';
export const USER_KEY = 'cf_user';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Normalised failure shape. Every rejection from this module is an Error with
 * `status`, `message` and `errors` (Laravel's `{ field: string[] }` bag, or null).
 */
export class ApiError extends Error {
  constructor(message, status, errors = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

/**
 * Axios adapter that serves `mock.js` instead of the network.
 * Used only when VITE_USE_MOCK === 'true'.
 */
async function mockAdapter(config) {
  await sleep(MOCK_LATENCY_MS);

  const body = typeof config.data === 'string' ? JSON.parse(config.data || '{}') : (config.data ?? {});

  try {
    const data = resolveMock(config.method, config.url, body);
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  } catch (failure) {
    return Promise.reject(
      Object.assign(new Error(failure.message), {
        isAxiosError: true,
        config,
        response: {
          data: { message: failure.message, errors: failure.errors },
          status: failure.status,
          statusText: 'Error',
          headers: {},
          config,
        },
      })
    );
  }
}

const apiClient = axios.create({
  baseURL: API_URL,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  timeout: 30_000,
  ...(USE_MOCK ? { adapter: mockAdapter } : {}),
});

apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  // Unwrap the Laravel envelope. Endpoints that return a bare body still work.
  (response) => {
    const payload = response.data;

    // The envelope is unwrapped here, so `meta` has to be captured on the way
    // past or the ApiStatus badge would never see which path served this.
    if (USE_MOCK) {
      recordMockMode();
    } else if (payload && typeof payload === 'object' && payload.meta) {
      recordApiMeta(payload.meta);
    }

    return payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
  },
  (error) => {
    const status = error.response?.status ?? 0;

    // Status 0 means the request never reached the API.
    if (status === 0 && !USE_MOCK) recordOffline();

    const message =
      error.response?.data?.message ??
      (status === 0 ? 'Network unreachable. Is the API running?' : 'Request failed.');
    const errors = error.response?.data?.errors ?? null;

    // Session is gone: drop the token and bounce to login, unless we are
    // already there (a failed sign-in must not reload the page under the user).
    if (status === 401 && !window.location.pathname.startsWith('/login')) {
      clearToken();
      window.location.assign('/login');
    }

    return Promise.reject(new ApiError(message, status, errors));
  }
);

/**
 * Thin verb helpers. Prefer these over calling `apiClient` directly — they
 * return the unwrapped payload, so a query function is a one-liner:
 *
 *   useQuery({
 *     queryKey: QUERY_KEYS.courses,
 *     queryFn: () => get(ENDPOINTS.courses),
 *   })
 */
export const get = (url, config) => apiClient.get(url, config);
export const post = (url, body, config) => apiClient.post(url, body, config);
export const put = (url, body, config) => apiClient.put(url, body, config);
export const del = (url, config) => apiClient.delete(url, config);

export default apiClient;
