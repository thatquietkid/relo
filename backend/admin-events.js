const allowedSeverities = new Set(['info', 'warning', 'critical']);
const allowedCategories = new Set(['auth', 'relocation', 'content', 'growth', 'system']);

export function isAdminRole(role) {
  return role === 'admin';
}

export function normalizeAdminEventQuery(params) {
  const severity = allowedSeverities.has(params.get('severity')) ? params.get('severity') : null;
  const category = allowedCategories.has(params.get('category')) ? params.get('category') : null;
  const requestedLimit = Number.parseInt(params.get('limit') || '50', 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
  return { severity, category, limit };
}

export function toAdminEventView(event) {
  return {
    id: event.id,
    category: event.category,
    eventName: event.event_name,
    severity: event.severity,
    summary: event.summary,
    organizationId: event.organization_id,
    actorId: event.actor_id,
    occurredAt: event.occurred_at,
    properties: event.properties || {}
  };
}
