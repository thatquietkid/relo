import { describe, expect, it, vi } from 'vitest';
import { makeNotificationHandler, type DedupeStore } from '../src/handlers/notification-handler.js';
import { makeGrowthProjectionHandler } from '../src/handlers/growth-projection-handler.js';
import { createHandlers } from '../src/handlers/index.js';

class MemoryDedupe implements DedupeStore { keys = new Set<string>(); async hasOrInsert(key: string) { const exists = this.keys.has(key); this.keys.add(key); return exists; } }
describe('worker handlers', () => {
  it('sends one notification for duplicate deliveries', async () => {
    const mailer = { send: vi.fn().mockResolvedValue(undefined) }; const handler = makeNotificationHandler({ dedupe: new MemoryDedupe(), mailer });
    const event = { id: 'evt-1', type: 'EmployeeInvited', version: 1, occurredAt: '2026-09-29T00:00:00.000Z', tenantId: 'tenant-a', actorId: 'user-a', traceId: 'trace', payload: { email: 'person@example.com', subject: 'Welcome', body: 'Welcome to Relo' } };
    await handler(event); await handler(event); expect(mailer.send).toHaveBeenCalledTimes(1);
  });
  it('upserts a daily projection from a growth event', async () => {
    const metrics = { upsert: vi.fn().mockResolvedValue(undefined) }; const handler = makeGrowthProjectionHandler({ metrics });
    await handler({ id: 'evt-1', type: 'RelocationCaseActivated', version: 1, occurredAt: '2026-09-29T04:00:00.000Z', tenantId: 'tenant-a', actorId: 'user-a', traceId: 'trace', payload: {} });
    expect(metrics.upsert).toHaveBeenCalledWith(expect.objectContaining({ metricKey: 'activation' }));
  });
  it('registers safe acknowledgers for the platform event types', async () => {
    const handlers = createHandlers();
    for (const type of ['EmployeeInvitationCreated', 'EmployeeInvitationResent', 'EmployeeInvitationRevoked', 'RelocationCaseActivated', 'ChecklistProgressChanged', 'ChecklistItemCompleted', 'ProviderRequestSubmitted', 'ReferralAccepted', 'ProgramActivated', 'TenantCreated']) {
      expect(handlers[type]).toBeTypeOf('function');
      await handlers[type]({ id: 'evt-1', type, version: 1, occurredAt: '2026-09-29T00:00:00.000Z', tenantId: 'tenant-a', actorId: 'user-a', traceId: 'trace', payload: {} });
    }
  });
});
