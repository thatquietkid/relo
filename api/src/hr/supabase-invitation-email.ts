import { createClient } from '@supabase/supabase-js';
import { ApiError } from '../shared/errors.js';

export interface InvitationEmailSender {
  send(email: string, redirectTo: string): Promise<void>;
}

function isExistingUserError(error: { code?: string; message?: string }): boolean {
  const code = error.code?.toLowerCase();
  return code === 'email_exists' || code === 'user_already_exists'
    || /already (?:registered|exists)/i.test(error.message ?? '');
}

export function createSupabaseInvitationEmailSenderFromEnv(): InvitationEmailSender {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new ApiError(503, 'INVITATION_EMAIL_UNAVAILABLE', 'Invitation email is not configured. Contact your administrator.');
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    async send(email, redirectTo) {
      const invited = await client.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (!invited.error) return;
      if (!isExistingUserError(invited.error)) {
        throw new ApiError(502, 'INVITATION_EMAIL_FAILED', 'Supabase could not send this invitation. Please try again.');
      }

      // An existing Relo account cannot receive another Auth invite. Send its normal
      // sign-in link to the same app invitation route so it can join the workspace.
      const signIn = await client.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
      });
      if (signIn.error) {
        throw new ApiError(502, 'INVITATION_EMAIL_FAILED', 'Supabase could not send this invitation. Please try again.');
      }
    },
  };
}
