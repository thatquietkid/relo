import { request } from './base';

export interface AdminEventView {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export type AdminEvent = AdminEventView;

export const getAdminEvents = (accessToken: string, filters: { resourceType?: string } = {}) => {
  const params = new URLSearchParams({ page: '1', pageSize: '50' });
  if (filters.resourceType) params.set('resourceType', filters.resourceType);
  return request<{ items: AdminEvent[]; total: number }>(
    `/api/v1/admin/events?${params.toString()}`,
    {},
    accessToken,
  );
};
