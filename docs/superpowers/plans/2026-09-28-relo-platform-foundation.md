# Relo Foundation and Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the prototype's implicit state and ad hoc HTTP handlers with typed web, API, worker, contract, and database foundations that enforce authenticated tenant access.

**Architecture:** Keep the current Render topology of one web service and one backend service, then add a worker service behind the same repository. The API is a modular Fastify service with `identity`, `tenancy`, `authorization`, `operations`, and `shared` modules. Supabase owns authentication and PostgreSQL owns durable business state, with RLS as the database boundary and API authorization as the application boundary.

**Tech Stack:** Node 22, TypeScript, React, Vite, Fastify, Zod, `@supabase/supabase-js`, Vitest, Playwright, Docker, Render.

**Spec:** `docs/superpowers/specs/2026-09-28-relo-full-platform-design.md`

## Global Constraints

- `relo-web`, `relo-api`, and `relo-worker` are separate process boundaries.
- The API accepts a Supabase bearer token and derives the user from Supabase Auth.
- OTP uses `signInWithOtp({ options: { shouldCreateUser: false } })`; portal self-registration stays disabled.
- Google OAuth uses Supabase's browser-safe provider flow and a configured redirect allowlist.
- Admin and HR roles are assigned outside public registration and are checked against active memberships.
- RLS policies use `auth.uid()` and membership scope. Service-role access is limited to worker or controlled provisioning code.
- No domain handler trusts `organization_id`, `role`, or user identity from a request body.
- Passwords, tokens, client secrets, and service keys never enter logs or source control.
- All API errors use a stable JSON error envelope and all request bodies are schema validated.

## Review Focus

- The invitation acceptance path must bind the authenticated user to the token's tenant and reject a token issued for another email.
- A deleted or suspended membership must be rejected even when the Supabase access token has not expired.
- A malformed bearer token, oversized JSON body, unsupported method, or unknown route must produce a bounded safe response.
- A refresh or double-click on OTP verification must not create duplicate membership or session records.
- A protected page loaded directly in a new browser tab must render an auth boundary before any dashboard data request.

---

### Task 1: Workspace and typed service skeleton

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/src/http.ts`
- Create: `packages/contracts/src/auth.ts`
- Create: `packages/contracts/src/events.ts`
- Create: `api/package.json`
- Create: `api/tsconfig.json`
- Create: `api/src/app.ts`
- Create: `api/src/server.ts`
- Create: `api/src/shared/config.ts`
- Create: `api/src/shared/errors.ts`
- Create: `api/test/app.test.ts`
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/src/main.tsx`
- Create: `worker/package.json`
- Create: `worker/src/main.ts`
- Test: `api/test/app.test.ts`

**Interfaces:**
- `createApp(): FastifyInstance` returns a testable API without binding a port.
- `ApiError` has `statusCode`, `code`, `message`, and optional `details`.
- `ApiErrorResponse` is `{ error: { code: string; message: string; requestId: string; details?: unknown } }`.
- `AuthUser` is `{ id: string; email: string | null }`.
- `DomainEvent<T>` is `{ id: string; type: string; version: number; occurredAt: string; tenantId: string | null; actorId: string | null; traceId: string; payload: T }`.

- [ ] **Step 1: Write the failing foundation test**

```ts
it('exposes a health response and stable error shape', async () => {
  const app = await createApp({ logger: false });
  const health = await app.inject({ method: 'GET', url: '/healthz' });
  expect(health.statusCode).toBe(200);
  expect(health.json()).toEqual({ status: 'ok' });
  const missing = await app.inject({ method: 'GET', url: '/not-a-route' });
  expect(missing.statusCode).toBe(404);
  expect(missing.json().error.code).toBe('NOT_FOUND');
  expect(missing.json().error.requestId).toEqual(expect.any(String));
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm install` then `npm test -- --run api/test/app.test.ts`

Expected: FAIL because the workspace packages and `createApp` do not exist.

