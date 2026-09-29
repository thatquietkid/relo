import type { IdentityContext } from '../identity/types.js';
import { tenantForHr } from '../hr/invitation-service.js';
import { ApiError } from '../shared/errors.js';
import { AARRR_METRICS, type AaarrrMetricKey } from './metric-definitions.js';

export interface GrowthEvent { tenantId: string; type: string; occurredAt: string; aggregateId?: string; actorUserId?: string; payload?: Record<string, unknown>; }
export interface MetricValue { key: AaarrrMetricKey; label: string; numerator: number; denominator: number; rate: number; status: 'ok' | 'no_data'; sourceEvents: string[]; demoData: boolean; }
export interface AaarrrReport { from: string; to: string; generatedAt: string; metrics: Record<AaarrrMetricKey, MetricValue>; acquisition: MetricValue; activation: MetricValue; retention: MetricValue; referral: MetricValue; revenue: MetricValue; }
export interface ExportJobView { id: string; status: 'queued' | 'running' | 'completed' | 'failed'; requestedAt: string; }
export interface ReportRepository { listEvents(tenantId: string, input: { from: string; to: string }): Promise<GrowthEvent[]>; createExport(input: { tenantId: string; actorUserId: string; from: string; to: string; idempotencyKey: string }): Promise<ExportJobView>; findExport?(tenantId: string, actorUserId: string, idempotencyKey: string): Promise<ExportJobView | null>; }
function safeDate(value: Date, label: string): string { if (Number.isNaN(value.getTime())) throw new ApiError(400, 'VALIDATION_ERROR', `${label} must be a valid date.`); return value.toISOString(); }
function count(events: GrowthEvent[], type: string): number { return new Set(events.filter((event) => event.type === type).map((event) => event.aggregateId ?? event.actorUserId ?? `${event.type}:${event.occurredAt}`)).size; }
export function makeReportService({ repository, now = () => new Date() }: { repository: ReportRepository; now?: () => Date }) {
  return {
    async getAaarrrReport(identity: IdentityContext, input: { from: Date; to: Date }): Promise<AaarrrReport> {
      const { tenantId } = tenantForHr(identity); const from = safeDate(input.from, 'Report start'); const to = safeDate(input.to, 'Report end');
      if (input.to <= input.from) throw new ApiError(400, 'VALIDATION_ERROR', 'Report end must be after report start.');
      const events = await repository.listEvents(tenantId, { from, to });
      const metrics = Object.fromEntries(Object.entries(AARRR_METRICS).map(([key, definition]) => { const denominator = count(events, definition.denominator); const numerator = count(events, definition.numerator); const demoData = events.some((event) => definition.sourceEvents.includes(event.type) && event.payload?.demo_seed === true); return [key, { key, label: definition.label, numerator, denominator, rate: denominator ? Math.min(1, numerator / denominator) : 0, status: denominator ? 'ok' : 'no_data', sourceEvents: definition.sourceEvents, demoData }]; })) as Record<AaarrrMetricKey, MetricValue>;
      return { from, to, generatedAt: now().toISOString(), metrics, ...metrics };
    },
    async requestReportExport(identity: IdentityContext, input: { from: Date; to: Date }, idempotencyKey: string): Promise<ExportJobView> {
      const { tenantId, userId } = tenantForHr(identity); if (!/^[\x21-\x7e]{8,128}$/.test(idempotencyKey)) throw new ApiError(400, 'VALIDATION_ERROR', 'A valid idempotency key is required.');
      const from = safeDate(input.from, 'Report start'); const to = safeDate(input.to, 'Report end'); if (input.to <= input.from) throw new ApiError(400, 'VALIDATION_ERROR', 'Report end must be after report start.');
      const existing = await repository.findExport?.(tenantId, userId, idempotencyKey); if (existing) return existing;
      return repository.createExport({ tenantId, actorUserId: userId, from, to, idempotencyKey });
    },
  };
}
export type ReportService = ReturnType<typeof makeReportService>;
