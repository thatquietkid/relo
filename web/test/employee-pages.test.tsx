/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../src/app/auth/AuthProvider';
import { ChecklistPage } from '../src/pages/employee/ChecklistPage';
import { ExplorePage } from '../src/pages/employee/ExplorePage';
import { SettingsPage } from '../src/pages/employee/SettingsPage';
import { ConsentDialog } from '../src/components/employee/ConsentDialog';

const client = vi.hoisted(() => ({
  getEmployeeCase: vi.fn(), getEmployeeChecklist: vi.fn(), updateChecklistItem: vi.fn(),
  getDirectory: vi.fn(), getShortlist: vi.fn(), saveShortlist: vi.fn(), removeShortlist: vi.fn(),
  getProviderRequestPreview: vi.fn(), submitProviderRequest: vi.fn(), getProviderRequests: vi.fn(), withdrawProviderRequest: vi.fn(),
  getNotifications: vi.fn(), markNotificationRead: vi.fn(), getPreferences: vi.fn(), updatePreferences: vi.fn(),
}));

vi.mock('../src/app/auth/auth-client', () => ({ ...client }));

const session = { accessToken: 'access-token', refreshToken: 'refresh-token', expiresAt: null, expiresIn: null, tokenType: 'bearer' };
const identity = { user: { id: 'employee-1', email: 'employee@example.com' }, memberships: [] };
const authValue: AuthContextValue = {
  session, identity, status: 'authenticated', requestOtp: vi.fn(), verifyOtp: vi.fn(), signInWithGoogle: vi.fn(),
  refreshIdentity: vi.fn(), completeOAuthCallback: vi.fn(), signOut: vi.fn(),
};

function renderPage(ui: React.ReactNode) {
  return render(<BrowserRouter><AuthContext.Provider value={authValue}>{ui}</AuthContext.Provider></BrowserRouter>);
}

describe('employee mobile journey', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    client.getEmployeeChecklist.mockResolvedValue({ checklist: [
      { id: 'item-1', title: 'Compare housing options', description: 'Review two trusted options', state: 'pending', due_at: null },
    ] });
    client.updateChecklistItem.mockResolvedValue({ checklist_item: { id: 'item-1', title: 'Compare housing options', state: 'completed' } });
    client.getEmployeeCase.mockResolvedValue({ relocation: { destination_city_id: 'city-bengaluru' } });
    client.getDirectory.mockResolvedValue({ items: [{ id: 'entry-1', title: 'Bengaluru housing guide', description: 'A calm place to start.', providerName: 'Safe Homes', providerSummary: 'Trusted housing support.', category: 'housing', cityName: 'Bengaluru' }], page: 1, pageSize: 20, total: 1, totalPages: 1 });
    client.getShortlist.mockResolvedValue({ shortlist: [] });
    client.getPreferences.mockResolvedValue({ preferences: { timezone: 'Asia/Kolkata', channels: { email: true, inApp: true, push: false }, privacy: { shareContact: false }, updatedAt: '2026-09-29T10:00:00.000Z' } });
    client.updatePreferences.mockResolvedValue({ preferences: { timezone: 'Asia/Kolkata', channels: { email: false, inApp: true, push: false }, privacy: { shareContact: false }, updatedAt: '2026-09-29T12:00:00.000Z' } });
    client.getNotifications.mockResolvedValue({ items: [] });
  });

  afterEach(() => cleanup());

  it('shows the next checklist action and can complete it on mobile', async () => {
    const user = userEvent.setup();
    renderPage(<ChecklistPage />);
    expect(await screen.findByRole('heading', { name: /my checklist/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /complete compare housing options/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/saved/i);
    expect(client.updateChecklistItem).toHaveBeenCalledWith('access-token', 'item-1', 'completed', expect.any(String));
  });

  it('renders directory cards from the API and keeps the explore search mobile friendly', async () => {
    renderPage(<ExplorePage />);
    expect(await screen.findByRole('heading', { name: /explore trusted services/i })).toBeInTheDocument();
    expect(screen.getByText('Safe Homes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save bengaluru housing guide/i })).toBeInTheDocument();
  });

  it('requires every consent checkbox before request submission', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    const fields = [
      { field: 'email', label: 'Email address', value: 'employee@example.com', required: true as const },
      { field: 'destination_city', label: 'Destination city', value: 'Bengaluru', required: true as const },
    ];
    renderPage(<ConsentDialog fields={fields} onConfirm={onConfirm} onCancel={vi.fn()} />);
    const send = screen.getByRole('button', { name: /send request/i });
    expect(send).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /email address/i }));
    expect(send).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /destination city/i }));
    expect(send).toBeEnabled();
    await user.click(send);
    expect(onConfirm).toHaveBeenCalledWith([{ field: 'email', consented: true }, { field: 'destination_city', consented: true }]);
  });

  it('loads preferences and preserves the other notification channels when saving', async () => {
    const user = userEvent.setup();
    renderPage(<SettingsPage />);
    expect(await screen.findByRole('heading', { name: /settings/i })).toBeInTheDocument();
    const email = screen.getByRole('checkbox', { name: /email notifications/i });
    await user.click(email);
    await user.click(screen.getByRole('button', { name: /save settings/i }));
    await waitFor(() => expect(client.updatePreferences).toHaveBeenCalledWith('access-token', expect.objectContaining({ email: false, inApp: true, push: false })));
    expect(await screen.findByRole('status')).toHaveTextContent(/saved/i);
  });
});