- [ ] **Step 3: Implement the minimal typed workspace**

Use npm workspaces so all packages share one lockfile. The API should register `@fastify/sensible`, a request ID hook, `GET /healthz`, and a not-found handler that serializes `ApiErrorResponse`. Define the versioned `DomainEvent<T>` envelope in the contracts package so API and worker handlers share one type. The web package should boot a minimal React root with no dashboard data calls. The worker package should start and stop without doing domain work.

- [ ] **Step 4: Run the focused and type checks**

Run: `npm test -- --run api/test/app.test.ts` and `npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json packages api web worker
git commit -m "chore: create typed service workspace"
```

### Task 2: Shared request validation and API error handling

**Files:**
- Modify: `packages/contracts/src/http.ts`
- Create: `api/src/shared/http.ts`
- Create: `api/src/shared/validation.ts`
- Modify: `api/src/app.ts`
- Create: `api/test/http.test.ts`

**Interfaces:**
- `parseJsonBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T>` throws `ApiError` with code `VALIDATION_ERROR`.
- `sendError(reply, error)` writes the stable error envelope.
- `IdempotencyKey` is a non-empty string of 8 to 128 ASCII characters.

- [ ] **Step 1: Write failing tests for malformed input and idempotency headers**

```ts
it('rejects invalid JSON input with field details', () => {
  expect(() => parseJsonBody(z.object({ email: z.string().email() }), { email: 'bad' }))
    .toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
});

it('accepts only bounded idempotency keys', () => {
  expect(parseIdempotencyKey('invite-123')).toBe('invite-123');
  expect(() => parseIdempotencyKey('')).toThrow();
  expect(() => parseIdempotencyKey('x'.repeat(129))).toThrow();
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- --run api/test/http.test.ts`

Expected: FAIL because the validation helpers are absent.

- [ ] **Step 3: Implement schemas and error serialization**

Add Zod parsing, bounded body size, request ID propagation, `Idempotency-Key` parsing, and a Fastify error handler that never returns stack traces in production.

- [ ] **Step 4: Run the tests**

Run: `npm test -- --run api/test/http.test.ts api/test/app.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/http.ts api/src/shared api/src/app.ts api/test
git commit -m "feat: add typed API validation and errors"
```

### Task 3: Supabase identity and tenancy schema

**Files:**
- Create: `supabase/migrations/20260928100000_identity_tenancy.sql`
- Create: `supabase/tests/identity_tenancy.sql`
- Create: `api/src/identity/types.ts`
- Create: `api/src/tenancy/types.ts`

**Interfaces:**
- `tenants(id, name, slug, status, created_at, updated_at)` is the organization source of truth.
- `memberships(id, tenant_id, user_id, status, joined_at, suspended_at)` links Supabase users to tenants.
- `roles(id, key)` and `membership_roles(membership_id, role_id)` provide role assignment.
- `invitations(id, tenant_id, email, role_key, token_hash, status, expires_at, accepted_at, invited_by)` tracks controlled onboarding; authenticated reads use a safe projection that omits `token_hash`.
- `audit_logs(id, tenant_id, actor_user_id, action, resource_type, resource_id, metadata, created_at)` records security-sensitive changes.
- `idempotency_keys(tenant_id, actor_user_id, key, request_hash, response_status, response_body, created_at, expires_at)` stores replay results.
- Helper SQL functions `current_tenant_ids()` and tenant-scoped `has_role(uuid, text)` are `security definer` functions with a fixed `search_path`.

- [ ] **Step 1: Write the failing SQL assertions**

```sql
select has_table('public', 'tenants');
select has_table('public', 'memberships');
select has_table('public', 'invitations');
select ok((select relrowsecurity from pg_class where oid = 'public.memberships'::regclass), 'memberships has RLS enabled');
select policies_are('public', 'memberships', array['members can view same tenant memberships']);
```

- [ ] **Step 2: Run the SQL test before migration**

