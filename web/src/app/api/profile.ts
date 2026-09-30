import { request } from './base';

export interface UserPreferences {
  notificationsEmail?: boolean;
  notificationsInApp?: boolean;
  theme?: string;
  shareContact?: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: string;
  organizationId: string | null;
  phone?: string;
  bio?: string;
  department?: string;
  jobTitle?: string;
  timezone?: string;
  preferences?: UserPreferences;
}

export const getProfile = (accessToken: string) =>
  request<{ profile: UserProfile }>('/api/profile', {}, accessToken);

export const updateProfile = (
  accessToken: string,
  patch: {
    fullName?: string;
    phone?: string;
    bio?: string;
    department?: string;
    jobTitle?: string;
    preferences?: UserPreferences;
  }
) =>
  request<{ profile: UserProfile; message: string }>(
    '/api/profile',
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
    accessToken
  );
