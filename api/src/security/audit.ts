const sensitive = /authorization|token|otp|password|secret|cookie|key/i;
export function redact(value: unknown): unknown { if (Array.isArray(value)) return value.map(redact); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, sensitive.test(key) ? '[REDACTED]' : redact(entry)])); }
export interface AuditSink { write(entry: { actorId: string | null; action: string; target: string; metadata: unknown; requestId?: string }): Promise<void>; }
export function makeAudit(sink: AuditSink) { return (actorId: string | null, action: string, target: string, metadata: unknown, requestId?: string) => sink.write({ actorId, action, target, metadata: redact(metadata), requestId }); }
