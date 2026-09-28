export type RelocationCaseStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type ChecklistItemState = 'pending' | 'in_progress' | 'completed' | 'skipped';
export type CityStatus = 'active' | 'archived';
export type ProviderContactPolicy = 'employee_request' | 'no_direct_contact';
export type ProviderStatus = 'active' | 'archived';
export type DirectoryEntryStatus = 'draft' | 'published' | 'archived';
export type ProviderRequestStatus =
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'approved'
  | 'in_progress'
  | 'completed'
  | 'withdrawn'
  | 'rejected';
export type NotificationDeliveryStatus = 'pending' | 'delivered' | 'failed' | 'suppressed';

export type JsonObject = Record<string, unknown>;

export interface RelocationCaseRow {
  id: string;
  tenant_id: string;
  employee_user_id: string;
  destination_city_id: string;
  move_date: string;
  status: RelocationCaseStatus;
  progress_percent: number;
  created_at: string;
  updated_at: string;
}

export type RelocationCaseView = Omit<RelocationCaseRow, 'tenant_id' | 'employee_user_id'>;

export interface ChecklistItemRow {
  id: string;
  case_id: string;
  key: string;
  title: string;
  description: string | null;
  state: ChecklistItemState;
  due_at: string | null;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type ChecklistItemView = ChecklistItemRow;

export interface CityRow {
  id: string;
  country_code: string;
  name: string;
  slug: string;
  timezone: string;
  status: CityStatus;
  created_at: string;
  updated_at: string;
}

export type CityView = CityRow;

export interface ProviderRow {
  id: string;
  city_id: string;
  category: string;
  name: string;
  summary: string;
  contact_policy: ProviderContactPolicy;
  status: ProviderStatus;
  created_at: string;
  updated_at: string;
}

export type ProviderView = ProviderRow;

export interface DirectoryEntryRow {
  id: string;
  provider_id: string;
  title: string;
  description: string;
  metadata: JsonObject;
  source_url: string | null;
  published_at: string | null;
  expires_at: string | null;
  status: DirectoryEntryStatus;
  created_at: string;
  updated_at: string;
}

export type DirectoryEntryView = Omit<DirectoryEntryRow, 'metadata'>;

export interface ShortlistItemRow {
  id: string;
  user_id: string;
  directory_entry_id: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export type ShortlistItemView = Omit<ShortlistItemRow, 'user_id'>;

export interface ProviderRequestRow {
  id: string;
  case_id: string;
  directory_entry_id: string;
  status: ProviderRequestStatus;
  submitted_at: string | null;
  withdrawn_at: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

export type ProviderRequestView = Omit<ProviderRequestRow, 'idempotency_key'>;

export interface ConsentRecordRow {
  id: string;
  request_id: string;
  field_name: string;
  consented: boolean;
  recorded_at: string;
  withdrawn_at: string | null;
}

export type ConsentRecordView = ConsentRecordRow;

export interface NotificationRow {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  read_at: string | null;
  delivery_status: NotificationDeliveryStatus;
  dedupe_key: string;
  created_at: string;
  updated_at: string;
}

export type NotificationView = Omit<NotificationRow, 'user_id' | 'dedupe_key'>;

export interface UserPreferencesRow {
  user_id: string;
  timezone: string;
  notification_settings: JsonObject;
  privacy_settings: JsonObject;
  updated_at: string;
}

export type UserPreferencesView = Omit<UserPreferencesRow, 'user_id'>;
