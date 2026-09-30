import { request } from './base';

export interface EmployeeCase {
  id: string;
  destination_city_id: string;
  destination_city_name?: string | null;
  move_date: string;
  status: string;
  progress_percent: number;
}

export interface ChecklistItem {
  id: string;
  title: string;
  description: string | null;
  state: 'pending' | 'in_progress' | 'completed' | 'skipped';
  due_at?: string | null;
  completed_at?: string | null;
}

export interface NotificationView {
  id: string;
  kind: string;
  title: string;
  body: string;
  readAt: string | null;
  deliveryStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface PreferencesView {
  timezone: string;
  channels: { email: boolean; inApp: boolean; push: boolean };
  privacy: { shareContact: boolean };
  updatedAt: string;
}

export const getEmployeeCase = (accessToken: string) =>
  request<{ relocation: EmployeeCase }>('/api/v1/me/relocation', {}, accessToken);

export const getEmployeeChecklist = (accessToken: string) =>
  request<{ checklist: ChecklistItem[] }>('/api/v1/me/relocation/checklist', {}, accessToken);

export const updateChecklistItem = (
  accessToken: string,
  itemId: string,
  state: ChecklistItem['state'],
  idempotencyKey: string
) =>
  request<{ checklist_item: ChecklistItem }>(
    `/api/v1/me/relocation/checklist/${encodeURIComponent(itemId)}`,
    {
      method: 'PATCH',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ state }),
    },
    accessToken
  );

export const getNotifications = (accessToken: string) =>
  request<{
    items: NotificationView[];
    unreadCount: number;
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>('/api/v1/me/notifications?page=1&pageSize=20', {}, accessToken);

export const markNotificationRead = (accessToken: string, notificationId: string) =>
  request<void>(
    `/api/v1/me/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: 'POST' },
    accessToken
  );

export const getPreferences = (accessToken: string) =>
  request<{ preferences: PreferencesView }>('/api/v1/me/preferences', {}, accessToken);

export const updatePreferences = (
  accessToken: string,
  patch: {
    timezone?: string;
    email?: boolean;
    inApp?: boolean;
    push?: boolean;
    shareContact?: boolean;
  }
) =>
  request<{ preferences: PreferencesView }>(
    '/api/v1/me/preferences',
    { method: 'PATCH', body: JSON.stringify(patch) },
    accessToken
  );
