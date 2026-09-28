import type { OutboxEvent } from '../outbox-loop.js';
export interface DedupeStore { hasOrInsert(key: string): Promise<boolean>; }
export interface Mailer { send(input: { to: string; subject: string; body: string }): Promise<void>; }
export function makeNotificationHandler({ dedupe, mailer }: { dedupe: DedupeStore; mailer: Mailer }) {
  return async (event: OutboxEvent): Promise<void> => {
    const payload = event.payload as { email?: string; subject?: string; body?: string };
    if (!payload.email) return;
    if (await dedupe.hasOrInsert(`notification:${event.id}`)) return;
    await mailer.send({ to: payload.email, subject: payload.subject ?? 'Relo update', body: payload.body ?? 'You have a new Relo update.' });
  };
}
