export interface AuthUser {
  id: string;
  email: string | null;
}

export interface PlatformAuthorizationSummary {
  scope: 'tenant' | 'platform';
  roles: string[];
  permissions: string[];
}
