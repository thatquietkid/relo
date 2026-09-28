import { describe, expect, it } from 'vitest';
import type { IdentityContext } from '../src/identity/types.js';
import type { MembershipView } from '../src/tenancy/types.js';
import { makeReportService, type GrowthEvent, type ReportRepository } from '../src/reporting/report-service.js';

const membership: MembershipView = {
  id: 'membership-hr', tenant_id: 'tenant-a', user_id: 'hr-a', status: 'active', joined_at: '2026-09-01T00:00:00.000Z', suspended_at: null,
  tenant: { id: 'tenant-a', name: 'Acme', slug: 'acme', status: 'active' }, roles: [{ id: 'role-hr', key: 'hr' }],
};
const hr: IdentityContext = { user: { id: 'hr-a', email: 'hr@example.com' }, memberships: [membership] };

class InMemoryReportRepository implements ReportRepository {
  events: GrowthEvent[] = [];
  exports: string[] = [];
  async listEvents() { return this.events; }
  async createExport(input: Parameters<ReportRepository['createExport']>[0]) { this.exports.push(input.idempotencyKey); return { id: 'export-1', status: 'queued' as const, requestedAt: '2026-09-29T00:00:00.000Z' }; }
  async findExport() { return null; }
}

describe('AARRR reporting', () => {
  it('returns truthful no-data activation instead of a fabricated rate', async () => {
    const service = makeReportService({ repository: new InMemoryReportRepository() });
    const report = await service.getAaarrrReport(hr, { from: new Date('2026-09-01'), to: new Date('2026-09-30') });
    expect(report.activation).toMatchObject({ numerator: 0, denominator: 0, rate: 0, status: 'no_data' });
  });

  it('calculates activation and queues a bounded export for the tenant', async () => {
    const repo = new InMemoryReportRepository();
    repo.events = [
      { tenantId: 'tenant-a', type: 'EmployeeInvited', occurredAt: '2026-09-10T00:00:00.000Z' },
      { tenantId: 'tenant-a', type: 'RelocationCaseActivated', occurredAt: '2026-09-11T00:00:00.000Z' },
    ];
    const service = makeReportService({ repository: repo });
    const report = await service.getAaarrrReport(hr, { from: new Date('2026-09-01'), to: new Date('2026-09-30') });
    expect(report.activation).toMatchObject({ numerator: 1, denominator: 1, rate: 1, status: 'ok' });
    const job = await service.requestReportExport(hr, { from: new Date('2026-09-01'), to: new Date('2026-09-30') }, 'export-0001');
    expect(job.status).toBe('queued');
  });
});
