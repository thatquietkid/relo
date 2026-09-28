import { describe, expect, it } from 'vitest';
import { createEmployeeFixtures } from './fixtures/employee-fixtures.js';

describe('employee fixtures', () => {
  it('builds deterministic, secret-free cross-tenant employee data', () => {
    const first = createEmployeeFixtures();
    const second = createEmployeeFixtures();

    expect(first).toEqual(second);
    expect(first.employees).toHaveLength(2);
    expect(first.employees[0].tenant_id).not.toBe(first.employees[1].tenant_id);
    expect(first.city.id).toBe('00000000-0000-0000-0000-000000007001');
    expect(first.provider.id).toBe('00000000-0000-0000-0000-000000007002');
    expect(first.publishedDirectoryEntry.status).toBe('published');
    expect(first.expiredDirectoryEntry.expires_at).toBe('2026-09-01T00:00:00.000Z');
    expect(first.activeProviderRequest.status).toBe('submitted');
    expect(first.unreadNotification.read_at).toBeNull();
    expect(JSON.stringify(first)).not.toMatch(/secret|token|password|credential/i);
  });
});
