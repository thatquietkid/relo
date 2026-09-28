import { createSupabaseClient, type SupabaseClientConfig } from '../identity/supabase.js';
import { ApiError } from '../shared/errors.js';
import type { NotificationRepository, NotificationView, PreferenceChannels, PreferencePrivacy, PreferenceView } from './notification-service.js';

function repositoryError(): ApiError { return new ApiError(503, 'NOTIFICATION_DATA_UNAVAILABLE', 'Notification data is unavailable.'); }

function mapNotification(value: unknown): NotificationView {
  if (!value || typeof value !== 'object') throw repositoryError();
  const row = value as Record<string, unknown>;
  return { id: String(row.id), kind: String(row.kind), title: String(row.title), body: String(row.body), readAt: typeof row.read_at === 'string' ? row.read_at : null, deliveryStatus: row.delivery_status as NotificationView['deliveryStatus'], createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

function boolValue(value: unknown, fallback: boolean): boolean { return typeof value === 'boolean' ? value : fallback; }

function mapPreferences(value: unknown): PreferenceView {
  if (!value || typeof value !== 'object') throw repositoryError();
  const row = value as Record<string, unknown>;
  const settings = row.notification_settings && typeof row.notification_settings === 'object' ? row.notification_settings as Record<string, unknown> : {};
  const privacySettings = row.privacy_settings && typeof row.privacy_settings === 'object' ? row.privacy_settings as Record<string, unknown> : {};
  return { timezone: String(row.timezone), channels: { email: boolValue(settings.email, true), inApp: boolValue(settings.inApp, true), push: boolValue(settings.push, false) }, privacy: { shareContact: boolValue(privacySettings.shareContact, false) }, updatedAt: String(row.updated_at) };
}

function mapError(error: unknown): ApiError {
  const message = typeof (error as { message?: unknown })?.message === 'string' ? String((error as { message: string }).message) : '';
  if (message.includes('NOTIFICATION_FORBIDDEN')) return new ApiError(403, 'FORBIDDEN', 'You do not have access to this notification.');
  if (message.includes('NOTIFICATION_NOT_FOUND')) return new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.');
  if (message.includes('NOTIFICATION_NOT_DELIVERED')) return new ApiError(409, 'NOTIFICATION_NOT_DELIVERED', 'This notification cannot be marked read yet.');
  if (message.includes('MEMBERSHIP_REQUIRED')) return new ApiError(403, 'MEMBERSHIP_REQUIRED', 'An active tenant membership is required.');
  return repositoryError();
}

function channelsValue(value: PreferenceChannels): Record<string, boolean> { return { email: value.email, inApp: value.inApp, push: value.push }; }
function privacyValue(value: PreferencePrivacy): Record<string, boolean> { return { shareContact: value.shareContact }; }

export function makeSupabaseNotificationRepository(client: ReturnType<typeof createSupabaseClient>): NotificationRepository {
  return {
    async listNotifications(userId, page, pageSize) {
      const from = (page - 1) * pageSize;
      const result = await client.from('notifications').select('id, kind, title, body, read_at, delivery_status, created_at, updated_at', { count: 'exact' }).eq('user_id', userId).order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, from + pageSize - 1);
      if (result.error) throw repositoryError();
      const unread = await client.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null);
      if (unread.error) throw repositoryError();
      return { items: (result.data ?? []).map(mapNotification), total: result.count ?? 0, unreadCount: unread.count ?? 0 };
    },
    async markNotificationRead(userId, notificationId) {
      const result = await client.rpc('employee_mark_notification_read', { p_user_id: userId, p_notification_id: notificationId });
      if (result.error) throw mapError(result.error);
      return String(result.data) as 'updated' | 'already_read';
    },
    async getPreferences(userId) {
      const result = await client.from('user_preferences').select('timezone, notification_settings, privacy_settings, updated_at').eq('user_id', userId).maybeSingle();
      if (result.error) throw repositoryError();
      return result.data ? mapPreferences(result.data) : null;
    },
    async updatePreferences(userId, patch) {
      const result = await client.rpc('employee_update_preferences', { p_user_id: userId, p_timezone: patch.timezone, p_notification_settings: channelsValue(patch.channels), p_privacy_settings: privacyValue(patch.privacy) });
      if (result.error) throw mapError(result.error);
      return mapPreferences(result.data);
    },
  };
}

export function createSupabaseNotificationRepositoryFromEnv(accessToken: string): NotificationRepository {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const token = accessToken.trim();
  if (!url || !publishableKey || !token) throw repositoryError();
  const config: SupabaseClientConfig = { url, publishableKey, accessToken: token };
  return makeSupabaseNotificationRepository(createSupabaseClient(config));
}
