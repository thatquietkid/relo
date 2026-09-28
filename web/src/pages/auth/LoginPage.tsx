import { useState } from 'react';
import { OtpVerifyPage } from './OtpVerifyPage';
import { useAuth } from '../../app/auth/AuthProvider';

export function LoginPage() {
  const { requestOtp, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  if (sent) return <OtpVerifyPage email={email} onBack={() => setSent(false)} />;
  return <section className="auth-card" aria-labelledby="login-title">
    <p className="eyebrow">Your relocation workspace</p>
    <h1 id="login-title">A calmer way to get there.</h1>
    <p className="muted">Sign in with your work email. Relo will send a secure one-time code.</p>
    <form onSubmit={submit} className="auth-form">
      <label htmlFor="work-email">Work email</label>
      <input id="work-email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      <button className="button button-dark" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send sign-in code'}</button>
    </form>
    <div className="auth-divider"><span>or</span></div>
    <button className="button button-quiet full-width" type="button" onClick={() => void signInWithGoogle()}>Continue with Google</button>
    <p className="auth-note">Relo access is employer-sponsored. New portal accounts are not created from this form.</p>
  </section>;
}

export default LoginPage;
