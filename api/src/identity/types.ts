import type { AuthUser } from '@relo/contracts/auth';
import type { MembershipView } from '../tenancy/types.js';

export type { AuthUser } from '@relo/contracts/auth';

export type AuthProvider = 'email' | 'google';

export interface IdentityContext {
  user: AuthUser;
  memberships: MembershipView[];
  platformScope?: boolean;
  platformRoles?: string[];
}
