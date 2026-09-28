import test from 'node:test';
import assert from 'node:assert/strict';
import { isAdminRole, normalizeAdminEventQuery, toAdminEventView } from './admin-events.js';

test('only the admin role can access platform events', () => {
  assert.equal(isAdminRole('admin'), true);
  assert.equal(isAdminRole('hr'), false);
  assert.equal(isAdminRole('employee'), false);
});

test('admin event filters have bounded defaults', () => {
  assert.deepEqual(normalizeAdminEventQuery(new URLSearchParams()), {
    severity: null,
    category: null,
    limit: 50
  });
  assert.deepEqual(normalizeAdminEventQuery(new URLSearchParams('severity=critical&category=auth&limit=500')), {
    severity: 'critical',
    category: 'auth',
    limit: 100
  });
});

test('admin event view removes internal fields and exposes a stable shape', () => {
  assert.deepEqual(toAdminEventView({
    id: 'evt-1',
    category: 'auth',
    event_name: 'otp_requested',
    severity: 'info',
    summary: 'OTP requested',
    organization_id: null,
    actor_id: 'user-1',
    occurred_at: '2026-09-28T08:00:00.000Z',
    properties: { email: 'redacted@example.com' },
    internal_trace: 'do-not-return'
  }), {
    id: 'evt-1',
    category: 'auth',
    eventName: 'otp_requested',
    severity: 'info',
    summary: 'OTP requested',
    organizationId: null,
    actorId: 'user-1',
    occurredAt: '2026-09-28T08:00:00.000Z',
    properties: { email: 'redacted@example.com' }
  });
});
