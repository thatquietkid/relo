# Relo Operations and Growth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give HR, reviewers, and platform administrators the controlled operational surfaces needed to configure programs, invite employees, moderate content, manage security, and measure Activation, Acquisition, Retention, Referral, and Revenue.

**Architecture:** HR operations are tenant scoped. Reviewer operations are scoped to assigned cities and content categories. Platform administration is platform scoped and separated from tenant operations. Each role gets a distinct API permission set and web navigation. Reports use rebuildable daily projections sourced from domain events, not mutable dashboard counters.

**Tech Stack:** TypeScript, Fastify, Zod, Supabase PostgreSQL and RLS, React, TanStack Query, Vitest, React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-28-relo-full-platform-design.md`

## Global Constraints

- HR and platform admin registration remain disabled from the public portal.
- HR can operate only on tenants where an active HR membership exists.
- Reviewer actions require assigned city or category scope and create audit records.
- Platform admin actions are rare, explicit, audited, and protected by re-authentication for destructive changes.
- AARRR metrics are definitions with time windows and source event names, not hard-coded display strings.
- Reports return aggregate data and never expose employee-level PII unless the permission and export policy allow it.
- Invite creation, role changes, content publishing, exports, and feature changes are idempotent and audited.
- Admin and HR tables remain usable on mobile through cards, filters, horizontal scroll regions with accessible labels, or stacked detail views.

## Review Focus

- An HR user must not invite an administrator or assign a role outside the allowed tenant role set.
- An admin export must apply a date range, tenant scope, permission check, audit event, and bounded row limit.
- A reviewer must not publish content outside assigned scope, and an expired item must not appear in employee search.
- A role change must invalidate old access on the next API request and leave an audit record with before and after values.
- A metric with no events must render an explicit zero or unavailable state, never a fabricated percentage.

---

### Task 1: HR programs, invitations, and operations schema

**Files:**
- Create: `supabase/migrations/20260928120000_operations.sql`
- Create: `supabase/tests/operations.sql`
- Create: `api/src/operations/types.ts`
- Create: `api/test/fixtures/operations-fixtures.ts`

**Interfaces:**
- `programs(id, tenant_id, name, destination_city_id, status, starts_at, ends_at, created_by)`.
- `program_memberships(program_id, membership_id, status, enrolled_at)`.
- `invitation_batches(id, tenant_id, created_by, label, expires_at, created_at)`.
- `invitation_batch_items(batch_id, invitation_id)`.
- `review_assignments(id, reviewer_user_id, city_id, category, active)`.
- `feature_flags(id, key, scope, enabled, config, updated_by, updated_at)`.
- `support_cases(id, tenant_id, requester_user_id, status, subject, body, assigned_to, created_at)`.

- [ ] **Step 1: Write failing schema tests**

```sql
select has_table('public.programs');
select has_table('public.invitation_batches');
select has_table('public.review_assignments');
select has_rls('public.programs');
```

- [ ] **Step 2: Run SQL tests and verify failure**

Run: `supabase db reset` and `supabase test db`

Expected: FAIL because operations tables are absent.

- [ ] **Step 3: Add tables, constraints, indexes, and scoped RLS**

Permit HR to read and mutate programs and invitations in their tenant, reviewers to read assignments and scoped moderation rows, and platform admins to manage platform flags and support cases. Use immutable audit metadata for role and feature changes.

- [ ] **Step 4: Run SQL tests**

Run: `supabase db reset` and `supabase test db`

Expected: PASS, including cross-tenant denial and reviewer scope denial.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260928120000_operations.sql supabase/tests/operations.sql api/src/operations api/test/fixtures
git commit -m "feat: add HR and moderation operations schema"
```

### Task 2: HR employee and invitation API

**Files:**
- Create: `api/src/hr/employee-service.ts`
- Create: `api/src/hr/invitation-service.ts`
- Create: `api/src/hr/routes.ts`
- Create: `api/test/hr-invitations.test.ts`
- Modify: `api/src/app.ts`

