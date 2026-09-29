import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OtpVerifyPage } from './OtpVerifyPage';
import { useAuth } from '../../app/auth/AuthProvider';
import type { DemoPortal } from '../../app/auth/auth-client';

const demoPortals: Array<{ key: DemoPortal; label: string }> = [
  { key: 'employee', label: 'Employee portal' },
  { key: 'hr', label: 'HR portal' },
  { key: 'admin', label: 'Admin portal' },
];

function isDemoAccessVisible(): boolean {
  if (import.meta.env.VITE_RELO_DEMO_ACCESS_ENABLED !== 'true') return false;
  const hostname = window.location.hostname.toLowerCase();
  const localHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const devHosts = (import.meta.env.VITE_RELO_DEMO_ACCESS_HOSTS as string | undefined)
    ?.split(',').map((host) => host.trim().toLowerCase()).filter(Boolean) ?? [];
  return localHost || devHosts.includes(hostname);
}

export function LoginPage() {
  const { requestOtp, signInWithGoogle, signInDemo } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState<DemoPortal | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const showDemoAccess = isDemoAccessVisible();

  useEffect(() => {
    const returnTo = new URLSearchParams(window.location.search).get('returnTo');
    if (returnTo?.startsWith('/') && !returnTo.startsWith('//')) sessionStorage.setItem('relo.returnTo', returnTo);
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestOtp(email);
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not send a sign-in code.');
    } finally {
      setBusy(false);
    }
  }

  async function openDemoPortal(portal: DemoPortal) {
    setDemoBusy(portal);
    setDemoError(null);
    try {
      await signInDemo(portal);
      const returnTo = sessionStorage.getItem('relo.returnTo');
      sessionStorage.removeItem('relo.returnTo');
      navigate(returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/');
    } catch (cause) {
      setDemoError(cause instanceof Error ? cause.message : 'We could not open the demo portal.');
    } finally {
      setDemoBusy(null);
    }
  }

  if (sent) {
    return (
      <div className="auth-shell">
        <div className="auth-orb auth-orb-1" aria-hidden="true" />
        <div className="auth-orb auth-orb-2" aria-hidden="true" />
        <div className="auth-orb auth-orb-3" aria-hidden="true" />
        <OtpVerifyPage email={email} onBack={() => setSent(false)} />
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-orb auth-orb-1" aria-hidden="true" />
      <div className="auth-orb auth-orb-2" aria-hidden="true" />
      <div className="auth-orb auth-orb-3" aria-hidden="true" />
      <section className="auth-card" aria-labelledby="login-title">
        <p className="eyebrow">Your relocation workspace</p>
        <h1 id="login-title">A calmer way to get there.</h1>
        <p className="muted">Sign in with your work email. Relo will send a secure one-time code.</p>
        <form onSubmit={submit} className="auth-form">
          <label htmlFor="work-email">Work email</label>
          <input
            id="work-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            required
          />
          {error ? <p role="alert" className="form-error">{error}</p> : null}
          <button className="button button-dark full-width" type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send sign-in code'}
          </button>
        </form>
        <div className="auth-divider"><span>or</span></div>
        <button className="button button-quiet full-width" type="button" onClick={() => void signInWithGoogle()}>
          Continue with Google
        </button>
        {showDemoAccess ? (
          <>
            <div className="auth-divider"><span>or preview a portal</span></div>
            <div className="demo-access" aria-label="Demo portals">
              {demoPortals.map(({ key, label }) => (
                <button
                  className="button button-quiet full-width demo-access-button"
                  type="button"
                  key={key}
                  onClick={() => void openDemoPortal(key)}
                  disabled={busy || demoBusy !== null}
                >
                  <span>{demoBusy === key ? 'Opening…' : label}</span>
                  <span aria-hidden="true">→</span>
                </button>
              ))}
              {demoError ? <p role="alert" className="form-error">{demoError}</p> : null}
            </div>
          </>
        ) : null}
        <p className="auth-note">Relo access is employer-sponsored. New portal accounts are not created from this form.</p>
      </section>
    </div>
  );
}

export default LoginPage;
