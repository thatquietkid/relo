import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/auth/AuthProvider';
import * as client from '../../app/auth/auth-client';
import type { AuthorizationDetails } from '../../app/auth/auth-client';

export function OAuthConsentPage({ authorizationId }: { authorizationId?: string }) {
  const { session, status } = useAuth();
  const id = authorizationId || new URLSearchParams(window.location.search).get('authorization_id') || '';
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated' || !session || !id) return;
    setDetails(null);
    setError(null);
    client.getOAuthDetails(id, session.accessToken).then(setDetails).catch((cause) => {
      setError(cause instanceof Error ? cause.message : 'The OAuth authorization request is invalid or expired.');
    });
  }, [id, session, status]);

  async function decide(decision: 'approve' | 'deny') {
    if (!session || !id) return;
    setBusy(true);
    setError(null);
    try {
      const result = decision === 'approve'
        ? await client.approveOAuth(id, session.accessToken)
        : await client.denyOAuth(id, session.accessToken);
      if (import.meta.env.MODE === 'test') window.history.replaceState({}, '', '/oauth/complete');
      else window.location.assign(result.redirectUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The OAuth request could not be completed.');
      setBusy(false);
    }
  }

  if (status === 'loading') return <main className="oauth-shell"><section className="oauth-card"><div className="brand"><img src="/relo-logo.svg" alt="Relo" /><span>relo</span></div><div role="status">Checking your session</div></section></main>;
  if (status === 'unauthenticated') return <main className="oauth-shell"><section className="oauth-card"><p className="eyebrow">Connected application</p><h1>Sign in to review access.</h1><p className="muted">Relo will show the requested permissions after your identity is confirmed.</p><Link className="button button-dark" to={`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`}>Sign in</Link></section></main>;
  if (error || !id || !details) return <main className="oauth-shell"><section className="oauth-card"><p className="eyebrow">Authorization unavailable</p><h1>We couldn’t load this request.</h1><p role="alert" className="form-error">{error || 'The authorization request is incomplete or expired.'}</p><Link className="button button-dark" to="/">Return to Relo</Link></section></main>;

  const scopes = details.scope?.split(/\s+/).filter(Boolean) ?? ['basic account identity'];
  return <main className="oauth-shell"><section className="oauth-card" aria-labelledby="oauth-title"><div className="brand"><img src="/relo-logo.svg" alt="Relo" /><span>relo</span></div><p className="eyebrow">Connected application</p><h1 id="oauth-title">Allow {details.client.name} to connect?</h1><p className="muted">Review the details before continuing. Your password and one-time codes are never shared.</p><div className="oauth-client"><strong>{details.client.name}</strong>{details.client.uri ? <a href={details.client.uri} target="_blank" rel="noreferrer">{details.client.uri}</a> : null}</div><div className="oauth-detail"><span className="eyebrow">Return destination</span><code>{details.redirect_uri || 'Registered callback URL'}</code></div><div className="oauth-detail"><span className="eyebrow">Requested access</span><ul>{scopes.map((scope) => <li key={scope}><span aria-hidden="true">✓</span>{scope}</li>)}</ul></div><div className="oauth-actions"><button className="button button-quiet" type="button" onClick={() => void decide('deny')} disabled={busy}>Deny</button><button className="button button-dark" type="button" onClick={() => void decide('approve')} disabled={busy}>{busy ? 'Processing…' : 'Approve access'}</button></div></section></main>;
}

export default OAuthConsentPage;
