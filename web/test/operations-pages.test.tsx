/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../src/app/auth/AuthProvider';
import { HrDashboardPage } from '../src/pages/hr/HrDashboardPage';
import { AdminEventsPage } from '../src/pages/admin/AdminEventsPage';

const auth: AuthContextValue = {
  session: { accessToken: 'token', refreshToken: 'refresh', expiresAt: null, expiresIn: null, tokenType: 'bearer' },
  identity: { user: { id: 'hr-1', email: 'hr@example.com' }, memberships: [{ id: 'm-1', tenant_id: 't-1', user_id: 'hr-1', status: 'active', joined_at: '', suspended_at: null, tenant: { id: 't-1', name: 'Acme', slug: 'acme', status: 'active' }, roles: [{ id: 'r-1', key: 'hr' }] }] },
  status: 'authenticated', requestOtp: vi.fn(), verifyOtp: vi.fn(), signInDemo: vi.fn(), signInWithGoogle: vi.fn(), refreshIdentity: vi.fn(), completeOAuthCallback: vi.fn(), signOut: vi.fn(),
};

vi.mock('../src/app/auth/auth-client', () => ({
  getAaarrrReport: vi.fn().mockResolvedValue({ report: { activation: { numerator: 0, denominator: 0, rate: 0, status: 'no_data' }, acquisition: { numerator: 0, denominator: 0, rate: 0, status: 'no_data' }, retention: { numerator: 0, denominator: 0, rate: 0, status: 'no_data' }, referral: { numerator: 0, denominator: 0, rate: 0, status: 'no_data' }, revenue: { numerator: 0, denominator: 0, rate: 0, status: 'no_data' } } }),
  getAdminEvents: vi.fn().mockResolvedValue({ items: [] }),
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
    expect(await screen.findByRole('heading', { name: /platform events/i })).toBeInTheDocument();
    expect(screen.getByText(/no events/i)).toBeInTheDocument();
  });
});
