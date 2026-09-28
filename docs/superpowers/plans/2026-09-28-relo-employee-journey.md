# Relo Employee Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an invited employee a complete, private, mobile-friendly relocation journey from activation through checklist, discovery, shortlist, provider requests, notifications, profile, and privacy settings.

**Architecture:** Employee domain modules own relocation cases, checklist items, directory reads, shortlists, consented requests, notifications, and profile preferences. The API exposes versioned REST handlers and writes an outbox event for every meaningful mutation. The web consumes those contracts through TanStack Query and renders role-specific pages behind the foundation auth boundary.

**Tech Stack:** TypeScript, Fastify, Zod, Supabase PostgreSQL and RLS, React, TanStack Query, Vitest, React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-28-relo-full-platform-design.md`

## Global Constraints

- An employee can read and mutate only their own profile, relocation case, checklist, shortlist, requests, notifications, and preferences.
- Directory content is published, non-expired, scoped to the employee's destination, and provenance-aware.
- Provider requests are private by default, record field-level consent, and do not expose an employee to a provider before explicit submission.
- Checklist mutations are idempotent and tenant isolated.
- Notification delivery is asynchronous, retryable, and safe to repeat.
- Search, filters, forms, cards, tables, and bottom navigation must work at a 375px viewport width.
- Accessibility target is WCAG 2.2 AA for keyboard, focus, contrast, labels, status messages, and reduced motion.
- Employee settings include profile, privacy, notifications, sessions, data export request, and deactivation request.

## Review Focus

- An employee opening a deep link before authentication must return to the intended page after login without leaking its data.
- A checklist update submitted twice must leave one completed state and one activity event.
- A shortlist item that has expired or is unpublished must disappear from active recommendations without breaking saved history.
- A consent withdrawal must prevent a new provider request and preserve an auditable withdrawal record.
- A notification with a failed delivery must remain visible in the in-app inbox and retry without duplicate email.

---

### Task 1: Employee data schema and seed fixtures

**Files:**
- Create: `supabase/migrations/20260928110000_employee_journey.sql`
- Create: `supabase/tests/employee_journey.sql`
- Create: `api/src/employee/types.ts`
- Create: `api/test/fixtures/employee-fixtures.ts`

**Interfaces:**
- `relocation_cases(id, tenant_id, employee_user_id, destination_city_id, move_date, status, progress_percent, created_at, updated_at)`.
- `checklist_items(id, case_id, key, title, description, state, due_at, completed_at, sort_order)`.
- `cities(id, country_code, name, slug, timezone, status)`.
- `providers(id, city_id, category, name, summary, contact_policy, status)`.
- `directory_entries(id, provider_id, title, description, metadata, source_url, published_at, expires_at, status)`.
- `shortlist_items(id, user_id, directory_entry_id, note, created_at)`.
- `provider_requests(id, case_id, directory_entry_id, status, submitted_at, withdrawn_at, idempotency_key)`.
- `consent_records(id, request_id, field_name, consented, recorded_at, withdrawn_at)`.
- `notifications(id, user_id, kind, title, body, read_at, delivery_status, dedupe_key)`.
- `user_preferences(user_id, timezone, notification_settings, privacy_settings, updated_at)`.

- [ ] **Step 1: Write failing SQL assertions**

```sql
select has_table('public.checklist_items');
select has_table('public.directory_entries');
select has_table('public.provider_requests');
select has_rls('public.provider_requests');
```

- [ ] **Step 2: Run SQL assertions before migration**

Run: `supabase db reset` and `supabase test db`

Expected: FAIL because the employee tables are absent.

- [ ] **Step 3: Add tables, constraints, indexes, RLS, and fixture helpers**

Use unique `(case_id, key)` checklist items, unique `(user_id, directory_entry_id)` shortlist rows, unique `(case_id, directory_entry_id, status)` active requests, and a unique notification dedupe key. Add policies for employee-owned rows and published directory reads.

- [ ] **Step 4: Run SQL tests**

Run: `supabase db reset` and `supabase test db`

Expected: PASS, including employee A cannot read employee B's request.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260928110000_employee_journey.sql supabase/tests/employee_journey.sql api/src/employee api/test/fixtures
git commit -m "feat: add employee journey schema"
```

### Task 2: Relocation case and checklist API

**Files:**
- Create: `api/src/employee/case-service.ts`
- Create: `api/src/employee/checklist-service.ts`
- Create: `api/src/employee/routes.ts`
- Create: `api/test/employee-checklist.test.ts`
- Modify: `api/src/app.ts`

**Interfaces:**
- `getMyRelocationCase(identity): Promise<RelocationCaseView>`.
- `listChecklist(identity, caseId): Promise<ChecklistItemView[]>`.
- `setChecklistState(identity, caseId, itemId, state, idempotencyKey): Promise<ChecklistItemView>`.
- Routes: `GET /api/v1/me/relocation`, `GET /api/v1/me/relocation/checklist`, `PATCH /api/v1/me/relocation/checklist/:itemId`.

- [ ] **Step 1: Write failing tests**

