export interface DomainEvent<T> {
  id: string;
  type: string;
  version: number;
  occurredAt: string;
  tenantId: string | null;
  actorId: string | null;
  traceId: string;
  payload: T;
}