Run: `supabase db reset` followed by the SQL test runner used by the repository.

Expected: FAIL because the tables and policies are not present.

- [ ] **Step 3: Add tables, constraints, indexes, trigger helpers, and RLS**

Use unique constraints for `(tenant_id, lower(email), status)` where appropriate, hash invitation tokens before storing them, deny anonymous access, and allow users to read only active memberships that include their own user ID. Expose invitations through a security-invoker projection without `token_hash`; keep raw invitation storage access controlled. Allow authenticated users to read static role definitions, while role changes and membership-role writes remain server-side controlled operations.

- [ ] **Step 4: Run migration and SQL assertions**

Run: `supabase db reset` and `supabase test db`

Expected: PASS, including a cross-tenant denial test.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260928100000_identity_tenancy.sql supabase/tests/identity_tenancy.sql api/src/identity api/src/tenancy
git commit -m "feat: add tenant membership and invitation schema"
```

### Task 4: Auth service with OTP, Google, sessions, and invitation acceptance

**Files:**
- Create: `api/src/identity/supabase.ts`
- Create: `api/src/identity/auth-service.ts`
- Create: `api/src/identity/auth-routes.ts`
- Create: `api/src/identity/invitation-service.ts`
- Create: `supabase/migrations/20260928150000_invitation_acceptance.sql`
- Create: `api/src/oauth/routes.ts`
- Create: `api/src/oauth/consent-service.ts`
- Create: `api/test/auth-service.test.ts`
- Create: `api/test/invitation-service.test.ts`
- Create: `api/test/oauth-consent.test.ts`
- Modify: `api/src/app.ts`

**Interfaces:**
- `requestEmailOtp(email: string): Promise<{ accepted: true }>` calls Supabase with user creation disabled.
- `verifyEmailOtp(email: string, token: string): Promise<SessionResult>` verifies a six-digit email token, then loads active membership.
- `getGoogleSignInUrl(redirectTo: string): Promise<string>` delegates to Supabase OAuth and validates the allowlisted redirect.
- `acceptInvitation(userId: string, rawToken: string): Promise<MembershipView>` hashes and consumes a pending token in one transaction.
- `getCurrentIdentity(accessToken: string): Promise<IdentityContext>` returns user, active memberships, and roles.
- `getAuthorizationDetails(identity, authorizationId): Promise<AuthorizationDetails>` and `approveAuthorization` or `denyAuthorization` delegate to the Supabase OAuth Server while preserving the logged-in Relo identity.

- [ ] **Step 1: Write failing service tests with Supabase ports**

```ts
it('requests OTP without creating an unknown account', async () => {
  const auth = makeAuthService({ supabase: fakeSupabase() });
  await expect(auth.requestEmailOtp('employee@example.com')).resolves.toEqual({ accepted: true });
  expect(fakeSupabase().auth.signInWithOtp).toHaveBeenCalledWith({
    email: 'employee@example.com',
    options: { shouldCreateUser: false }
  });
});

it('rejects invitation acceptance when email does not match', async () => {
  await expect(service.acceptInvitation(userId, tokenFor('other@example.com')))
    .rejects.toMatchObject({ code: 'INVITATION_EMAIL_MISMATCH' });
});

