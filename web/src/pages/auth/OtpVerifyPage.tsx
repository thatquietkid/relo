import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/auth/AuthProvider';
import { returnPathForWorkspace, workspaceHomePath, workspaceRoleForIdentity } from '../../app/auth/workspace-routing';

export function OtpVerifyPage({ email, onBack }: { email: string; onBack?: () => void }) {
  const { verifyOtp } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const identity = await verifyOtp(email, code);
      const storedReturnTo = sessionStorage.getItem('relo.returnTo');
      sessionStorage.removeItem('relo.returnTo');
      const role = workspaceRoleForIdentity(identity);
      navigate(returnPathForWorkspace(storedReturnTo, role) ?? workspaceHomePath(role), { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The email code is invalid or expired.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="auth-card" aria-labelledby="otp-title">
    <p className="eyebrow">Check your inbox</p>
    <h1 id="otp-title">Enter your six-digit code.</h1>
    <p className="muted">We sent a one-time sign-in code to <strong>{email}</strong>.</p>
    <form onSubmit={submit} className="auth-form">
      <label htmlFor="otp-code">One-time code</label>
      <input id="otp-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} required />
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      <button className="button button-dark" type="submit" disabled={busy}>{busy ? 'Checking code…' : 'Verify code'}</button>
    </form>
    <button className="text-button" type="button" onClick={onBack}>Use a different email</button>
  </section>;
}

export default OtpVerifyPage;