```ts
it('completes a checklist item once and emits one event', async () => {
  const first = await service.setChecklistState(employee, caseId, itemId, 'completed', 'check-1');
  const second = await service.setChecklistState(employee, caseId, itemId, 'completed', 'check-1');
  expect(second).toEqual(first);
  expect(outbox.count('ChecklistItemCompleted')).toBe(1);
});

it('rejects another employee case', async () => {
  await expect(service.listChecklist(otherEmployee, caseId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run api/test/employee-checklist.test.ts`

Expected: FAIL because services and routes are absent.

- [ ] **Step 3: Implement case and checklist handlers**

Calculate progress from completed checklist rows, create default items when a case is activated, use the shared idempotency repository, and write `ChecklistItemCompleted`, `RelocationCaseActivated`, and `ChecklistProgressChanged` events in the same transaction.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run api/test/employee-checklist.test.ts`

Expected: PASS, including duplicate submission, invalid state transition, and cross-employee denial.

- [ ] **Step 5: Commit**

```bash
git add api/src/employee api/test/employee-checklist.test.ts api/src/app.ts
git commit -m "feat: add employee relocation checklist API"
```

### Task 3: Directory, search, and shortlist API

**Files:**
- Create: `api/src/directory/directory-service.ts`
- Create: `api/src/directory/routes.ts`
- Create: `api/test/directory.test.ts`
- Modify: `api/src/app.ts`

**Interfaces:**
- `searchDirectory(input: { cityId: string; category?: string; query?: string; page: number; pageSize: number }): Promise<Page<DirectoryEntryView>>`.
- `saveDirectoryEntry(identity, entryId): Promise<ShortlistView>`.
- `removeDirectoryEntry(identity, entryId): Promise<void>`.
- Routes: `GET /api/v1/directory`, `GET /api/v1/directory/:entryId`, `POST /api/v1/me/shortlist`, `DELETE /api/v1/me/shortlist/:entryId`, `GET /api/v1/me/shortlist`.

- [ ] **Step 1: Write failing tests**

```ts
it('returns only published non-expired entries for the requested city', async () => {
  const result = await searchDirectory({ cityId: 'blr', page: 1, pageSize: 20 });
  expect(result.items.every((item) => item.status === 'published')).toBe(true);
  expect(result.items.every((item) => item.expiresAt === null || item.expiresAt > new Date())).toBe(true);
});

