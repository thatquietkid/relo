import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as client from './auth-client';
import type { WebIdentity, WebSession } from './auth-client';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';
export interface AuthContextValue {
  session: WebSession | null;
  identity: WebIdentity | null;
  status: AuthStatus;
  requestOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
const SESSION_KEY = 'relo.session';

function readStoredSession(): WebSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Partial<WebSession>;
    return typeof session.accessToken === 'string' && session.accessToken
      ? session as WebSession
      : null;
  } catch {
    return null;
  }
}

function storeSession(session: WebSession | null): void {
  if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(SESSION_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<WebSession | null>(null);
  const [identity, setIdentity] = useState<WebIdentity | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    const stored = readStoredSession();
    if (!stored) {
      setStatus('unauthenticated');
      return;
    }
    setSession(stored);
    client.getCurrentIdentity(stored.accessToken).then((nextIdentity) => {
      setIdentity(nextIdentity);
      setStatus('authenticated');
    }).catch(() => {
      storeSession(null);
      setSession(null);
      setIdentity(null);
      setStatus('unauthenticated');
    });
  }, []);

  const requestOtp = useCallback(async (email: string) => {
    await client.requestOtp(email);
  }, []);

  const verifyOtp = useCallback(async (email: string, token: string) => {
    const result = await client.verifyOtp(email, token);
    storeSession(result.session);
    setSession(result.session);
    setIdentity(result.identity);
    setStatus('authenticated');
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const result = await client.startGoogleSignIn(`${window.location.origin}/auth/callback`);
    if (import.meta.env.MODE === 'test') window.history.replaceState({}, '', '/auth/callback');
    else window.location.assign(result.url);
  }, []);

  const signOut = useCallback(async () => {
    const current = session;
    if (current) await client.logout(current.accessToken);
    storeSession(null);
    setSession(null);
    setIdentity(null);
    setStatus('unauthenticated');
  }, [session]);

  const value = useMemo(() => ({ session, identity, status, requestOtp, verifyOtp, signInWithGoogle, signOut }), [
    session, identity, status, requestOtp, verifyOtp, signInWithGoogle, signOut,
  ]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
