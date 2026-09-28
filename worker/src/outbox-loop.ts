import type { DomainEvent } from '@relo/contracts/events';

export interface OutboxEvent extends DomainEvent<Record<string, unknown>> { attempts?: number; leaseOwner?: string | null; leaseUntil?: string | null; }
export interface OutboxRepository {
  claimBatch(workerId: string, limit: number): Promise<OutboxEvent[]>;
  complete(eventId: string, workerId: string): Promise<void>;
  fail(eventId: string, workerId: string, error: string): Promise<void>;
}
export type EventHandler = (event: OutboxEvent) => Promise<void>;
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_POLL_MS = 1_000;
export async function runOneBatch(repository: OutboxRepository, handlers: Record<string, EventHandler>, workerId: string, limit = DEFAULT_BATCH_SIZE): Promise<void> {
  const events = await repository.claimBatch(workerId, limit);
  for (const event of events) {
    try { const handler = handlers[event.type]; if (!handler) throw new Error(`UNKNOWN_EVENT:${event.type}`); await handler(event); await repository.complete(event.id, workerId); }
    catch (error) { await repository.fail(event.id, workerId, error instanceof Error ? error.message : 'Unknown event failure'); }
  }
}
export async function runOutboxLoop(repository: OutboxRepository, handlers: Record<string, EventHandler>, workerId: string, signal: AbortSignal, options: { pollMs?: number; batchSize?: number } = {}): Promise<void> {
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  while (!signal.aborted) { await runOneBatch(repository, handlers, workerId, options.batchSize ?? DEFAULT_BATCH_SIZE); if (signal.aborted) break; await new Promise<void>((resolve) => { const timer = setTimeout(resolve, pollMs); signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true }); }); }
}
