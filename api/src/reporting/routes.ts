import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { IdentityContext } from '../identity/types.js';
import { makeAuthorizationHooks, type AuthorizationDependencies } from '../authorization/require-auth.js';
import { requireRole } from '../authorization/require-role.js';
import { ApiError } from '../shared/errors.js';
import { parseIdempotencyKey } from '../shared/validation.js';
import { createSupabaseReportRepositoryFromEnv } from './supabase-repository.js';
import { makeReportService, type ReportRepository } from './report-service.js';
export interface ReportingRouteDependencies extends AuthorizationDependencies { reportRepository?: ReportRepository; createReportRepository?: (accessToken: string) => ReportRepository; }
function identityForRequest(request: FastifyRequest): IdentityContext { const context = request.relo; if (!context) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.'); return context.membership ? { ...context.identity, memberships: [context.membership] } : context.identity; }
function token(request: FastifyRequest): string { const value = request.headers.authorization; return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7).trim() : ''; }
function repositoryForRequest(deps: ReportingRouteDependencies, request: FastifyRequest): ReportRepository { if (deps.reportRepository) return deps.reportRepository; try { return (deps.createReportRepository ?? createSupabaseReportRepositoryFromEnv)(token(request)); } catch { throw new ApiError(503, 'REPORT_DATA_UNAVAILABLE', 'Reporting data is unavailable.'); } }
function dates(query: unknown) { const parsed = z.object({ from: z.string().datetime(), to: z.string().datetime() }).safeParse(query); if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'A valid from and to date are required.'); return { from: new Date(parsed.data.from), to: new Date(parsed.data.to) }; }
export function registerReportingRoutes(app: FastifyInstance, deps: ReportingRouteDependencies = {}): void {
  const hooks = makeAuthorizationHooks({ authService: deps.authService, createSupabasePort: deps.createSupabasePort }); const role = requireRole('hr', 'admin', 'platform_admin');
  app.get('/api/v1/hr/reports/aarrr', { preHandler: [hooks.requireAuth, role] }, async (request) => ({ report: await makeReportService({ repository: repositoryForRequest(deps, request) }).getAaarrrReport(identityForRequest(request), dates(request.query)) }));
  app.get('/api/v1/hr/reports/progress', { preHandler: [hooks.requireAuth, role] }, async (request) => ({ report: await makeReportService({ repository: repositoryForRequest(deps, request) }).getAaarrrReport(identityForRequest(request), dates(request.query)) }));
  app.post('/api/v1/hr/reports/exports', { preHandler: [hooks.requireAuth, role] }, async (request) => { const input = dates((request.body as Record<string, unknown> | null) ?? {}); const job = await makeReportService({ repository: repositoryForRequest(deps, request) }).requestReportExport(identityForRequest(request), input, parseIdempotencyKey(request.headers['idempotency-key'])); return { export: job }; });
}
