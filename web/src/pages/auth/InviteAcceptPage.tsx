import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../app/auth/AuthProvider';
import * as client from '../../app/auth/auth-client';

export function InviteAcceptPage({ token: suppliedToken }: { token?: string }) {
  const { token: routeToken } = useParams();
  const { session, status, refreshIdentity, completeOAuthCallback } = useAuth();
  const token = suppliedToken || routeToken || new URLSearchParams(window.location.search).get('token') || '';
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [completingEmailSignIn, setCompletingEmailSignIn] = useState(() => Boolean(new URLSearchParams(window.location.hash.slice(1)).get('access_token')));

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = params.get('access_token');
    const authError = params.get('error_description') || params.get('error');
    if (!accessToken && !authError) return;

    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
    if (!accessToken) {
      setMessage('The invitation sign-in link could not be verified. Request a new link and try again.');
      setCompletingEmailSignIn(false);
      return;
    }

    setCompletingEmailSignIn(true);
    void completeOAuthCallback({
      accessToken,
      refreshToken: params.get('refresh_token') || '',
      expiresAt: params.get('expires_at') ? Number(params.get('expires_at')) : null,
      expiresIn: params.get('expires_in') ? Number(params.get('expires_in')) : null,
      tokenType: params.get('token_type') || 'bearer',
    }).then(() => {
      setMessage(null);
    }).catch(() => {
      setMessage('The invitation sign-in link could not be verified. Request a new link and try again.');
    }).finally(() => setCompletingEmailSignIn(false));
  }, [completeOAuthCallback]);

  async function accept() {
    if (!session || !token) return;
    setBusy(true);
    try {
      await client.acceptInvitation(token, session.accessToken);
      await refreshIdentity();
      setMessage('Your Relo membership is ready.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'This invitation is invalid or expired.');
    } finally {
      setBusy(false);
    }
  }

  if (completingEmailSignIn) return <section className="auth-card"><p className="eyebrow">Invitation</p><h1>Verifying your invitation link.</h1><p className="muted" role="status">Please wait while we sign you in.</p></section>;
  if (status !== 'authenticated') return <section className="auth-card"><p className="eyebrow">Invitation</p><h1>Sign in to accept your invitation.</h1><p className="muted">Use your invited work email, then return here to finish joining Relo.</p>{message ? <p role="alert" className="form-error">{message}</p> : null}<Link className="button button-dark" to={`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`}>Sign in</Link></section>;
  return <section className="auth-card"><p className="eyebrow">Invitation</p><h1>Join your Relo workspace.</h1><p className="muted">This invitation is tied to your authenticated work identity.</p>{message ? <p role="status">{message}</p> : null}<button className="button button-dark" type="button" onClick={() => void accept()} disabled={busy || !token}>{busy ? 'Joining…' : 'Accept invitation'}</button></section>;
}

export default InviteAcceptPage;
