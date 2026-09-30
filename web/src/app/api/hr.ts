import { request, requestHrLegacy } from './base';

export type HrProviderRequestStatus =
  | 'submitted'
  | 'in_review'
  | 'approved'
  | 'in_progress'
  | 'completed'
  | 'withdrawn'
  | 'rejected';

export interface HrProviderRequest {
  id: string;
  employeeUserId: string;
  entryTitle: string;
  providerName: string;
  status: HrProviderRequestStatus;
  submittedAt: string;
  updatedAt: string;
}

export interface AaarrrMetric {
  key: string;
  label: string;
  numerator: number;
  denominator: number;
  rate: number;
  status: 'ok' | 'no_data';
  sourceEvents: string[];
  demoData?: boolean;
}

export interface AaarrrReport {
  from: string;
  to: string;
  generatedAt: string;
  metrics: Record<string, AaarrrMetric>;
  activation: AaarrrMetric;
  acquisition: AaarrrMetric;
  retention: AaarrrMetric;
  referral: AaarrrMetric;
  revenue: AaarrrMetric;
}

export interface HrProperty {
  id: string;
  organizationId?: string | null;
  title: string;
  address: string;
  city: string;
  country: string;
  propertyType: 'apartment' | 'house' | 'condo' | 'studio';
  bedrooms: number;
  bathrooms: number;
  rentMonthly: number;
  deposit: number;
  availableFrom: string;
  amenities: string[];
  description: string;
  contactEmail: string;
  contactPhone: string;
  status: 'active' | 'pending' | 'leased' | 'archived';
  createdAt?: string;
  updatedAt?: string;
}

export interface HrCohort {
  id: string;
  organizationId?: string | null;
  name: string;
  destinationCity: string;
  destinationCountry: string;
  startDate: string;
  targetDate?: string;
  memberCount: number;
  budgetPerEmployee: number;
  description: string;
  status: 'planning' | 'active' | 'completed' | 'archived';
  createdAt?: string;
  updatedAt?: string;
}

export interface HrEmployeeSummary {
  membershipId: string;
  userId: string;
  email: string;
  name: string | null;
  status: string;
  joinedAt: string;
  roles: string[];
}

export interface HrInvitation {
  id: string;
  tenantId: string;
  email: string;
  role: 'employee' | 'hr';
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expiresAt: string;
  acceptedAt: string | null;
  invitedBy: string | null;
  createdAt: string;
  inviteUrl?: string;
}

export interface HrProgram {
  id: string;
  tenantId: string;
  name: string;
  destinationCityId: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived';
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
}

export const getHrEmployees = (accessToken: string) =>
  request<{ items: HrEmployeeSummary[]; page: number; pageSize: number; total: number; totalPages: number }>(
    '/api/v1/hr/employees?page=1&pageSize=100',
    {},
    accessToken,
  );

export const createHrInvitation = (
  accessToken: string,
  input: { email: string; role: 'employee' | 'hr' },
  idempotencyKey: string,
) =>
  request<{ invitation: HrInvitation }>(
    '/api/v1/hr/invitations',
    { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input) },
    accessToken,
  );

export const getHrPrograms = (accessToken: string) =>
  request<{ items: HrProgram[]; page: number; pageSize: number; total: number; totalPages: number }>(
    '/api/v1/hr/programs?page=1&pageSize=100',
    {},
    accessToken,
  );

export const getHrProviderRequests = (accessToken: string) =>
  request<{ items: HrProviderRequest[]; total: number }>(
    '/api/v1/hr/provider-requests',
    {},
    accessToken
  );

export const updateHrProviderRequestStatus = (
  accessToken: string,
  requestId: string,
  status: HrProviderRequestStatus
) =>
  request<{ request: HrProviderRequest }>(
    `/api/v1/hr/provider-requests/${encodeURIComponent(requestId)}`,
    { method: 'PATCH', body: JSON.stringify({ status }) },
    accessToken
  );

export const getAaarrrReport = (accessToken: string, from: string, to: string) =>
  request<{ report: AaarrrReport }>(
    `/api/v1/hr/reports/aarrr?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    {},
    accessToken
  );

export const requestReportExport = (
  accessToken: string,
  from: string,
  to: string,
  idempotencyKey: string
) =>
  request<{ export: { id: string; status: string; requestedAt: string } }>(
    '/api/v1/hr/reports/exports',
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ from, to }),
    },
    accessToken
  );

// HR Properties Listing Endpoints
export const getHrProperties = (
  accessToken: string,
  filters?: { city?: string; status?: string; type?: string }
) => {
  const params = new URLSearchParams();
  if (filters?.city) params.set('city', filters.city);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.type) params.set('type', filters.type);
  const query = params.toString() ? `?${params.toString()}` : '';
  return requestHrLegacy<{ properties: HrProperty[]; count: number }>(
    `/api/hr/properties${query}`,
    {},
    accessToken
  );
};

export const createHrProperty = (
  accessToken: string,
  input: Omit<HrProperty, 'id' | 'createdAt' | 'updatedAt'>
) =>
  requestHrLegacy<{ property: HrProperty; message: string }>(
    '/api/hr/properties',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    accessToken
  );

export const updateHrProperty = (
  accessToken: string,
  propertyId: string,
  patch: Partial<HrProperty>
) =>
  requestHrLegacy<{ property: HrProperty; message: string }>(
    `/api/hr/properties/${encodeURIComponent(propertyId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
    accessToken
  );

export const deleteHrProperty = (accessToken: string, propertyId: string) =>
  requestHrLegacy<{ removed: boolean; id: string; message: string }>(
    `/api/hr/properties/${encodeURIComponent(propertyId)}`,
    {
      method: 'DELETE',
    },
    accessToken
  );

// HR Cohorts Endpoints
export const getHrCohorts = (accessToken: string, status?: string) => {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return requestHrLegacy<{ cohorts: HrCohort[]; count: number }>(
    `/api/hr/cohorts${query}`,
    {},
    accessToken
  );
};

export const createHrCohort = (
  accessToken: string,
  input: Omit<HrCohort, 'id' | 'createdAt' | 'updatedAt'>
) =>
  requestHrLegacy<{ cohort: HrCohort; message: string }>(
    '/api/hr/cohorts',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    accessToken
  );

export const updateHrCohort = (
  accessToken: string,
  cohortId: string,
  patch: Partial<HrCohort>
) =>
  requestHrLegacy<{ cohort: HrCohort; message: string }>(
    `/api/hr/cohorts/${encodeURIComponent(cohortId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
    accessToken
  );
