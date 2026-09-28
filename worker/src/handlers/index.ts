import type { EventHandler } from '../outbox-loop.js';

const PLATFORM_EVENT_TYPES = [
  'TenantCreated',
  'EmployeeInvitationCreated',
  'EmployeeInvitationResent',
  'EmployeeInvitationRevoked',
  'RelocationCaseActivated',
  'ChecklistProgressChanged',
  'ChecklistItemCompleted',
  'ProviderRequestSubmitted',
  'ReferralAccepted',
  'ProgramActivated',
] as const;

const acknowledge: EventHandler = async () => undefined;

/**
 * Register every event emitted by the current platform schema. The default
 * acknowledgement keeps the queue healthy while optional side-effect
 * handlers are supplied through overrides as integrations are enabled.
 */
export function createHandlers(overrides: Record<string, EventHandler> = {}): Record<string, EventHandler> {
  return { ...Object.fromEntries(PLATFORM_EVENT_TYPES.map((type) => [type, acknowledge])), ...overrides };
}
