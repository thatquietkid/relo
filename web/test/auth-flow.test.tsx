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
import { InviteAcceptPage } from '../src/pages/auth/InviteAcceptPage';
import { AuthCallbackPage } from '../src/pages/auth/AuthCallbackPage';
import { permissionForPath } from '../src/app/App';

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

  it('clears the local session even when the logout API fails', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem('relo.session', JSON.stringify({ accessToken: 'secret-token' }));
    authClient.getCurrentIdentity.mockResolvedValue(employeeIdentity);
    authClient.logout.mockRejectedValueOnce(new Error('network down'));

    renderWithAuth(<ProtectedRoute permission="employee:read"><AppShell /></ProtectedRoute>);
    await screen.findByRole('button', { name: /sign out/i });
    await user.click(screen.getByRole('button', { name: /sign out/i }));

    expect(await screen.findByRole('link', { name: /sign in/i })).toBeInTheDocument();
    expect(sessionStorage.getItem('relo.session')).toBeNull();
  });

  it('refreshes identity and memberships after accepting an invitation', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem('relo.session', JSON.stringify({ accessToken: 'access-token' }));
    authClient.getCurrentIdentity
      .mockResolvedValueOnce(employeeIdentity)
      .mockResolvedValueOnce({ ...employeeIdentity, memberships: [...employeeIdentity.memberships, { ...employeeIdentity.memberships[0], id: 'membership-2' }] });
    authClient.acceptInvitation.mockResolvedValue({ membership: { id: 'membership-2' } });

    renderWithAuth(<InviteAcceptPage token="invite-token" />);
    await user.click(await screen.findByRole('button', { name: /accept invitation/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/membership is ready/i);
    expect(authClient.getCurrentIdentity).toHaveBeenCalledTimes(2);
    expect(authClient.getCurrentIdentity).toHaveBeenLastCalledWith('access-token');
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

  it('handles an OAuth authorization that was already completed without crashing', async () => {
    sessionStorage.setItem('relo.session', JSON.stringify({ accessToken: 'access-token' }));
    authClient.getOAuthDetails.mockResolvedValue({ alreadyHandled: true, redirectUrl: 'https://move.example.com/callback?code=used' });

    renderWithAuth(<OAuthConsentPage authorizationId="already-used" />);

    await waitFor(() => expect(window.location.pathname).toBe('/oauth/complete'));
    expect(screen.queryByRole('button', { name: /approve access/i })).not.toBeInTheDocument();
  });

  it('completes the Google callback and restores the protected return path', async () => {
    sessionStorage.setItem('relo.returnTo', '/checklist');
    window.history.replaceState({}, '', '/auth/callback#access_token=oauth-access&refresh_token=oauth-refresh&expires_in=3600&token_type=bearer');
    authClient.getCurrentIdentity.mockResolvedValue(employeeIdentity);

    renderWithAuth(<AuthCallbackPage />);

    await waitFor(() => expect(window.location.pathname).toBe('/checklist'));
    expect(authClient.getCurrentIdentity).toHaveBeenCalledWith('oauth-access');
    expect(sessionStorage.getItem('relo.returnTo')).toBeNull();
  });

  it('renders a safe callback error when Google returns an access denial', async () => {
    window.history.replaceState({}, '', '/auth/callback#error=access_denied&error_description=User%20cancelled');

    renderWithAuth(<AuthCallbackPage />);

    expect(await screen.findByRole('heading', { name: /sign-in was not completed/i })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not complete/i);
  });

  it('uses API permission identifiers and allows platform scope only for platform permissions', async () => {
    sessionStorage.setItem('relo.session', JSON.stringify({ accessToken: 'access-token' }));
    authClient.getCurrentIdentity.mockResolvedValue({
      ...employeeIdentity,
      platformScope: true,
      platformRoles: ['platform_admin'],
      platformAuthorization: { scope: 'tenant', roles: [], permissions: [] },
      memberships: [{ ...employeeIdentity.memberships[0], roles: [{ id: 'role-admin', key: 'admin' }] }],
    });

    renderWithAuth(<ProtectedRoute permission="tenant-admin:read"><div>tenant admin</div></ProtectedRoute>);
    expect(await screen.findByText('tenant admin')).toBeInTheDocument();
    cleanup();
    authClient.getCurrentIdentity.mockResolvedValue({
      ...employeeIdentity,
      memberships: [{ ...employeeIdentity.memberships[0], roles: [{ id: 'role-admin', key: 'admin' }] }],
    });
    renderWithAuth(<ProtectedRoute permission="platform:health:read"><div>platform health</div></ProtectedRoute>);
    expect(await screen.findByRole('heading', { name: /access not available/i })).toBeInTheDocument();
    cleanup();
    authClient.getCurrentIdentity.mockResolvedValue({
      ...employeeIdentity,
      platformAuthorization: { scope: 'platform', roles: ['platform_admin'], permissions: ['platform:health:read'] },
      memberships: [],
    });
    renderWithAuth(<ProtectedRoute permission="platform:health:read"><div>platform health</div></ProtectedRoute>);
    expect(await screen.findByText('platform health')).toBeInTheDocument();
  });

  it('keeps tenant-admin navigation reachable while reserving platform screens', async () => {
    sessionStorage.setItem('relo.session', JSON.stringify({ accessToken: 'access-token' }));
    authClient.getCurrentIdentity.mockResolvedValue({
      ...employeeIdentity,
      memberships: [{ ...employeeIdentity.memberships[0], roles: [{ id: 'role-admin', key: 'admin' }] }],
    });

    renderWithAuth(<AppShell />);

    const navigation = await screen.findByRole('navigation', { name: /primary navigation/i });
    expect(within(navigation).getByRole('link', { name: /events/i })).toHaveAttribute('href', '/admin');
    expect(within(navigation).getByRole('link', { name: /users/i })).toHaveAttribute('href', '/admin/users');
    expect(within(navigation).queryByRole('link', { name: /health/i })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole('link', { name: /tenants/i })).not.toBeInTheDocument();
  });

  it('maps tenant-admin and platform route metadata to distinct API permissions', () => {
    expect(permissionForPath('/admin')).toBe('tenant-admin:read');
    expect(permissionForPath('/admin/users')).toBe('tenant-admin:write');
    expect(permissionForPath('/admin/health')).toBe('platform:health:read');
    expect(permissionForPath('/admin/tenants')).toBe('platform:tenants:manage');
    expect(permissionForPath('/admin/settings')).toBe('platform:feature-flags:manage');
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
