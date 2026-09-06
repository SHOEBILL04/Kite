import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ENDPOINTS } from '../api/contract.js';
import {
  USE_MOCK,
  USER_KEY,
  clearToken,
  getToken,
  get,
  post,
  setToken,
} from '../api/client.js';

/**
 * Auth context. Written in plain JS (no JSX) so the file path stays `.js`.
 *
 * Shape:
 *   {
 *     user: User|null,
 *     token: string|null,
 *     isAuthenticated: boolean,
 *     isLoading: boolean,      // true only while the session is being restored
 *     login({ email, password }): Promise<User>,
 *     demoLogin(role): Promise<User>,
 *     register(payload): Promise<User>,
 *     logout(): Promise<void>,
 *   }
 *
 * @typedef {import('../api/contract.js').User} User
 */
const AuthContext = createContext(null);

const readCachedUser = () => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const cacheUser = (user) => localStorage.setItem(USER_KEY, JSON.stringify(user));

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => getToken());
  const [user, setUser] = useState(() => readCachedUser());
  const [isLoading, setIsLoading] = useState(() => Boolean(getToken()));

  // Restore the session on a cold load. In mock mode a cached user is
  // authoritative, because GET /me always answers with the same fixture and
  // would otherwise clobber whichever demo role was selected.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const stored = getToken();
      if (!stored) {
        setIsLoading(false);
        return;
      }
      if (USE_MOCK && readCachedUser()) {
        setIsLoading(false);
        return;
      }

      try {
        const payload = await get(ENDPOINTS.me);
        if (cancelled) return;
        setUser(payload.user);
        cacheUser(payload.user);
      } catch {
        if (cancelled) return;
        clearToken();
        setTokenState(null);
        setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Persist an { user, token } auth response and return the user. */
  const adoptSession = useCallback((auth) => {
    setToken(auth.token);
    cacheUser(auth.user);
    setTokenState(auth.token);
    setUser(auth.user);
    return auth.user;
  }, []);

  /** @param {{email: string, password: string}} credentials */
  const login = useCallback(
    async (credentials) => adoptSession(await post(ENDPOINTS.login, credentials)),
    [adoptSession]
  );

  /** @param {'faculty'|'head_of_department'|'moderator'} role */
  const demoLogin = useCallback(
    async (role) => adoptSession(await post(ENDPOINTS.demoLogin, { role })),
    [adoptSession]
  );

  /** @param {import('../api/contract.js').RegisterPayload} payload */
  const register = useCallback(
    async (payload) => adoptSession(await post(ENDPOINTS.register, payload)),
    [adoptSession]
  );

  const logout = useCallback(async () => {
    try {
      await post(ENDPOINTS.logout);
    } catch {
      // The local session is dropped either way — a dead token is still gone.
    }
    clearToken();
    setTokenState(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      isLoading,
      login,
      demoLogin,
      register,
      logout,
    }),
    [user, token, isLoading, login, demoLogin, register, logout]
  );

  return createElement(AuthContext.Provider, { value }, children);
}

/** @returns {{user: User|null, token: string|null, isAuthenticated: boolean, isLoading: boolean, login: Function, demoLogin: Function, register: Function, logout: Function}} */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export default useAuth;
