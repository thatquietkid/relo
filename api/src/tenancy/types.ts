export type TenantStatus = 'active' | 'suspended' | 'archived';
export type MembershipStatus = 'active' | 'suspended' | 'revoked';
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export type RoleKey = string;

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  created_at: string;
  updated_at: string;
}

export interface MembershipRow {
  id: string;
  tenant_id: string;
  user_id: string;
  status: MembershipStatus;
  joined_at: string;
  suspended_at: string | null;
}

export interface RoleRow {
  id: string;
  key: RoleKey;
}

export interface MembershipRoleRow {
  membership_id: string;
  role_id: string;
}

export interface MembershipView extends MembershipRow {
  tenant: Pick<TenantRow, 'id' | 'name' | 'slug' | 'status'>;
  roles: RoleRow[];
}

export interface InvitationStorageRow {
  id: string;
  tenant_id: string;
  email: string;
  role_key: RoleKey;
  token_hash: string;
  status: InvitationStatus;
  expires_at: string;
  accepted_at: string | null;
  invited_by: string | null;
  created_at: string;
}

export interface InvitationView {
  id: string;
  tenant_id: string;
  email: string;
  role_key: RoleKey;
  status: InvitationStatus;
  expires_at: string;
  accepted_at: string | null;
  invited_by: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  tenant_id: string;
  actor_user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface IdempotencyKeyRow {
  id: string;
  tenant_id: string;
  actor_user_id: string;
  key: string;
  request_hash: string;
  response_status: number;
  response_body: Record<string, unknown>;
  created_at: string;
  expires_at: string;
}