**Interfaces:**
- `listTenantEmployees(identity, filters): Promise<Page<EmployeeSummary>>`.
- `createEmployeeInvitation(identity, input, idempotencyKey): Promise<InvitationView>`.
- `resendEmployeeInvitation(identity, invitationId, idempotencyKey): Promise<InvitationView>`.
- `revokeEmployeeInvitation(identity, invitationId): Promise<InvitationView>`.
- Routes: `GET /api/v1/hr/employees`, `POST /api/v1/hr/invitations`, `POST /api/v1/hr/invitations/:id/resend`, `POST /api/v1/hr/invitations/:id/revoke`.

- [ ] **Step 1: Write failing service tests**

```ts
it('creates only employee invitations from HR', async () => {
  const result = await service.createEmployeeInvitation(hrIdentity, { email: 'new@example.com', name: 'New Person' }, 'invite-1');
  expect(result.role).toBe('employee');
  await expect(service.createEmployeeInvitation(hrIdentity, { email: 'admin@example.com', role: 'admin' }, 'invite-2'))
    .rejects.toMatchObject({ code: 'ROLE_NOT_ALLOWED' });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run api/test/hr-invitations.test.ts`

Expected: FAIL because HR services are absent.

- [ ] **Step 3: Implement tenant employee views and controlled invitations**

Use the identity invitation table from the foundation, force `role_key = employee` for HR-created invitations, write audit and outbox rows, cap invitation batches at 100, and return stable conflict responses for duplicate active invitations.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run api/test/hr-invitations.test.ts`

Expected: PASS, including duplicate invitation, revoke, resend rate limit, role denial, and cross-tenant cases.

- [ ] **Step 5: Commit**

```bash
git add api/src/hr api/test/hr-invitations.test.ts api/src/app.ts
git commit -m "feat: add HR employee and invitation API"
```

### Task 3: HR programs, request operations, and settings API

**Files:**
- Create: `api/src/hr/program-service.ts`
- Create: `api/src/hr/request-operations-service.ts`
- Create: `api/src/hr/settings-service.ts`
- Create: `api/test/hr-operations.test.ts`
- Modify: `api/src/hr/routes.ts`

**Interfaces:**
- `createProgram(identity, input, idempotencyKey): Promise<ProgramView>`.
- `updateProgram(identity, programId, patch): Promise<ProgramView>`.
- `listTenantRequests(identity, filters): Promise<Page<RequestOperationsView>>`.
- `updateRequestStatus(identity, requestId, status): Promise<RequestOperationsView>`.
- `getHrSettings(identity): Promise<HrSettingsView>` and `updateHrSettings(identity, patch): Promise<HrSettingsView>`.
- Routes: `GET|POST|PATCH /api/v1/hr/programs`, `GET /api/v1/hr/provider-requests`, `PATCH /api/v1/hr/provider-requests/:id`, `GET|PATCH /api/v1/hr/settings`.

- [ ] **Step 1: Write failing tests**

```ts
it('prevents HR from updating a request in another tenant', async () => {
  await expect(service.updateRequestStatus(hrIdentity, otherTenantRequest, 'acknowledged'))
    .rejects.toMatchObject({ code: 'FORBIDDEN' });
});

