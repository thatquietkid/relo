# Relo Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the platform safe to operate in production with reliable background processing, observability, security controls, accessible user flows, automated browser coverage, and Render deployment verification.

**Architecture:** The worker polls a transactional outbox with row locks, dispatches typed handlers, records attempts, and uses dedupe keys for side effects. The API and web service expose health signals and structured redacted logs. Security checks, browser tests, and deployment checks run in CI before a Render deploy is considered healthy.

**Tech Stack:** TypeScript, Fastify, Supabase PostgreSQL, React, Vitest, Playwright, Docker, Render, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-28-relo-full-platform-design.md`

## Global Constraints

- Worker handlers are idempotent and retry with bounded exponential backoff.
- Outbox rows are locked with `FOR UPDATE SKIP LOCKED` and have a lease timeout.
- Notification, report export, and projection side effects include a durable dedupe key.
- Logs are JSON, structured, correlation-aware, and redact tokens, emails where not needed, secrets, and request bodies.
- Production uses HTTPS, strict CORS, CSP, secure cookies where applicable, and rate limits for auth and mutation endpoints.
- Admin and security actions are audited with actor, tenant, target, before state, after state, and request ID.
- Health checks distinguish process health from dependency readiness.
- CI must run tests, type checks, build checks, migration checks, accessibility smoke tests, and Docker build checks.

## Review Focus

- A worker crash after an email send but before marking the event complete must not send the email twice.
- An outbox row stuck under a dead worker lease must become claimable after the lease timeout.
- A readiness check must fail when Supabase is unreachable while `/healthz` remains a simple process check.
- A CSP or CORS configuration must allow the deployed web origin and Supabase auth while blocking arbitrary origins.
- An accessibility or browser failure must block deployment rather than being recorded only in logs.

---

### Task 1: Outbox repository and worker loop

**Files:**
- Create: `supabase/migrations/20260928140000_outbox.sql`
- Create: `api/src/events/event-types.ts`
- Create: `api/src/events/outbox-repository.ts`
- Create: `worker/src/worker.ts`
- Create: `worker/src/outbox-loop.ts`
- Create: `worker/src/handlers/index.ts`
- Create: `worker/test/outbox-loop.test.ts`

**Interfaces:**
- `appendOutboxEvent(tx, event): Promise<OutboxEvent>`.
- `claimOutboxBatch(workerId, limit): Promise<OutboxEvent[]>`.
- `completeOutboxEvent(eventId, workerId): Promise<void>`.
- `failOutboxEvent(eventId, workerId, error): Promise<void>`.
- `runOutboxLoop(signal): Promise<void>`.
- `EventHandler<E extends DomainEvent> = (event: E) => Promise<void>`.

- [ ] **Step 1: Write failing worker tests**

```ts
it('claims a pending event and marks it complete after a successful handler', async () => {
  const repository = fakeOutbox([{ id: 'evt-1', type: 'InvitationCreated' }]);
  const handler = vi.fn().mockResolvedValue(undefined);
  await runOneBatch(repository, { InvitationCreated: handler }, 'worker-a');
  expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'evt-1' }));
  expect(repository.completed).toContain('evt-1');
});

