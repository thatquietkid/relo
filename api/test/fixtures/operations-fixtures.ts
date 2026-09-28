import type {
  FeatureFlagRow,
  InvitationBatchItemRow,
  InvitationBatchRow,
  ProgramMembershipRow,
  ProgramRow,
  ReviewAssignmentRow,
  SupportCaseRow,
} from '../../src/operations/types.js';

const CREATED_AT = '2026-09-29T00:00:00.000Z';

export interface OperationsFixtures {
  tenantIds: [string, string];
  programs: [ProgramRow, ProgramRow];
  programMembership: ProgramMembershipRow;
  invitationBatch: InvitationBatchRow;
  invitationBatchItem: InvitationBatchItemRow;
  reviewAssignment: ReviewAssignmentRow;
  featureFlag: FeatureFlagRow;
  supportCase: SupportCaseRow;
}

export function createOperationsFixtures(): OperationsFixtures {
  const tenantIds: [string, string] = [
    '00000000-0000-0000-0000-000000008001',
    '00000000-0000-0000-0000-000000008002',
  ];
  const actor = '00000000-0000-0000-0000-000000008011';
  const cityIds = ['00000000-0000-0000-0000-000000008021', '00000000-0000-0000-0000-000000008022'];
  const programs: [ProgramRow, ProgramRow] = [
    {
      id: '00000000-0000-0000-0000-000000008031', tenant_id: tenantIds[0], name: 'India onboarding',
      destination_city_id: cityIds[0], status: 'active', starts_at: '2026-10-01T00:00:00.000Z',
      ends_at: '2026-12-31T23:59:59.000Z', created_by: actor, created_at: CREATED_AT, updated_at: CREATED_AT,
    },
    {
      id: '00000000-0000-0000-0000-000000008032', tenant_id: tenantIds[1], name: 'Cross-tenant isolation',
      destination_city_id: cityIds[1], status: 'draft', starts_at: '2026-10-01T00:00:00.000Z',
      ends_at: '2026-12-31T23:59:59.000Z', created_by: actor, created_at: CREATED_AT, updated_at: CREATED_AT,
    },
  ];
  return {
    tenantIds,
    programs,
    programMembership: {
      program_id: programs[0].id, membership_id: '00000000-0000-0000-0000-000000008041',
      status: 'enrolled', enrolled_at: CREATED_AT,
    },
    invitationBatch: {
      id: '00000000-0000-0000-0000-000000008051', tenant_id: tenantIds[0], created_by: actor,
      label: 'October cohort', expires_at: '2026-10-31T23:59:59.000Z', created_at: CREATED_AT,
    },
    invitationBatchItem: {
      batch_id: '00000000-0000-0000-0000-000000008051', invitation_id: '00000000-0000-0000-0000-000000008061',
    },
    reviewAssignment: {
      id: '00000000-0000-0000-0000-000000008071', reviewer_user_id: actor, city_id: cityIds[0],
      category: 'housing', active: true, created_at: CREATED_AT, updated_at: CREATED_AT,
    },
    featureFlag: {
      id: '00000000-0000-0000-0000-000000008081', key: 'employee.explore', scope: 'global',
      enabled: true, config: { rollout: 100 }, updated_by: actor, updated_at: CREATED_AT,
    },
    supportCase: {
      id: '00000000-0000-0000-0000-000000008091', tenant_id: tenantIds[0], requester_user_id: actor,
      status: 'open', subject: 'Need help with housing', body: 'Please help me understand the next step.',
      assigned_to: null, created_at: CREATED_AT, updated_at: CREATED_AT,
    },
  };
}
