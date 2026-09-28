import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../app/auth/AuthProvider';
import * as client from '../../app/auth/auth-client';

export function InviteAcceptPage({ token: suppliedToken }: { token?: string }) {
  const { token: routeToken } = useParams();
  const { session, status } = useAuth();
  const token = suppliedToken || routeToken || new URLSearchParams(window.location.search).get('token') || '';
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept() {
    if (!session || !token) return;
    setBusy(true);
    try {
      await client.acceptInvitation(token, session.accessToken);
      setMessage('Your Relo membership is ready.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'This invitation is invalid or expired.');
    } finally {
      setBusy(false);
    }
  }

  if (status !== 'authenticated') return <section className="auth-card"><p className="eyebrow">Invitation</p><h1>Sign in to accept your invitation.</h1><p className="muted">Use your invited work email, then return here to finish joining Relo.</p><Link className="button button-dark" to={`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`}>Sign in</Link></section>;
  return <section className="auth-card"><p className="eyebrow">Invitation</p><h1>Join your Relo workspace.</h1><p className="muted">This invitation is tied to your authenticated work identity.</p>{message ? <p role="status">{message}</p> : null}<button className="button button-dark" type="button" onClick={() => void accept()} disabled={busy || !token}>{busy ? 'Joining…' : 'Accept invitation'}</button></section>;
}

export default InviteAcceptPage;
