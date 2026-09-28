import type { IdentityContext } from '../identity/types.js';
import { ApiError } from '../shared/errors.js';
import { tenantForHr } from './invitation-service.js';

export interface HrSettingsView {
  timezone: string;
  channels: { email: boolean; inApp: boolean };
  defaultProgramStatus: 'draft' | 'active';
  updatedAt: string;
}
export interface HrSettingsPatch {
  timezone?: string;
  channels?: Partial<HrSettingsView['channels']>;
  defaultProgramStatus?: HrSettingsView['defaultProgramStatus'];
}

export interface HrSettingsRepository {
  getSettings(tenantId: string): Promise<HrSettingsView | null>;
  updateSettings(tenantId: string, actorUserId: string, patch: HrSettingsPatch): Promise<HrSettingsView>;
}

const DEFAULT_SETTINGS: Omit<HrSettingsView, 'updatedAt'> = { timezone: 'UTC', channels: { email: true, inApp: true }, defaultProgramStatus: 'draft' };

function validTimezone(value: string): string {
  const timezone = value.trim();
  if (!timezone || timezone.length > 80) throw new ApiError(400, 'VALIDATION_ERROR', 'The timezone is invalid.');
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); } catch { throw new ApiError(400, 'VALIDATION_ERROR', 'The timezone is invalid.'); }
  return timezone;
}

export function makeHrSettingsService({ repository, now = () => new Date() }: { repository: HrSettingsRepository; now?: () => Date }) {
  return {
    async getHrSettings(identity: IdentityContext): Promise<HrSettingsView> {
      const { tenantId } = tenantForHr(identity);
      return await repository.getSettings(tenantId) ?? { ...DEFAULT_SETTINGS, channels: { ...DEFAULT_SETTINGS.channels }, updatedAt: now().toISOString() };
    },

    async updateHrSettings(identity: IdentityContext, patch: HrSettingsPatch): Promise<HrSettingsView> {
      const { tenantId, userId } = tenantForHr(identity);
      const current = await repository.getSettings(tenantId) ?? { ...DEFAULT_SETTINGS, channels: { ...DEFAULT_SETTINGS.channels }, updatedAt: now().toISOString() };
      const channels = { ...current.channels, ...(patch.channels ?? {}) };
      if (typeof channels.email !== 'boolean' || typeof channels.inApp !== 'boolean') throw new ApiError(400, 'VALIDATION_ERROR', 'Notification channels must be boolean.');
      const defaultProgramStatus = patch.defaultProgramStatus ?? current.defaultProgramStatus;
      if (defaultProgramStatus !== 'draft' && defaultProgramStatus !== 'active') throw new ApiError(400, 'VALIDATION_ERROR', 'The default program status is invalid.');
      return repository.updateSettings(tenantId, userId, { timezone: validTimezone(patch.timezone ?? current.timezone), channels, defaultProgramStatus });
    },
  };
}

export type HrSettingsService = ReturnType<typeof makeHrSettingsService>;
