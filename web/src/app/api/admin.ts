import { request } from './base';

export interface AdminEventView {
  id: string;
  action: string;
  resourceType: string;
  createdAt: string;
}

export const getAdminEvents = (accessToken: string) =>
  request<{ items: AdminEventView[]; total: number }>('/api/v1/admin/events', {}, accessToken);