it('denies an OAuth consent request without an authenticated Relo identity', async () => {
  await expect(oauth.getAuthorizationDetails(null, 'auth-1'))
    .rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- --run api/test/auth-service.test.ts api/test/invitation-service.test.ts`

Expected: FAIL because the ports and services are absent.

- [ ] **Step 3: Implement the services and routes**

Expose `POST /api/v1/auth/otp/request`, `POST /api/v1/auth/otp/verify`, `GET /api/v1/auth/google/start`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout`, and `POST /api/v1/invitations/:token/accept`. Expose `GET /api/v1/oauth/authorization-details`, `POST /api/v1/oauth/approve`, and `POST /api/v1/oauth/deny` for the existing `/oauth/consent` screen. Keep invitation creation out of public auth routes. Return only safe session metadata and never return service credentials.

- [ ] **Step 4: Run focused auth tests**

Run: `npm test -- --run api/test/auth-service.test.ts api/test/invitation-service.test.ts`

Expected: PASS, including invalid token, expired token, email mismatch, and replay tests.

- [ ] **Step 5: Commit**

```bash
git add api/src/identity api/test/auth-service.test.ts api/test/invitation-service.test.ts api/src/app.ts
git commit -m "feat: add OTP Google and invitation authentication"
```

### Task 5: Authorization middleware and protected route policy

**Files:**
- Create: `api/src/authorization/policy.ts`
- Create: `api/src/authorization/require-auth.ts`
- Create: `api/src/authorization/require-role.ts`
- Create: `api/test/authorization.test.ts`
- Modify: `api/src/app.ts`

**Interfaces:**
- `requireAuth(request): Promise<IdentityContext>` rejects missing or invalid sessions.
- `requireRole(...roles): RoutePreHandler` checks the active membership selected for the request tenant.
- `assertTenantAccess(identity, tenantId): void` rejects cross-tenant identifiers.
- `AuthorizationContext` is `{ identity, tenantId: string | null, membership: MembershipView | null, permissions }`; tenantless platform context is allowed only for trusted platform scope.
- `can(context, permission): boolean` resolves only the selected context; the convenience overload `can(identity, permission, tenantId)` requires an explicit tenant and fails closed when omitted or cross-tenant.
- Tenant `admin` and platform `platform_admin` are distinct roles; platform guards require both trusted platform scope and `platform_admin`.

- [ ] **Step 1: Write failing authorization tests**

```ts
it('denies a valid user from another tenant', () => {
  expect(() => assertTenantAccess(identityFor('tenant-a'), 'tenant-b'))
    .toThrow(expect.objectContaining({ code: 'TENANT_ACCESS_DENIED' }));
});

it('denies a suspended membership', async () => {
  await expect(requireAuth(requestWithSuspendedMembership())).rejects
    .toMatchObject({ code: 'MEMBERSHIP_SUSPENDED' });
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `npm test -- --run api/test/authorization.test.ts`

Expected: FAIL because the policy modules are absent.

- [ ] **Step 3: Implement policy evaluation and request hooks**

Load membership state for every protected request, require an explicit tenant selection when a user has multiple tenants, and attach only the resolved identity to `request.relo`. Add permission constants for employee, HR, reviewer, and platform admin actions.

- [ ] **Step 4: Run authorization and API tests**

Run: `npm test -- --run api/test/authorization.test.ts api/test/app.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/authorization api/test/authorization.test.ts api/src/app.ts
git commit -m "feat: enforce tenant and role authorization"
```

### Task 6: Auth-aware web shell and mobile route guard

**Files:**
- Create: `web/src/app/App.tsx`
- Create: `web/src/app/routes.tsx`
- Create: `web/src/app/auth/AuthProvider.tsx`
- Create: `web/src/app/auth/auth-client.ts`
- Create: `web/src/components/ProtectedRoute.tsx`
- Create: `web/src/pages/auth/LoginPage.tsx`
- Create: `web/src/pages/auth/OtpVerifyPage.tsx`
- Create: `web/src/pages/auth/InviteAcceptPage.tsx`
- Create: `web/src/pages/oauth/OAuthConsentPage.tsx`
- Create: `web/src/styles/tokens.css`
- Create: `web/src/styles/global.css`
- Create: `web/test/auth-flow.test.tsx`
- Modify: `web/index.html`

**Interfaces:**
- `AuthProvider` exposes `{ session, identity, status, requestOtp, verifyOtp, signInWithGoogle, signOut }`.
- `ProtectedRoute({ permission, children })` renders a loading state, login redirect, or forbidden state before child data requests.
- `AppShell` renders responsive desktop sidebar and mobile bottom navigation based on resolved role.
- `OAuthConsentPage` renders the requested client, scopes, redirect destination, approve action, deny action, and safe invalid-authorization state.

- [ ] **Step 1: Write failing component tests**

```tsx
it('does not render dashboard content before auth resolves', () => {
  render(<ProtectedRoute permission="employee:read"><div>dashboard</div></ProtectedRoute>, { auth: 'loading' });
  expect(screen.queryByText('dashboard')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Checking your session');
});

it('shows OTP verification after the email form submits', async () => {
  render(<LoginPage />);
  await userEvent.type(screen.getByLabelText('Work email'), 'employee@example.com');
  await userEvent.click(screen.getByRole('button', { name: /send sign-in code/i }));
  expect(screen.getByLabelText('One-time code')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `npm test -- --run web/test/auth-flow.test.tsx`

Expected: FAIL because the React app and auth provider are absent.

- [ ] **Step 3: Implement the route shell**

Use the existing Relo logo asset as the favicon and dashboard brand link. Preserve the approved navy, paper, sun, mint, serif heading, and mobile layout tokens. Add a compact bottom navigation for mobile, focus-visible styles, reduced-motion handling, and route-level lazy loading. Register `/oauth/consent`, `/privacy`, `/terms`, and `/status` as public routes, while keeping employee, HR, reviewer, and admin data behind the auth boundary. Do not render protected data until the provider returns an authorized identity.

- [ ] **Step 4: Run component and type checks**

Run: `npm test -- --run web/test/auth-flow.test.tsx` and `npm run typecheck`

Expected: PASS with no console errors.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat: add authenticated responsive web shell"
```

### Task 7: Container and Render foundation

**Files:**
- Create: `web/Dockerfile`
- Create: `api/Dockerfile`
- Create: `worker/Dockerfile`
- Modify: `render.yaml`
- Create: `.dockerignore`
- Create: `api/test/config.test.ts`
- Create: `docs/relo/deployment.md`

**Interfaces:**
- `relo-web` serves the Vite build and `/healthz`.
- `relo-api` serves `/healthz` and `/readyz` with Supabase configuration checks.
- `relo-worker` exits cleanly on `SIGTERM` and exposes no public port.

- [ ] **Step 1: Write failing configuration tests**

```ts
it('requires production secrets without printing their values', () => {
  expect(() => loadConfig({ NODE_ENV: 'production', SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '' }))
    .toThrow('SUPABASE_URL is required');
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- --run api/test/config.test.ts`

Expected: FAIL because `loadConfig` is not implemented.

- [ ] **Step 3: Implement images, health endpoints, and Render service definitions**

Use multi-stage builds, run as a non-root user, bind public services to `0.0.0.0` and Render's `PORT`, enable gzip or Brotli at the web server boundary, and keep Supabase service-role variables only on the API or worker services. Add a private worker service and document SMTP, Supabase, Google OAuth redirect, frontend origin, and API URL variables.

- [ ] **Step 4: Verify locally**

Run: `npm test`; `npm run build`; `docker build -f web/Dockerfile .`; `docker build -f api/Dockerfile .`; `docker build -f worker/Dockerfile .`

Expected: all tests and builds pass, and each image builds without a secret file in its context.

- [ ] **Step 5: Commit**

```bash
git add web/Dockerfile api/Dockerfile worker/Dockerfile render.yaml .dockerignore api/test/config.test.ts docs/relo/deployment.md
git commit -m "chore: define Render service foundation"
```

## Foundation completion gate

- [ ] OTP request and verification work against Supabase SMTP.
- [ ] Google sign-in returns through an allowlisted redirect.
- [ ] Invitation acceptance is email-bound, expiring, one-time, and audited.
- [ ] A protected route cannot be loaded with a missing, expired, or suspended membership.
- [ ] Cross-tenant API reads and writes are denied by both API policy and RLS.
- [ ] Web and API images build without credentials and expose health checks.