it('does not duplicate a saved entry', async () => {
  await saveDirectoryEntry(employee, 'entry-1');
  await saveDirectoryEntry(employee, 'entry-1');
  expect(await shortlistCount(employee.id, 'entry-1')).toBe(1);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run api/test/directory.test.ts`

Expected: FAIL because directory services are absent.

- [ ] **Step 3: Implement filters, pagination, shortlist mutations, and events**

Use parameterized Postgres queries through Supabase, cap `pageSize` at 50, normalize search input, reject unknown category values, and emit `DirectoryEntrySaved` or `DirectoryEntryUnsaved` only when state changes.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run api/test/directory.test.ts`

Expected: PASS, including expiry filtering, query normalization, pagination, and tenant-safe writes.

- [ ] **Step 5: Commit**

```bash
git add api/src/directory api/test/directory.test.ts api/src/app.ts
git commit -m "feat: add directory search and shortlist API"
```

### Task 4: Consent-based provider request API

**Files:**
- Create: `api/src/requests/consent-service.ts`
- Create: `api/src/requests/request-service.ts`
- Create: `api/src/requests/routes.ts`
- Create: `api/test/provider-request.test.ts`
- Modify: `api/src/app.ts`

**Interfaces:**
- `previewRequest(identity, entryId): Promise<RequestPreview>` returns the exact fields and destination.
- `submitRequest(identity, input, idempotencyKey): Promise<ProviderRequestView>` requires explicit per-field consent.
- `withdrawRequest(identity, requestId): Promise<ProviderRequestView>` records withdrawal without deleting history.
- Routes: `POST /api/v1/me/provider-requests/preview`, `POST /api/v1/me/provider-requests`, `GET /api/v1/me/provider-requests`, `POST /api/v1/me/provider-requests/:id/withdraw`.

- [ ] **Step 1: Write failing tests**

```ts
it('requires field-level consent before submission', async () => {
  await expect(service.submitRequest(employee, { entryId: 'entry-1', consents: [{ field: 'email', consented: false }] }, 'req-1'))
    .rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
});

it('makes repeated submissions idempotent', async () => {
  const input = validRequestInput();
  const a = await service.submitRequest(employee, input, 'req-2');
  const b = await service.submitRequest(employee, input, 'req-2');
  expect(b.id).toBe(a.id);
  expect(outbox.count('ProviderRequestSubmitted')).toBe(1);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run api/test/provider-request.test.ts`

Expected: FAIL because request and consent services are absent.

- [ ] **Step 3: Implement preview, consent snapshot, submit, withdrawal, and audit**

Persist consent rows before changing request state, reject requests for unpublished or expired entries, never expose provider contact details before acceptance, and write `ProviderRequestSubmitted`, `ConsentWithdrawn`, and `ProviderRequestWithdrawn` events.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run api/test/provider-request.test.ts`

Expected: PASS, including missing consent, duplicate request, withdrawal, expired listing, and audit assertions.

- [ ] **Step 5: Commit**

```bash
git add api/src/requests api/test/provider-request.test.ts api/src/app.ts
git commit -m "feat: add consent-based provider requests"
```

### Task 5: Notification inbox and preferences API

**Files:**
- Create: `api/src/notifications/notification-service.ts`
- Create: `api/src/notifications/routes.ts`
- Create: `api/test/notifications.test.ts`
- Modify: `api/src/app.ts`

**Interfaces:**
- `listNotifications(identity, page): Promise<Page<NotificationView>>`.
- `markNotificationRead(identity, notificationId): Promise<void>`.
- `updatePreferences(identity, patch): Promise<PreferenceView>`.
- Routes: `GET /api/v1/me/notifications`, `POST /api/v1/me/notifications/:id/read`, `GET /api/v1/me/preferences`, `PATCH /api/v1/me/preferences`.

- [ ] **Step 1: Write failing tests**

```ts
it('cannot mark another users notification as read', async () => {
  await expect(service.markNotificationRead(employee, otherNotificationId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

it('normalizes preference updates and preserves unspecified channels', async () => {
  const result = await service.updatePreferences(employee, { email: false });
  expect(result.channels).toMatchObject({ email: false, inApp: true });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run api/test/notifications.test.ts`

Expected: FAIL because the notification service is absent.

- [ ] **Step 3: Implement inbox queries, read state, and preference updates**

Keep notification rows tenant-independent by user ID, use a dedupe key for event-created notices, and return unread counts for the shell.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run api/test/notifications.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/notifications api/test/notifications.test.ts api/src/app.ts
git commit -m "feat: add employee notifications and preferences API"
```

### Task 6: Employee web pages and responsive interaction model

**Files:**
- Create: `web/src/pages/employee/EmployeeHomePage.tsx`
- Create: `web/src/pages/employee/ChecklistPage.tsx`
- Create: `web/src/pages/employee/ExplorePage.tsx`
- Create: `web/src/pages/employee/SavedPage.tsx`
- Create: `web/src/pages/employee/RequestsPage.tsx`
- Create: `web/src/pages/employee/ProfilePage.tsx`
- Create: `web/src/pages/employee/SettingsPage.tsx`
- Create: `web/src/components/employee/ProgressCard.tsx`
- Create: `web/src/components/employee/DirectoryCard.tsx`
- Create: `web/src/components/employee/ConsentDialog.tsx`
- Create: `web/src/components/employee/ChecklistItem.tsx`
- Create: `web/test/employee-pages.test.tsx`
- Modify: `web/src/app/routes.tsx`

**Interfaces:**
- Pages use query keys `['employee-case']`, `['employee-checklist']`, `['directory', filters]`, `['shortlist']`, `['provider-requests']`, `['notifications']`, and `['employee-preferences']`.
- Mutations invalidate only the owning query keys and display a status announcement.
- `ConsentDialog` accepts `{ fields, onConfirm, onCancel }` and requires every required field before confirm.

- [ ] **Step 1: Write failing UI tests**

```tsx
it('shows the next checklist action and can complete it on mobile', async () => {
  render(<ChecklistPage />, { viewport: { width: 375, height: 812 } });
  expect(screen.getByRole('heading', { name: /my checklist/i })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /complete compare housing options/i }));
  expect(screen.getByRole('status')).toHaveTextContent(/saved/i);
});

it('requires all consent checkboxes before request submission', async () => {
  render(<ConsentDialog fields={requiredFields} onConfirm={vi.fn()} onCancel={vi.fn()} />);
  expect(screen.getByRole('button', { name: /send request/i })).toBeDisabled();
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run web/test/employee-pages.test.tsx`

Expected: FAIL because pages and components are absent.

- [ ] **Step 3: Implement pages, queries, mutations, optimistic states, and mobile navigation**

Use the existing Relo visual language as the starting point, replace the current in-memory arrays with API data, keep loading and error states explicit, provide skeletons that preserve layout, and use drawers or full-screen sheets instead of desktop-only modals on small screens.

- [ ] **Step 4: Run component, type, and responsive checks**

Run: `npm test -- --run web/test/employee-pages.test.tsx`; `npm run typecheck`; `npm run build`

Expected: PASS and no horizontal overflow at 375px and 768px.

- [ ] **Step 5: Commit**

```bash
git add web/src web/test/employee-pages.test.tsx
git commit -m "feat: build employee relocation journey"
```

## Employee completion gate

- [ ] An invited employee can authenticate, accept an invitation, and see only their relocation case.
- [ ] Checklist completion is persisted, idempotent, and reflected in progress.
- [ ] Directory search shows only valid published content and supports shortlist actions.
- [ ] Provider request submission is preceded by a field-level consent preview.
- [ ] Notifications and preferences work from the mobile settings surface.
- [ ] Employee pages pass component tests, type checks, keyboard checks, and responsive smoke tests.
