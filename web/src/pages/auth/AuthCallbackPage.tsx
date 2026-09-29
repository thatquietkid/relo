import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/auth/AuthProvider';
import type { WebSession } from '../../app/auth/auth-client';
import { returnPathForWorkspace, workspaceHomePath, workspaceRoleForIdentity } from '../../app/auth/workspace-routing';

function callbackParameters(): URLSearchParams {
  const hash = window.location.hash.replace(/^#/, '');
  return new URLSearchParams(hash || window.location.search.replace(/^\?/, ''));
}

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const { completeOAuthCallback } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = callbackParameters();
    const providerError = params.get('error_description') || params.get('error');
    const accessToken = params.get('access_token');
    if (providerError) {
      setError('Google sign-in could not complete. Please try again.');
      return;
    }
    if (!accessToken) {
      setError('Google sign-in could not complete. The callback did not include a session.');
      return;
    }

    const callbackSession: WebSession = {
      accessToken,
      refreshToken: params.get('refresh_token') || '',
      expiresAt: params.get('expires_at') ? Number(params.get('expires_at')) : null,
      expiresIn: params.get('expires_in') ? Number(params.get('expires_in')) : null,
      tokenType: params.get('token_type') || 'bearer',
    };
    completeOAuthCallback(callbackSession).then((identity) => {
      const role = workspaceRoleForIdentity(identity);
      const returnTo = sessionStorage.getItem('relo.returnTo');
      sessionStorage.removeItem('relo.returnTo');
      navigate(returnPathForWorkspace(returnTo, role) ?? workspaceHomePath(role), { replace: true });
    }).catch(() => setError('Google sign-in could not complete. Please try again.'));
  }, [completeOAuthCallback, navigate]);

  if (error) return <main className="oauth-shell"><section className="oauth-card"><p className="eyebrow">Authentication</p><h1>Sign-in was not completed.</h1><p role="alert" className="form-error">{error}</p><Link className="button button-dark" to="/login">Return to sign in</Link></section></main>;
  return <main className="oauth-shell"><section className="oauth-card"><p className="eyebrow">Authentication</p><h1>Finishing sign-in.</h1><div role="status">Checking your Google session</div></section></main>;
}

export default AuthCallbackPage;
