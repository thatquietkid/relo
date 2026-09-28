export type ProgramStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';
export type ProgramMembershipStatus = 'enrolled' | 'active' | 'completed' | 'withdrawn';
export type SupportCaseStatus = 'open' | 'in_progress' | 'waiting_on_requester' | 'resolved' | 'closed';

export interface ProgramRow {
  id: string;
  tenant_id: string;
  name: string;
  destination_city_id: string;
  status: ProgramStatus;
  starts_at: string;
  ends_at: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProgramMembershipRow {
  program_id: string;
  membership_id: string;
  status: ProgramMembershipStatus;
  enrolled_at: string;
}

export interface InvitationBatchRow {
  id: string;
  tenant_id: string;
  created_by: string;
  label: string;
  expires_at: string;
  created_at: string;
}

export interface InvitationBatchItemRow {
  batch_id: string;
  invitation_id: string;
}

export interface ReviewAssignmentRow {
  id: string;
  reviewer_user_id: string;
  city_id: string;
  category: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FeatureFlagRow {
  id: string;
  key: string;
  scope: 'global' | 'tenant' | 'environment';
  enabled: boolean;
  config: Record<string, unknown>;
  updated_by: string;
  updated_at: string;
}

export interface SupportCaseRow {
  id: string;
  tenant_id: string;
  requester_user_id: string;
  status: SupportCaseStatus;
  subject: string;
  body: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}