it('rejects an invalid program date range', async () => {
  await expect(programs.createProgram(hrIdentity, { startsAt: '2026-10-10', endsAt: '2026-10-01' }, 'program-1'))
    .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run api/test/hr-operations.test.ts`

Expected: FAIL because services are absent.

- [ ] **Step 3: Implement program, request status, and settings handlers**

Allow only valid request transitions, record actor and timestamps, preserve employee consent, audit organization setting changes, and use idempotency for program creation.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run api/test/hr-operations.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/hr api/test/hr-operations.test.ts
git commit -m "feat: add HR programmes requests and settings"
```

### Task 4: Content review and publication API

**Files:**
- Create: `api/src/review/content-service.ts`
- Create: `api/src/review/settings-service.ts`
- Create: `api/src/review/routes.ts`
- Create: `api/test/content-review.test.ts`
- Modify: `api/src/app.ts`

**Interfaces:**
- `listReviewQueue(identity, filters): Promise<Page<ReviewItem>>`.
- `saveDraft(identity, input, idempotencyKey): Promise<DirectoryEntryView>`.
- `publishEntry(identity, entryId): Promise<DirectoryEntryView>`.
- `unpublishEntry(identity, entryId, reason): Promise<DirectoryEntryView>`.
- `getReviewerSettings(identity): Promise<ReviewerSettingsView>` and `updateReviewerSettings(identity, patch): Promise<ReviewerSettingsView>`.
- Routes: `GET /api/v1/review/queue`, `POST /api/v1/review/directory`, `PATCH /api/v1/review/directory/:id`, `POST /api/v1/review/directory/:id/publish`, `POST /api/v1/review/directory/:id/unpublish`.

- [ ] **Step 1: Write failing scope and freshness tests**

```ts
it('denies publishing outside a reviewer assignment', async () => {
  await expect(service.publishEntry(reviewerForCity('blr'), entryIn('delhi')))
    .rejects.toMatchObject({ code: 'REVIEW_SCOPE_DENIED' });
});

it('requires provenance and expiry for publication', async () => {
  await expect(service.publishEntry(reviewer, draftWithoutSource)).rejects
    .toMatchObject({ code: 'PUBLICATION_REQUIREMENTS_MISSING' });
});

it('limits reviewer settings to assigned scope', async () => {
  await expect(settings.updateReviewerSettings(reviewer, { cityIds: ['delhi'] }))
    .rejects.toMatchObject({ code: 'REVIEW_SCOPE_DENIED' });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run api/test/content-review.test.ts`

Expected: FAIL because the review service is absent.

- [ ] **Step 3: Implement draft, review, publish, unpublish, expiry, and audit behavior**

Require source URL or verified provenance, category and city assignment, reviewer scope, and an expiry date. Publishing writes `DirectoryEntryPublished`; unpublishing writes `DirectoryEntryUnpublished` and removes the item from employee search immediately. Add reviewer settings for assigned cities, assigned categories, notification preferences, and timezone, with changes audited.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run api/test/content-review.test.ts`

Expected: PASS, including scope, missing provenance, expiry, and audit cases.

- [ ] **Step 5: Commit**

```bash
git add api/src/review api/test/content-review.test.ts api/src/app.ts
git commit -m "feat: add scoped content review API"
```

### Task 5: AARRR metric definitions, projections, reports, and exports

**Files:**
- Create: `supabase/migrations/20260928130000_growth_reporting.sql`
- Create: `api/src/reporting/metric-definitions.ts`
- Create: `api/src/reporting/report-service.ts`
- Create: `api/src/reporting/routes.ts`
- Create: `api/test/reporting.test.ts`
- Modify: `api/src/app.ts`

**Interfaces:**
- `MetricDefinition` is `{ key, label, sourceEvents, numerator, denominator, defaultWindow }`.
- `getAaarrrReport(identity, input: { from: Date; to: Date }): Promise<AaarrrReport>`.
- `requestReportExport(identity, input, idempotencyKey): Promise<ExportJobView>`.
- Routes: `GET /api/v1/hr/reports/aarrr`, `GET /api/v1/hr/reports/progress`, `POST /api/v1/hr/reports/exports`.

- [ ] **Step 1: Write failing metric tests**

```ts
it('returns zero activation when no invited users activate', async () => {
  const report = await service.getAaarrrReport(hrIdentity, windowWithNoEvents());
  expect(report.activation.rate).toBe(0);
  expect(report.activation.status).toBe('no_data');
});

it('cannot export another tenant report', async () => {
  await expect(service.requestReportExport(hrIdentity, reportInputForOtherTenant, 'export-1'))
    .rejects.toMatchObject({ code: 'FORBIDDEN' });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run api/test/reporting.test.ts`

Expected: FAIL because report services are absent.

- [ ] **Step 3: Implement definitions, daily aggregates, report queries, and export jobs**

Store event names and metric formulas centrally, return numerator, denominator, rate, trend, and status, apply inclusive UTC windows, exclude deleted users from aggregate counts, and enqueue exports through the outbox rather than blocking an HTTP request.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run api/test/reporting.test.ts`

Expected: PASS, including no-data, date boundaries, tenant scope, and idempotency cases.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260928130000_growth_reporting.sql api/src/reporting api/test/reporting.test.ts api/src/app.ts
git commit -m "feat: add AARRR reporting and export API"
```

### Task 6: Reviewer, HR, and admin web surfaces

**Files:**
- Create: `web/src/pages/hr/HrDashboardPage.tsx`
- Create: `web/src/pages/hr/EmployeesPage.tsx`
- Create: `web/src/pages/hr/ProgramsPage.tsx`
- Create: `web/src/pages/hr/RequestsPage.tsx`
- Create: `web/src/pages/hr/ReportsPage.tsx`
- Create: `web/src/pages/hr/HrSettingsPage.tsx`
- Create: `web/src/pages/review/ReviewQueuePage.tsx`
- Create: `web/src/pages/review/ContentPage.tsx`
- Create: `web/src/pages/review/ReviewerSettingsPage.tsx`
- Create: `web/src/pages/admin/AdminEventsPage.tsx`
- Create: `web/src/pages/admin/AdminUsersPage.tsx`
- Create: `web/src/pages/admin/AdminSecurityPage.tsx`
- Create: `web/src/pages/admin/AdminSettingsPage.tsx`
- Create: `web/src/components/operations/MetricsStrip.tsx`
- Create: `web/src/components/operations/DataTable.tsx`
- Create: `web/src/components/operations/ConfirmActionDialog.tsx`
- Create: `web/test/operations-pages.test.tsx`
- Modify: `web/src/app/routes.tsx`

**Interfaces:**
- HR queries use `['hr-employees']`, `['hr-programs']`, `['hr-requests']`, `['hr-report', window]`.
- Reviewer queries use `['review-queue', filters]` and invalidate `['directory']` after publication.
- Admin queries use `['admin-events', filters]`, `['admin-users']`, and `['admin-security']`.
- Destructive actions require `ConfirmActionDialog` and expose success or failure through `role="status"`.

- [ ] **Step 1: Write failing role and mobile UI tests**

```tsx
it('does not render admin navigation for an HR identity', () => {
  render(<AppShell />, { identity: hrIdentity });
  expect(screen.queryByRole('link', { name: /admin security/i })).not.toBeInTheDocument();
});

it('renders empty AARRR states without fake values', () => {
  render(<ReportsPage />, { report: emptyReport });
  expect(screen.getByText(/no data in this window/i)).toBeInTheDocument();
  expect(screen.queryByText('71%')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run web/test/operations-pages.test.tsx`

Expected: FAIL because operations pages are absent.

- [ ] **Step 3: Implement pages, filters, forms, tables, confirmation dialogs, and role-specific navigation**

Show AARRR metrics first on the HR dashboard, provide invitation and program actions, use accessible table labels and stacked mobile rows, show review provenance and expiry, provide reviewer assignment and preference settings, and protect admin events, security, and settings behind platform permissions.

- [ ] **Step 4: Run UI and type checks**

Run: `npm test -- --run web/test/operations-pages.test.tsx`; `npm run typecheck`; `npm run build`

Expected: PASS with responsive layouts at 375px, 768px, and desktop widths.

- [ ] **Step 5: Commit**

```bash
git add web/src web/test/operations-pages.test.tsx
git commit -m "feat: add HR reviewer and admin workspaces"
```

## Operations completion gate

- [ ] HR can invite employees, manage programs, operate requests, configure settings, and view AARRR reports.
- [ ] Reviewer scope is enforced in both API and database policies.
- [ ] Platform admin can inspect events, security, users, health, flags, and settings without public registration.
- [ ] Exports are bounded, asynchronous, permissioned, and audited.
- [ ] Empty and no-data states are truthful and do not use seeded demo values in production.
