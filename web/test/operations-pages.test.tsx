/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../src/app/auth/AuthProvider';
import { HrDashboardPage } from '../src/pages/hr/HrDashboardPage';
import { AdminEventsPage } from '../src/pages/admin/AdminEventsPage';
import { AdminUsersPage } from '../src/pages/admin/AdminUsersPage';

const auth: AuthContextValue = {
  session: { accessToken: 'token', refreshToken: 'refresh', expiresAt: null, expiresIn: null, tokenType: 'bearer' },
  identity: { user: { id: 'hr-1', email: 'hr@example.com' }, memberships: [{ id: 'm-1', tenant_id: 't-1', user_id: 'hr-1', status: 'active', joined_at: '', suspended_at: null, tenant: { id: 't-1', name: 'Acme', slug: 'acme', status: 'active' }, roles: [{ id: 'r-1', key: 'hr' }] }] },
  status: 'authenticated', requestOtp: vi.fn(), verifyOtp: vi.fn(), signInDemo: vi.fn(), signInWithGoogle: vi.fn(), refreshIdentity: vi.fn(), completeOAuthCallback: vi.fn(), signOut: vi.fn(),
};

vi.mock('../src/app/auth/auth-client', () => ({
  getAaarrrReport: vi.fn().mockResolvedValue({ report: { activation: { numerator: 0, denominator: 0, rate: 0, status: 'no_data' }, acquisition: { numerator: 0, denominator: 0, rate: 0, status: 'no_data' }, retention: { numerator: 0, denominator: 0, rate: 0, status: 'no_data' }, referral: { numerator: 0, denominator: 0, rate: 0, status: 'no_data' }, revenue: { numerator: 0, denominator: 0, rate: 0, status: 'no_data' } } }),
  getAdminEvents: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  getHrEmployees: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 }),
  createHrInvitation: vi.fn(),
}));

function renderPage(ui: React.ReactNode) { return render(<BrowserRouter><AuthContext.Provider value={auth}>{ui}</AuthContext.Provider></BrowserRouter>); }

describe('operations web surfaces', () => {
  afterEach(() => cleanup());
  it('renders explicit no-data AARRR states', async () => {
    renderPage(<HrDashboardPage />);
    expect(await screen.findByRole('heading', { name: /hr workspace/i })).toBeInTheDocument();
    expect(screen.getAllByText(/no data in this window/i).length).toBeGreaterThan(0);
    expect(screen.queryByText('71%')).not.toBeInTheDocument();
  });

  it('keeps the admin events surface empty and truthful', async () => {
    renderPage(<AdminEventsPage />);
    expect(await screen.findByRole('heading', { name: /activity/i })).toBeInTheDocument();
    expect(screen.getByText(/no events/i)).toBeInTheDocument();
  });

  it('shows recent activity and reloads it by category', async () => {
    const user = userEvent.setup();
    const client = await import('../src/app/auth/auth-client');
    vi.mocked(client.getAdminEvents).mockResolvedValueOnce({ items: [{ id: 'event-1', action: 'member.invited', resourceType: 'invitation', resourceId: 'invite-1', createdAt: '2026-09-29T12:00:00.000Z', metadata: {} }], total: 1 });
    renderPage(<AdminEventsPage />);

    expect(await screen.findByText('Member Invited')).toBeInTheDocument();
    expect(screen.getByText(/1 event in this view/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/category/i), 'invitation');

    await waitFor(() => expect(client.getAdminEvents).toHaveBeenLastCalledWith('token', { resourceType: 'invitation' }));
  });

  it('lets a tenant admin invite an HR user through the existing HR role', async () => {
    const user = userEvent.setup();
    const client = await import('../src/app/auth/auth-client');
    vi.mocked(client.createHrInvitation).mockResolvedValueOnce({ invitation: { id: 'invitation-1', tenantId: 't-1', email: 'new-hr@example.com', role: 'hr', status: 'pending', expiresAt: '2026-10-06T00:00:00.000Z', acceptedAt: null, invitedBy: 'admin-1', createdAt: '2026-09-29T12:00:00.000Z', inviteUrl: 'https://relo.example/invite/token' } });
    const adminAuth = { ...auth, identity: { ...auth.identity!, user: { id: 'admin-1', email: 'admin@example.com' }, memberships: [{ ...auth.identity!.memberships[0], roles: [{ id: 'admin-role', key: 'admin' }] }] } };
    render(<BrowserRouter><AuthContext.Provider value={adminAuth}><AdminUsersPage /></AuthContext.Provider></BrowserRouter>);

    await user.type(await screen.findByLabelText(/email/i), 'new-hr@example.com');
    await user.selectOptions(screen.getByLabelText(/access level/i), 'hr');
    await user.click(screen.getByRole('button', { name: /send invitation/i }));

    await waitFor(() => expect(client.createHrInvitation).toHaveBeenCalledWith('token', { email: 'new-hr@example.com', role: 'hr' }, expect.any(String)));
    expect(await screen.findByRole('link', { name: /copy or open invitation/i })).toHaveAttribute('href', 'https://relo.example/invite/token');
  });
});
