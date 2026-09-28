import { ApiError } from '../shared/errors.js';
import type { MembershipView } from '../tenancy/types.js';
import type { SupabaseInvitationPort } from './supabase.js';

interface InvitationServiceOptions {
  supabase: SupabaseInvitationPort;
}

export interface InvitationService {
  acceptInvitation(userId: string, rawToken: string): Promise<MembershipView>;
}

export function makeInvitationService({ supabase }: InvitationServiceOptions): InvitationService {
  return {
    async acceptInvitation(userId, rawToken) {
      if (!userId || !rawToken) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'The invitation token is required.');
      }
      const { data, error } = await supabase.acceptInvitation(userId, rawToken);
      if (error || !data) {
        const known = new Set([
          'INVITATION_EMAIL_MISMATCH',
          'INVITATION_INVALID_TOKEN',
          'INVITATION_EXPIRED',
          'INVITATION_ALREADY_ACCEPTED',
          'INVITATION_PRIVILEGED_MEMBERSHIP_CONFLICT',
        ]);
        const code = error && known.has(error.code ?? '')
          ? error.code!
          : error && known.has(error.message)
            ? error.message
            : undefined;
        if (code) {
          throw new ApiError(409, code, 'The invitation cannot be accepted.');
        }
        if (!error) throw new ApiError(409, 'INVITATION_INVALID_TOKEN', 'The invitation cannot be accepted.');
        throw new ApiError(502, 'INVITATION_PROVIDER_ERROR', 'Unable to accept the invitation.');
      }
      return data;
    },
  };
}
