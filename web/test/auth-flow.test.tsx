/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../src/app/auth/AuthProvider';
import { ProtectedRoute } from '../src/components/ProtectedRoute';
import { LoginPage } from '../src/pages/auth/LoginPage';
import { OAuthConsentPage } from '../src/pages/oauth/OAuthConsentPage';
import { AppShell } from '../src/app/routes';

const authClient = vi.hoisted(() => ({
  requestOtp: vi.fn().mockResolvedValue({ accepted: true }),
  verifyOtp: vi.fn(),
  startGoogleSignIn: vi.fn().mockResolvedValue({ url: 'https://accounts.google.com/oauth' }),
  getCurrentIdentity: vi.fn(),
  logout: vi.fn().mockResolvedValue({ signedOut: true }),
  acceptInvitation: vi.fn(),
  getOAuthDetails: vi.fn(),
  approveOAuth: vi.fn(),
  denyOAuth: vi.fn(),
}));

vi.mock('../src/app/auth/auth-client', () => authClient);

const employeeIdentity = {
  user: { id: 'user-1', email: 'employee@example.com' },
  memberships: [{
    id: 'membership-1',
    tenant_id: 'tenant-1',
    user_id: 'user-1',
    status: 'active',
    joined_at: '2026-09-28T00:00:00.000Z',
    suspended_at: null,
    tenant: { id: 'tenant-1', name: 'Acme Mobility', slug: 'acme', status: 'active' },
    roles: [{ id: 'role-1', key: 'employee' }],
  }],
};

function renderWithAuth(ui: React.ReactNode) {
  return render(<BrowserRouter><AuthProvider>{ui}</AuthProvider></BrowserRouter>);
}

describe('authenticated web shell', () => {
  beforeEach(() => {
    cleanup();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.clearAllMocks();
    authClient.getCurrentIdentity.mockResolvedValue(employeeIdentity);
    authClient.requestOtp.mockResolvedValue({ accepted: true });
    authClient.startGoogleSignIn.mockResolvedValue({ url: 'https://accounts.google.com/oauth' });
  });

  it('does not render dashboard content before auth resolves', () => {
    sessionStorage.setItem('relo.session', JSON.stringify({ accessToken: 'access-token' }));
    authClient.getCurrentIdentity.mockReturnValue(new Promise(() => undefined));

    renderWithAuth(
      <ProtectedRoute permission="employee:read">
        <div>dashboard</div>
      </ProtectedRoute>,
    );

    expect(screen.queryByText('dashboard')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session');
  });

  it('redirects an unauthenticated visitor to login without rendering protected content', async () => {
    renderWithAuth(
      <ProtectedRoute permission="employee:read">
        <div>dashboard</div>
      </ProtectedRoute>,
    );

    await waitFor(() => expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument());
    expect(screen.queryByText('dashboard')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  it('shows a forbidden state when the resolved identity lacks permission', async () => {
    sessionStorage.setItem('relo.session', JSON.stringify({ accessToken: 'access-token' }));
    authClient.getCurrentIdentity.mockResolvedValue({ ...employeeIdentity, memberships: [] });

    renderWithAuth(
      <ProtectedRoute permission="hr:read">
        <div>hr dashboard</div>
      </ProtectedRoute>,
    );

    expect(await screen.findByRole('heading', { name: /access not available/i })).toBeInTheDocument();
    expect(screen.queryByText('hr dashboard')).not.toBeInTheDocument();
  });

  it('shows OTP verification after the email form submits', async () => {
    const user = userEvent.setup();
    renderWithAuth(<LoginPage />);

    await user.type(screen.getByLabelText('Work email'), 'employee@example.com');
    await user.click(screen.getByRole('button', { name: /send sign-in code/i }));

    expect(await screen.findByLabelText('One-time code')).toBeInTheDocument();
    expect(authClient.requestOtp).toHaveBeenCalledWith('employee@example.com');
  });

  it('shows an invalid OTP error and supports Google sign-in start', async () => {
    const user = userEvent.setup();
    authClient.verifyOtp.mockRejectedValue({ error: { code: 'INVALID_OTP', message: 'The email code is invalid or expired.' } });
    renderWithAuth(<LoginPage />);

    await user.type(screen.getByLabelText('Work email'), 'employee@example.com');
    await user.click(screen.getByRole('button', { name: /send sign-in code/i }));
    await user.type(await screen.findByLabelText('One-time code'), '000000');
    await user.click(screen.getByRole('button', { name: /verify code/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or expired/i);

    await user.click(screen.getByRole('button', { name: /use a different email/i }));
    await user.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(authClient.startGoogleSignIn).toHaveBeenCalled();
  });

  it('supports logout without exposing the access token in rendered copy', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem('relo.session', JSON.stringify({ accessToken: 'secret-token' }));
    authClient.getCurrentIdentity.mockResolvedValue(employeeIdentity);

    renderWithAuth(<AppShell />);
    await screen.findByRole('button', { name: /sign out/i });
    await user.click(screen.getByRole('button', { name: /sign out/i }));

    expect(authClient.logout).toHaveBeenCalledWith('secret-token');
    expect(document.body).not.toHaveTextContent('secret-token');
  });

  it('renders OAuth consent only after identity and authorization details resolve', async () => {
    sessionStorage.setItem('relo.session', JSON.stringify({ accessToken: 'access-token' }));
    authClient.getCurrentIdentity.mockReturnValue(new Promise(() => undefined));
    renderWithAuth(<OAuthConsentPage authorizationId="auth-1" />);

    expect(screen.getByRole('status')).toHaveTextContent('Checking your session');
    expect(screen.queryByText(/allow/i)).not.toBeInTheDocument();
  });

  it('shows a safe invalid OAuth state and supports approve and deny actions', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem('relo.session', JSON.stringify({ accessToken: 'access-token' }));
    authClient.getOAuthDetails.mockRejectedValue({ error: { code: 'OAUTH_CONSENT_ERROR', message: 'The OAuth authorization request is invalid or expired.' } });
    renderWithAuth(<OAuthConsentPage authorizationId="invalid" />);
    expect(await screen.findByRole('heading', { name: /couldn.t load this request/i })).toBeInTheDocument();

    cleanup();
    authClient.getOAuthDetails.mockResolvedValue({
      authorization_id: 'auth-1',
      client: { name: 'Move App', uri: 'https://move.example.com' },
      redirect_uri: 'https://move.example.com/callback',
      scope: 'openid profile',
    });
    authClient.approveOAuth.mockResolvedValue({ redirectUrl: 'https://move.example.com/callback?code=approved' });
    authClient.denyOAuth.mockResolvedValue({ redirectUrl: 'https://move.example.com/callback?error=denied' });
    renderWithAuth(<OAuthConsentPage authorizationId="auth-1" />);
    expect(await screen.findByRole('heading', { name: /allow move app to connect/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /approve access/i }));
    expect(authClient.approveOAuth).toHaveBeenCalledWith('auth-1', 'access-token');
  });

  it('provides keyboard-focusable mobile navigation with reduced-motion tokens', async () => {
    sessionStorage.setItem('relo.session', JSON.stringify({ accessToken: 'access-token' }));
    renderWithAuth(<AppShell />);
    expect(await screen.findByRole('navigation', { name: /mobile navigation/i })).toBeInTheDocument();
    const mobileNavigation = screen.getByRole('navigation', { name: /mobile navigation/i });
    expect(within(mobileNavigation).getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
    expect(within(mobileNavigation).getByRole('link', { name: /checklist/i })).toHaveAttribute('href', '/checklist');
  });
});
