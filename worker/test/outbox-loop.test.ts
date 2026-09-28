import { describe, expect, it, vi } from 'vitest';
import { runOneBatch, type OutboxEvent, type OutboxRepository } from '../src/outbox-loop.js';

function event(overrides: Partial<OutboxEvent> = {}): OutboxEvent { return { id: 'evt-1', type: 'InvitationCreated', version: 1, occurredAt: '2026-09-29T00:00:00.000Z', tenantId: 'tenant-a', actorId: 'user-a', traceId: 'trace-1', payload: {}, attempts: 0, ...overrides }; }
class FakeRepository implements OutboxRepository {
  source: OutboxEvent[]; claimed: string[] = []; completed: string[] = []; failed: string[] = [];
  constructor(source: OutboxEvent[]) { this.source = source; }
  async claimBatch() { const available = this.source.filter((item) => !item.leaseOwner || !item.leaseUntil || new Date(item.leaseUntil) <= new Date()); this.claimed.push(...available.map((item) => item.id)); return available; }
  async complete(id: string) { this.completed.push(id); }
  async fail(id: string) { this.failed.push(id); }
}

describe('outbox loop', () => {
  it('claims a pending event and marks it complete after a successful handler', async () => {
    const repository = new FakeRepository([event()]); const handler = vi.fn().mockResolvedValue(undefined);
    await runOneBatch(repository, { InvitationCreated: handler }, 'worker-a');
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'evt-1' })); expect(repository.completed).toContain('evt-1');
  });
  it('does not claim an event leased by another worker', async () => {
    const repository = new FakeRepository([event({ id: 'evt-2', leaseOwner: 'worker-b', leaseUntil: '2999-01-01T00:00:00.000Z' })]);
    await runOneBatch(repository, {}, 'worker-a'); expect(repository.claimed).toHaveLength(0);
  });
  it('records a failure for unknown events and handler errors', async () => {
    const repository = new FakeRepository([event(), event({ id: 'evt-2', type: 'Known' })]);
    await runOneBatch(repository, { Known: vi.fn().mockRejectedValue(new Error('temporary')) }, 'worker-a');
    expect(repository.failed).toEqual(['evt-1', 'evt-2']);
  });
});
