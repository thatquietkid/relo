import type {
  ChecklistItemRow,
  CityRow,
  DirectoryEntryRow,
  NotificationRow,
  ProviderRequestRow,
  ProviderRow,
  RelocationCaseRow,
  ShortlistItemRow,
  UserPreferencesRow,
} from '../../src/employee/types.js';

export interface EmployeeFixture {
  user_id: string;
  tenant_id: string;
  email: string;
}

export interface EmployeeFixtures {
  employees: [EmployeeFixture, EmployeeFixture];
  city: CityRow;
  provider: ProviderRow;
  publishedDirectoryEntry: DirectoryEntryRow;
  expiredDirectoryEntry: DirectoryEntryRow;
  relocationCases: [RelocationCaseRow, RelocationCaseRow];
  checklistItems: [ChecklistItemRow, ChecklistItemRow];
  shortlistItem: ShortlistItemRow;
  activeProviderRequest: ProviderRequestRow;
  unreadNotification: NotificationRow;
  notifications: [NotificationRow, NotificationRow];
  preferences: [UserPreferencesRow, UserPreferencesRow];
}

const CREATED_AT = '2026-09-28T00:00:00.000Z';
const UPDATED_AT = '2026-09-28T00:00:00.000Z';

export function createEmployeeFixtures(): EmployeeFixtures {
  const employees: [EmployeeFixture, EmployeeFixture] = [
    {
      user_id: '00000000-0000-0000-0000-000000007011',
      tenant_id: '00000000-0000-0000-0000-000000007021',
      email: 'employee-a@example.com',
    },
    {
      user_id: '00000000-0000-0000-0000-000000007012',
      tenant_id: '00000000-0000-0000-0000-000000007022',
      email: 'employee-b@example.com',
    },
  ];

  const city: CityRow = {
    id: '00000000-0000-0000-0000-000000007001',
    country_code: 'IN',
    name: 'Bengaluru',
    slug: 'bengaluru',
    timezone: 'Asia/Kolkata',
    status: 'active',
    created_at: CREATED_AT,
    updated_at: UPDATED_AT,
  };

  const provider: ProviderRow = {
    id: '00000000-0000-0000-0000-000000007002',
    city_id: city.id,
    category: 'housing',
    name: 'Bengaluru Homes',
    summary: 'Relocation housing support',
    contact_policy: 'employee_request',
    status: 'active',
    created_at: CREATED_AT,
    updated_at: UPDATED_AT,
  };

  const publishedDirectoryEntry: DirectoryEntryRow = {
    id: '00000000-0000-0000-0000-000000007003',
    provider_id: provider.id,
    title: 'Bengaluru housing guide',
    description: 'Published housing guidance for relocating employees.',
    metadata: { source: 'fixture' },
    source_url: 'https://directory.example/bengaluru-housing',
    published_at: '2026-09-27T00:00:00.000Z',
    expires_at: '2026-10-28T00:00:00.000Z',
    status: 'published',
    created_at: CREATED_AT,
    updated_at: UPDATED_AT,
  };

  const expiredDirectoryEntry: DirectoryEntryRow = {
    id: '00000000-0000-0000-0000-000000007004',
    provider_id: provider.id,
    title: 'Expired Bengaluru housing guide',
    description: 'An expired directory entry retained for history tests.',
    metadata: { source: 'fixture' },
    source_url: 'https://directory.example/expired-bengaluru-housing',
    published_at: '2026-08-01T00:00:00.000Z',
    expires_at: '2026-09-01T00:00:00.000Z',
    status: 'published',
    created_at: CREATED_AT,
    updated_at: UPDATED_AT,
  };

  const relocationCases: [RelocationCaseRow, RelocationCaseRow] = [
    {
      id: '00000000-0000-0000-0000-000000007031',
      tenant_id: employees[0].tenant_id,
      employee_user_id: employees[0].user_id,
      destination_city_id: city.id,
      move_date: '2026-11-15',
      status: 'active',
      progress_percent: 25,
      created_at: CREATED_AT,
      updated_at: UPDATED_AT,
    },
    {
      id: '00000000-0000-0000-0000-000000007032',
      tenant_id: employees[1].tenant_id,
      employee_user_id: employees[1].user_id,
      destination_city_id: city.id,
      move_date: '2026-12-01',
      status: 'active',
      progress_percent: 40,
      created_at: CREATED_AT,
      updated_at: UPDATED_AT,
    },
  ];

  const checklistItems: [ChecklistItemRow, ChecklistItemRow] = [
    {
      id: '00000000-0000-0000-0000-000000007041',
      case_id: relocationCases[0].id,
      key: 'documents',
      title: 'Collect documents',
      description: 'Identity documents',
      state: 'pending',
      due_at: '2026-10-05T00:00:00.000Z',
      completed_at: null,
      sort_order: 1,
      created_at: CREATED_AT,
      updated_at: UPDATED_AT,
    },
    {
      id: '00000000-0000-0000-0000-000000007042',
      case_id: relocationCases[1].id,
      key: 'documents',
      title: 'Collect documents',
      description: 'Identity documents',
      state: 'pending',
      due_at: '2026-10-05T00:00:00.000Z',
      completed_at: null,
      sort_order: 1,
      created_at: CREATED_AT,
      updated_at: UPDATED_AT,
    },
  ];

  const shortlistItem: ShortlistItemRow = {
    id: '00000000-0000-0000-0000-000000007051',
    user_id: employees[0].user_id,
    directory_entry_id: publishedDirectoryEntry.id,
    note: 'Ask about commute',
    created_at: CREATED_AT,
    updated_at: UPDATED_AT,
  };

  const activeProviderRequest: ProviderRequestRow = {
    id: '00000000-0000-0000-0000-000000007061',
    case_id: relocationCases[0].id,
    directory_entry_id: publishedDirectoryEntry.id,
    status: 'submitted',
    submitted_at: '2026-09-28T01:00:00.000Z',
    withdrawn_at: null,
    idempotency_key: 'employee-a-request-0001',
    created_at: CREATED_AT,
    updated_at: '2026-09-28T01:00:00.000Z',
  };

  const notifications: [NotificationRow, NotificationRow] = [
    {
      id: '00000000-0000-0000-0000-000000007071',
      user_id: employees[0].user_id,
      kind: 'checklist',
      title: 'Next step',
      body: 'Collect documents',
      read_at: null,
      delivery_status: 'delivered',
      dedupe_key: 'employee-a-checklist-0001',
      created_at: CREATED_AT,
      updated_at: UPDATED_AT,
    },
    {
      id: '00000000-0000-0000-0000-000000007072',
      user_id: employees[1].user_id,
      kind: 'checklist',
      title: 'Next step',
      body: 'Collect documents',
      read_at: '2026-09-28T02:00:00.000Z',
      delivery_status: 'delivered',
      dedupe_key: 'employee-b-checklist-0001',
      created_at: CREATED_AT,
      updated_at: '2026-09-28T02:00:00.000Z',
    },
  ];

  const preferences: [UserPreferencesRow, UserPreferencesRow] = [
    {
      user_id: employees[0].user_id,
      timezone: 'Asia/Kolkata',
      notification_settings: { email: true },
      privacy_settings: { share_contact: false },
      updated_at: UPDATED_AT,
    },
    {
      user_id: employees[1].user_id,
      timezone: 'Asia/Kolkata',
      notification_settings: { email: false },
      privacy_settings: { share_contact: false },
      updated_at: UPDATED_AT,
    },
  ];

  return {
    employees,
    city,
    provider,
    publishedDirectoryEntry,
    expiredDirectoryEntry,
    relocationCases,
    checklistItems,
    shortlistItem,
    activeProviderRequest,
    unreadNotification: notifications[0],
    notifications,
    preferences,
  };
}
