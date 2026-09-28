import type { IdentityContext } from '../identity/types.js';
import { selectEmployeeMembership } from '../employee/checklist-service.js';
import { ApiError } from '../shared/errors.js';

export interface NotificationView {
  id: string;
  kind: string;
  title: string;
  body: string;
  readAt: string | null;
  deliveryStatus: 'pending' | 'delivered' | 'failed' | 'suppressed';
  createdAt: string;
  updatedAt: string;
}

export interface NotificationPage {
  items: NotificationView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unreadCount: number;
}

export interface PreferenceChannels { email: boolean; inApp: boolean; push: boolean; }
export interface PreferencePrivacy { shareContact: boolean; }
export interface PreferenceView { timezone: string; channels: PreferenceChannels; privacy: PreferencePrivacy; updatedAt: string; }
export interface PreferencesPatch {
  timezone?: string;
  email?: boolean;
  inApp?: boolean;
  push?: boolean;
  shareContact?: boolean;
  channels?: Partial<PreferenceChannels>;
  privacy?: Partial<PreferencePrivacy>;
}

export interface NotificationRepository {
  listNotifications(userId: string, page: number, pageSize: number): Promise<{ items: NotificationView[]; total: number; unreadCount: number }>;
  markNotificationRead(userId: string, notificationId: string): Promise<'updated' | 'already_read' | 'not_found' | 'forbidden'>;
  getPreferences(userId: string): Promise<PreferenceView | null>;
  updatePreferences(userId: string, patch: { timezone: string; channels: PreferenceChannels; privacy: PreferencePrivacy }): Promise<PreferenceView>;
}

const DEFAULT_TIMEZONE = 'UTC';
const DEFAULT_CHANNELS: PreferenceChannels = { email: true, inApp: true, push: false };
const DEFAULT_PRIVACY: PreferencePrivacy = { shareContact: false };

function employee(identity: IdentityContext): { userId: string; tenantId: string } {
  const membership = selectEmployeeMembership(identity);
  return { userId: identity.user.id, tenantId: membership.tenant_id };
}

function validTimezone(value: string): string {
  const timezone = value.trim();
  if (!timezone || timezone.length > 80) throw new ApiError(400, 'VALIDATION_ERROR', 'The timezone is invalid.');
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); } catch { throw new ApiError(400, 'VALIDATION_ERROR', 'The timezone is invalid.'); }
  return timezone;
}

function pageOf(items: NotificationView[], page: number, pageSize: number, total: number, unreadCount: number): NotificationPage {
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), unreadCount };
}

export function makeNotificationService({ repository, now = () => new Date() }: { repository: NotificationRepository; now?: () => Date }) {
  return {
    async listNotifications(identity: IdentityContext, input: { page?: number; pageSize?: number } = {}): Promise<NotificationPage> {
      const { userId } = employee(identity);
      const page = Number.isInteger(input.page) && (input.page as number) > 0 ? input.page as number : 1;
      const pageSize = Number.isInteger(input.pageSize) && (input.pageSize as number) > 0 ? Math.min(input.pageSize as number, 50) : 20;
      const result = await repository.listNotifications(userId, page, pageSize);
      return pageOf(result.items, page, pageSize, result.total, result.unreadCount);
    },

    async markNotificationRead(identity: IdentityContext, notificationId: string): Promise<void> {
      const { userId } = employee(identity);
      const result = await repository.markNotificationRead(userId, notificationId);
      if (result === 'forbidden') throw new ApiError(403, 'FORBIDDEN', 'You do not have access to this notification.');
      if (result === 'not_found') throw new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.');
      if (result === 'already_read' || result === 'updated') return;
      throw new ApiError(503, 'NOTIFICATION_DATA_UNAVAILABLE', 'Notification data is unavailable.');
    },

    async getPreferences(identity: IdentityContext): Promise<PreferenceView> {
      const { userId } = employee(identity);
      return (await repository.getPreferences(userId)) ?? { timezone: DEFAULT_TIMEZONE, channels: { ...DEFAULT_CHANNELS }, privacy: { ...DEFAULT_PRIVACY }, updatedAt: now().toISOString() };
    },

    async updatePreferences(identity: IdentityContext, patch: PreferencesPatch): Promise<PreferenceView> {
      const { userId } = employee(identity);
      const existing = await repository.getPreferences(userId);
      const channels = {
        ...(existing?.channels ?? DEFAULT_CHANNELS),
        ...(patch.channels ?? {}),
        ...(patch.email === undefined ? {} : { email: patch.email }),
        ...(patch.inApp === undefined ? {} : { inApp: patch.inApp }),
        ...(patch.push === undefined ? {} : { push: patch.push }),
      };
      const privacy = { ...(existing?.privacy ?? DEFAULT_PRIVACY), ...(patch.privacy ?? {}), ...(patch.shareContact === undefined ? {} : { shareContact: patch.shareContact }) };
      if (Object.values(channels).some((value) => typeof value !== 'boolean') || Object.values(privacy).some((value) => typeof value !== 'boolean')) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Preference values must be boolean.');
      }
      return repository.updatePreferences(userId, { timezone: validTimezone(patch.timezone ?? existing?.timezone ?? DEFAULT_TIMEZONE), channels, privacy });
    },
  };
}

export type NotificationService = ReturnType<typeof makeNotificationService>;
