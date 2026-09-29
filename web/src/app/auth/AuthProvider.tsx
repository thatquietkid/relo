import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import * as client from './auth-client';
import type { DemoPortal, WebIdentity, WebSession } from './auth-client';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';
export interface AuthContextValue {
  session: WebSession | null;
  identity: WebIdentity | null;
  status: AuthStatus;
  requestOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<WebIdentity>;
  signInDemo: (portal: DemoPortal) => Promise<WebIdentity>;
  signInWithGoogle: () => Promise<void>;
  refreshIdentity: () => Promise<void>;
  completeOAuthCallback: (session: WebSession) => Promise<void>;
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
  const navigate = useNavigate();
  const [session, setSession] = useState<WebSession | null>(() => readStoredSession());
  const [identity, setIdentity] = useState<WebIdentity | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() => session ? 'loading' : 'unauthenticated');

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
    const nextIdentity = result.identity;
    storeSession(result.session);
    setSession(result.session);
    setIdentity(nextIdentity);
    setStatus('authenticated');
    return nextIdentity;
  }, []);

  const signInDemo = useCallback(async (portal: DemoPortal) => {
    const result = await client.signInToDemoPortal(portal);
    storeSession(result.session);
    setSession(result.session);
    setIdentity(result.identity);
    setStatus('authenticated');
    return result.identity;
  }, []);

  const refreshIdentity = useCallback(async () => {
    if (!session) return;
    const nextIdentity = await client.getCurrentIdentity(session.accessToken);
    setIdentity(nextIdentity);
    setStatus('authenticated');
  }, [session]);

  const completeOAuthCallback = useCallback(async (callbackSession: WebSession) => {
    const nextIdentity = await client.getCurrentIdentity(callbackSession.accessToken);
    storeSession(callbackSession);
    setSession(callbackSession);
    setIdentity(nextIdentity);
    setStatus('authenticated');
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const result = await client.startGoogleSignIn(`${window.location.origin}/auth/callback`);
    if (import.meta.env.MODE === 'test') window.history.replaceState({}, '', '/auth/callback');
    else window.location.assign(result.url);
  }, []);

  const signOut = useCallback(async () => {
    const current = session;
    storeSession(null);
    sessionStorage.removeItem('relo.returnTo');
    sessionStorage.setItem('relo.signingOut', 'true');
    setSession(null);
    setIdentity(null);
    navigate('/login', { replace: true });
    setStatus('unauthenticated');
    try {
      if (current) await client.logout(current.accessToken);
    } catch {
      // Local sign-out is authoritative for the browser even if the upstream call fails.
    }
  }, [navigate, session]);

  const value = useMemo(() => ({ session, identity, status, requestOtp, verifyOtp, signInDemo, signInWithGoogle, refreshIdentity, completeOAuthCallback, signOut }), [
    session, identity, status, requestOtp, verifyOtp, signInDemo, signInWithGoogle, refreshIdentity, completeOAuthCallback, signOut,
  ]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