it('does not claim an event leased by another worker', async () => {
  const repository = fakeOutbox([{ id: 'evt-2', leaseOwner: 'worker-b', leaseUntil: futureDate() }]);
  await runOneBatch(repository, {}, 'worker-a');
  expect(repository.claimed).toHaveLength(0);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run worker/test/outbox-loop.test.ts`

Expected: FAIL because the outbox repository and loop are absent.

- [ ] **Step 3: Implement schema, leasing, dispatch, retries, and graceful shutdown**

Use a lease duration of five minutes, a batch limit of 25, maximum five attempts, and backoff delays of 30 seconds, 2 minutes, 10 minutes, 30 minutes, and 2 hours. Mark permanently failed rows for admin inspection instead of silently deleting them.

- [ ] **Step 4: Run focused worker tests**

Run: `npm test -- --run worker/test/outbox-loop.test.ts`

Expected: PASS, including retry, lease expiry, unknown event, and shutdown cases.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260928140000_outbox.sql api/src/events worker
git commit -m "feat: add transactional outbox worker"
```

### Task 2: Notification, projection, and export handlers

**Files:**
- Create: `worker/src/handlers/notification-handler.ts`
- Create: `worker/src/handlers/growth-projection-handler.ts`
- Create: `worker/src/handlers/report-export-handler.ts`
- Create: `worker/test/handlers.test.ts`
- Modify: `worker/src/handlers/index.ts`

**Interfaces:**
- `handleNotificationEvent(event: NotificationEvent): Promise<void>`.
- `handleGrowthEvent(event: GrowthEvent): Promise<void>`.
- `handleReportExportEvent(event: ReportExportEvent): Promise<void>`.
- `DedupeStore.hasOrInsert(key): Promise<boolean>` returns `true` when the effect was already applied.

- [ ] **Step 1: Write failing handler tests**

```ts
it('sends one email when the same notification event is delivered twice', async () => {
  await handler(event);
  await handler(event);
  expect(mailer.send).toHaveBeenCalledTimes(1);
});

it('rebuilds a daily activation projection from source events', async () => {
  await handleGrowthEvent(growthEvent);
  expect(metrics.upsert).toHaveBeenCalledWith(expect.objectContaining({ metricKey: 'activation' }));
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run worker/test/handlers.test.ts`

Expected: FAIL because handlers are absent.

- [ ] **Step 3: Implement deduped handlers**

Send email through the configured SMTP provider only after the dedupe key is reserved, write in-app notifications for every user-visible event, update rebuildable daily metric rows, and store export files through the configured private storage path with a bounded retention policy.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run worker/test/handlers.test.ts`

Expected: PASS, including provider failure, retry, dedupe, and projection rebuild cases.

- [ ] **Step 5: Commit**

```bash
git add worker/src/handlers worker/test/handlers.test.ts
git commit -m "feat: process notifications metrics and exports"
```

### Task 3: API security middleware and audit coverage

**Files:**
- Create: `api/src/security/rate-limit.ts`
- Create: `api/src/security/cors.ts`
- Create: `api/src/security/headers.ts`
- Create: `api/src/security/audit.ts`
- Create: `api/test/security.test.ts`
- Modify: `api/src/app.ts`
- Modify: `web/index.html`

**Interfaces:**
- `rateLimit({ key, limit, windowMs }): PreHandler`.
- `audit(actor, action, target, metadata): Promise<void>`.
- `securityHeaders(env): Record<string, string>`.
- `allowedOrigin(origin): boolean`.

- [ ] **Step 1: Write failing security tests**

```ts
it('rejects an unconfigured CORS origin', () => {
  expect(allowedOrigin('https://evil.example')).toBe(false);
});

it('redacts bearer tokens and OTP values from audit metadata', async () => {
  await audit(actor, 'auth.verify', 'session', { authorization: 'Bearer secret', otp: '123456' });
  expect(auditStore.last.metadata).toEqual({ authorization: '[REDACTED]', otp: '[REDACTED]' });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run api/test/security.test.ts`

Expected: FAIL because security helpers are absent.

- [ ] **Step 3: Implement rate limits, CORS, headers, and redacted audit logging**

Apply stricter limits to OTP, invitation resend, provider requests, exports, and admin mutations. Emit CSP, `X-Content-Type-Options`, `Referrer-Policy`, and frame protection headers. Allow only the configured web origin and Supabase origin.

- [ ] **Step 4: Run focused security tests**

Run: `npm test -- --run api/test/security.test.ts`

Expected: PASS, including origin, rate limit, redaction, and header cases.

- [ ] **Step 5: Commit**

```bash
git add api/src/security api/test/security.test.ts api/src/app.ts web/index.html
git commit -m "feat: harden API security and audit logging"
```

### Task 4: Health, readiness, logs, and operational signals

**Files:**
- Create: `api/src/observability/logger.ts`
- Create: `api/src/observability/health.ts`
- Create: `worker/src/observability.ts`
- Create: `api/test/health.test.ts`
- Modify: `api/src/app.ts`
- Modify: `api/src/server.ts`
- Modify: `worker/src/worker.ts`

**Interfaces:**
- `GET /healthz` returns `{ status: 'ok' }` when the process is alive.
- `GET /readyz` returns `{ status: 'ready', dependencies: { database: 'ok' } }` only when configured dependencies respond.
- `createLogger(requestId): Logger` writes JSON with redaction.

- [ ] **Step 1: Write failing health tests**

```ts
it('keeps liveness healthy while readiness reports a database outage', async () => {
  const app = await createApp({ database: failingDatabase(), logger: false });
  expect((await app.inject('/healthz')).statusCode).toBe(200);
  expect((await app.inject('/readyz')).statusCode).toBe(503);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run api/test/health.test.ts`

Expected: FAIL because readiness and structured logger are absent.

- [ ] **Step 3: Implement health checks and JSON logs**

Probe Supabase with a bounded timeout, report dependency names without secrets, include request IDs in logs and responses, and shut down the server and worker within 10 seconds after `SIGTERM`.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run api/test/health.test.ts`; `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/observability api/test/health.test.ts api/src/app.ts api/src/server.ts worker/src
git commit -m "feat: add readiness and structured operational signals"
```

### Task 5: Browser, accessibility, and security regression suite

**Files:**
- Create: `web/e2e/auth.spec.ts`
- Create: `web/e2e/employee.spec.ts`
- Create: `web/e2e/hr.spec.ts`
- Create: `web/e2e/admin.spec.ts`
- Create: `web/e2e/oauth-consent.spec.ts`
- Create: `web/e2e/settings.spec.ts`
- Create: `web/playwright.config.ts`
- Create: `web/test/accessibility.test.tsx`
- Create: `.github/workflows/ci.yml`
- Create: `docs/relo/qa.md`

**Interfaces:**
- Playwright fixtures can seed a test tenant and create identities with employee, HR, reviewer, and admin roles without using production secrets.
- E2E tests run against a local web and API pair with Supabase test configuration.

- [ ] **Step 1: Write failing browser and accessibility tests**

```ts
test('employee cannot open HR dashboard', async ({ page }) => {
  await loginAs(page, 'employee');
  await page.goto('/hr');
  await expect(page.getByRole('heading', { name: /not authorized/i })).toBeVisible();
});

test('login form has no unlabeled controls', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveNoViolations();
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `npm run test:e2e -- --project=chromium`

Expected: FAIL because the fixtures and route assertions are absent.

- [ ] **Step 3: Implement deterministic fixtures and regression coverage**

Cover OTP request and verification, Google redirect initiation, invitation acceptance, employee checklist and request, HR invitation and report, reviewer publish, admin event and setting access, OAuth consent approve and deny, mobile navigation, settings saves, logout, and forbidden routes. Add axe checks to each primary role surface.

- [ ] **Step 4: Run browser and accessibility checks**

Run: `npm run test:e2e`; `npm test -- --run web/test/accessibility.test.tsx`

Expected: PASS with no critical accessibility violations, console errors, or unexpected network failures.

- [ ] **Step 5: Commit**

```bash
git add web/e2e web/playwright.config.ts web/test/accessibility.test.ts .github/workflows/ci.yml docs/relo/qa.md
git commit -m "test: add platform browser and accessibility coverage"
```

### Task 6: Render deployment and production verification

**Files:**
- Modify: `render.yaml`
- Modify: `web/Dockerfile`
- Modify: `api/Dockerfile`
- Modify: `worker/Dockerfile`
- Create: `scripts/verify-deployment.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/relo/deployment.md`

**Interfaces:**
- `node scripts/verify-deployment.mjs --web URL --api URL` checks web HTML, API liveness, API readiness, security headers, gzip, and the authenticated route boundary.

- [ ] **Step 1: Write failing deployment verification tests**

```ts
it('fails verification when API readiness is unavailable', async () => {
  await expect(verifyDeployment({ webUrl: 'http://web', apiUrl: 'http://api-down' }))
    .rejects.toThrow('API readiness failed');
});
```

- [ ] **Step 2: Run verification and verify failure**

Run: `npm test -- --run scripts/verify-deployment.test.ts`

Expected: FAIL because the verifier is absent.

- [ ] **Step 3: Implement deployment checks and Render configuration**

Define web, API, and worker services with health paths, environment groups, private worker networking, auto-deploy from the intended branch, and no secret files. Configure compression at the web boundary and verify `Content-Encoding` for compressible responses.

- [ ] **Step 4: Run the complete release checks**

Run: `npm test`; `npm run typecheck`; `npm run build`; `npm run test:e2e`; `docker build -f web/Dockerfile .`; `docker build -f api/Dockerfile .`; `docker build -f worker/Dockerfile .`; `node scripts/verify-deployment.mjs --web "$RELO_WEB_URL" --api "$RELO_API_URL"`

Expected: all checks pass and the deployed web, API, and worker report healthy status.

- [ ] **Step 5: Commit**

```bash
git add render.yaml web/Dockerfile api/Dockerfile worker/Dockerfile scripts .github/workflows/ci.yml docs/relo/deployment.md
git commit -m "chore: verify production deployment"
```

## Production completion gate

- [ ] Failed worker deliveries retry, dedupe, and remain inspectable.
- [ ] Liveness, readiness, logs, audit records, and security events are available to operators.
- [ ] Auth, role, tenant, consent, settings, and OAuth paths have browser coverage.
- [ ] The platform passes keyboard and accessibility smoke checks on mobile and desktop sizes.
- [ ] Docker images are non-root, compressed at the web edge, secret-free, and health checked.
- [ ] Render deployment verification passes against the live services.
