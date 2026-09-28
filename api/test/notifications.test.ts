import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { makeNotificationService, type NotificationRepository, type NotificationView, type PreferenceView, type PreferencesPatch } from '../src/notifications/notification-service.js';
import type { AuthService } from '../src/identity/auth-service.js';
import type { IdentityContext } from '../src/identity/types.js';
import type { MembershipView } from '../src/tenancy/types.js';

const now = new Date('2026-09-29T12:00:00.000Z');
const membership: MembershipView = {
  id: 'membership-a', tenant_id: 'tenant-a', user_id: 'employee-a', status: 'active',
  joined_at: '2026-09-01T00:00:00.000Z', suspended_at: null,
  tenant: { id: 'tenant-a', name: 'Acme', slug: 'acme', status: 'active' },
  roles: [{ id: 'role-employee', key: 'employee' }],
};
const employee: IdentityContext = { user: { id: 'employee-a', email: 'employee@example.com' }, memberships: [membership] };

function notification(overrides: Partial<NotificationView> = {}): NotificationView {
  return { id: 'notification-1', kind: 'checklist', title: 'Next step', body: 'Collect documents', readAt: null, deliveryStatus: 'delivered', createdAt: '2026-09-29T10:00:00.000Z', updatedAt: '2026-09-29T10:00:00.000Z', ...overrides };
}

class InMemoryNotificationRepository implements NotificationRepository {
  notifications: Array<NotificationView & { userId: string }> = [notification(), notification({ id: 'notification-2', readAt: '2026-09-29T11:00:00.000Z' }), notification({ id: 'notification-other', title: 'Private', body: 'Other employee', readAt: null })].map((value, index) => ({ ...value, userId: index === 2 ? 'employee-b' : 'employee-a' }));
  preferences = new Map<string, PreferenceView>([['employee-a', { timezone: 'Asia/Kolkata', channels: { email: true, inApp: true, push: false }, privacy: { shareContact: false }, updatedAt: '2026-09-29T10:00:00.000Z' }]]);

  async listNotifications(userId: string, page: number, pageSize: number) {
    const all = this.notifications.filter((value) => value.userId === userId);
    const start = (page - 1) * pageSize;
    return { items: all.slice(start, start + pageSize), total: all.length, unreadCount: all.filter((value) => value.readAt === null).length };
  }
  async markNotificationRead(userId: string, notificationId: string) {
    const existing = this.notifications.find((value) => value.id === notificationId);
    if (!existing) return 'not_found' as const;
    if (existing.userId !== userId) return 'forbidden' as const;
    existing.readAt ??= now.toISOString();
    existing.updatedAt = now.toISOString();
    return 'updated' as const;
  }
  async getPreferences(userId: string) { return this.preferences.get(userId) ?? null; }
  async updatePreferences(userId: string, patch: PreferencesPatch) {
    const current = this.preferences.get(userId);
    const result: PreferenceView = { timezone: patch.timezone ?? current?.timezone ?? 'UTC', channels: { email: true, inApp: true, push: false, ...current?.channels, ...patch.channels }, privacy: { shareContact: false, ...current?.privacy, ...patch.privacy }, updatedAt: now.toISOString() };
    this.preferences.set(userId, result);
    return result;
  }
}

function authServiceFor(identity = employee): AuthService {
  return {
    requestEmailOtp: async () => ({ accepted: true }), verifyEmailOtp: async () => { throw new Error('unused'); },
    getGoogleSignInUrl: async () => 'https://accounts.google.com', getCurrentIdentity: async () => identity,
    logout: async () => ({ signedOut: true }),
  };
}

describe('employee notifications and preferences', () => {
  it('lists only the employee notifications and returns unread count', async () => {
    const service = makeNotificationService({ repository: new InMemoryNotificationRepository(), now: () => now });
    const result = await service.listNotifications(employee, { page: 1, pageSize: 20 });
    expect(result.items.map((item) => item.id)).toEqual(['notification-1', 'notification-2']);
    expect(result.unreadCount).toBe(1);
  });

  it('cannot mark another users notification as read', async () => {
    const service = makeNotificationService({ repository: new InMemoryNotificationRepository(), now: () => now });
    await expect(service.markNotificationRead(employee, 'notification-other')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('marks an own delivered notification read without changing its content', async () => {
    const repository = new InMemoryNotificationRepository();
    const service = makeNotificationService({ repository, now: () => now });
    await service.markNotificationRead(employee, 'notification-1');
    expect(repository.notifications.find((item) => item.id === 'notification-1')).toMatchObject({ readAt: now.toISOString(), title: 'Next step' });
  });

  it('normalizes preference updates and preserves unspecified channels', async () => {
    const repository = new InMemoryNotificationRepository();
    const service = makeNotificationService({ repository, now: () => now });
    const result = await service.updatePreferences(employee, { email: false });
    expect(result.channels).toMatchObject({ email: false, inApp: true, push: false });
    expect(result.timezone).toBe('Asia/Kolkata');
  });

  it('rejects invalid preference values', async () => {
    const service = makeNotificationService({ repository: new InMemoryNotificationRepository(), now: () => now });
    await expect(service.updatePreferences(employee, { timezone: 'not a timezone' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('notification routes', () => {
  it('registers notification and preference routes', async () => {
    const repository = new InMemoryNotificationRepository();
    const app = createApp({ logger: false }, { authService: authServiceFor(), notificationRepository: repository });
    const list = await app.inject({ method: 'GET', url: '/api/v1/me/notifications?page=1&pageSize=20', headers: { authorization: 'Bearer employee-token' } });
    expect(list.statusCode).toBe(200);
    expect(list.json().unreadCount).toBe(1);
    const read = await app.inject({ method: 'POST', url: '/api/v1/me/notifications/notification-1/read', headers: { authorization: 'Bearer employee-token' } });
    expect(read.statusCode).toBe(204);
    const preferences = await app.inject({ method: 'GET', url: '/api/v1/me/preferences', headers: { authorization: 'Bearer employee-token' } });
    expect(preferences.statusCode).toBe(200);
    const updated = await app.inject({ method: 'PATCH', url: '/api/v1/me/preferences', headers: { authorization: 'Bearer employee-token' }, payload: { email: false } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().preferences.channels.email).toBe(false);
    await app.close();
  });
});
