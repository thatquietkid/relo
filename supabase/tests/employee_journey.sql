begin;

create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(113);

select has_table('public', 'relocation_cases', 'relocation cases table exists');
select has_table('public', 'checklist_items', 'checklist items table exists');
select has_table('public', 'cities', 'cities table exists');
select has_table('public', 'providers', 'providers table exists');
select has_table('public', 'directory_entries', 'directory entries table exists');
select has_table('public', 'shortlist_items', 'shortlist items table exists');
select has_table('public', 'provider_requests', 'provider requests table exists');
select has_table('public', 'consent_records', 'consent records table exists');
select has_table('public', 'notifications', 'notifications table exists');
select has_table('public', 'user_preferences', 'user preferences table exists');

select has_column('public', 'relocation_cases', 'tenant_id', 'relocation cases keep tenant ownership');
select has_column('public', 'relocation_cases', 'employee_user_id', 'relocation cases keep employee ownership');
select has_column('public', 'relocation_cases', 'destination_city_id', 'relocation cases keep destination city');
select has_column('public', 'relocation_cases', 'status', 'relocation cases keep lifecycle status');
select has_column('public', 'checklist_items', 'completed_at', 'checklist items record completion');
select has_column('public', 'checklist_items', 'case_id', 'checklist items belong to a case');
select has_column('public', 'directory_entries', 'expires_at', 'directory entries record expiry');
select has_column('public', 'directory_entries', 'provider_id', 'directory entries belong to a provider');
select has_column('public', 'directory_entries', 'published_at', 'directory entries record publication');
select has_column('public', 'directory_entries', 'status', 'directory entries keep publication status');
select has_column('public', 'cities', 'slug', 'cities expose stable slugs');
select has_column('public', 'providers', 'city_id', 'providers belong to a city');
select has_column('public', 'shortlist_items', 'user_id', 'shortlist items keep employee ownership');
select has_column('public', 'shortlist_items', 'directory_entry_id', 'shortlist items reference directory entries');
select has_column('public', 'provider_requests', 'case_id', 'provider requests belong to a case');
select has_column('public', 'provider_requests', 'status', 'provider requests keep lifecycle status');
select has_column('public', 'provider_requests', 'idempotency_key', 'provider requests accept idempotency keys');
select has_column('public', 'consent_records', 'request_id', 'consent records belong to a request');
select has_column('public', 'consent_records', 'consented', 'consent records keep the consent decision');
select has_column('public', 'notifications', 'dedupe_key', 'notifications have dedupe keys');
select has_column('public', 'notifications', 'delivery_status', 'notifications keep delivery status');
select has_column('public', 'user_preferences', 'privacy_settings', 'preferences store privacy settings');
select has_column('public', 'user_preferences', 'notification_settings', 'preferences store notification settings');

select ok(to_regprocedure('public.employee_can_access_tenant(uuid)') is not null, 'tenant access helper exists');
select ok(
  (select proconfig @> array['search_path=public, pg_catalog']
     from pg_proc
    where oid = 'public.employee_can_access_tenant(uuid)'::regprocedure),
  'tenant access helper fixes its search path'
);

select ok(
  not exists (
    select 1
      from (values
        ('relocation_cases', 'id'),
        ('checklist_items', 'id'),
        ('cities', 'id'),
        ('providers', 'id'),
        ('directory_entries', 'id'),
        ('shortlist_items', 'id'),
        ('provider_requests', 'id'),
        ('consent_records', 'id'),
        ('notifications', 'id'),
        ('user_preferences', 'user_id')
      ) as required(table_name, column_name)
     where not exists (
       select 1
         from pg_constraint c
         join pg_attribute a
           on a.attrelid = c.conrelid
          and a.attnum = any(c.conkey)
        where c.conrelid = ('public.' || required.table_name)::regclass
          and c.contype = 'p'
          and a.attname = required.column_name
          and a.atttypid = 'uuid'::regtype
          and c.conkey = array[a.attnum]::smallint[]
     )
  ),
  'all employee tables use single-column UUID primary keys'
);

select ok((select relrowsecurity from pg_class where oid = 'public.relocation_cases'::regclass), 'relocation cases have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.checklist_items'::regclass), 'checklist items have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.cities'::regclass), 'cities have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.providers'::regclass), 'providers have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.directory_entries'::regclass), 'directory entries have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.shortlist_items'::regclass), 'shortlist items have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.provider_requests'::regclass), 'provider requests have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.consent_records'::regclass), 'consent records have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.notifications'::regclass), 'notifications have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.user_preferences'::regclass), 'user preferences have RLS');

select ok((select relforcerowsecurity from pg_class where oid = 'public.relocation_cases'::regclass), 'relocation cases force RLS');
select ok((select relforcerowsecurity from pg_class where oid = 'public.checklist_items'::regclass), 'checklist items force RLS');
select ok((select relforcerowsecurity from pg_class where oid = 'public.cities'::regclass), 'cities force RLS');
select ok((select relforcerowsecurity from pg_class where oid = 'public.providers'::regclass), 'providers force RLS');
select ok((select relforcerowsecurity from pg_class where oid = 'public.directory_entries'::regclass), 'directory entries force RLS');
select ok((select relforcerowsecurity from pg_class where oid = 'public.shortlist_items'::regclass), 'shortlist items force RLS');
select ok((select relforcerowsecurity from pg_class where oid = 'public.provider_requests'::regclass), 'provider requests force RLS');
select ok((select relforcerowsecurity from pg_class where oid = 'public.consent_records'::regclass), 'consent records force RLS');
select ok((select relforcerowsecurity from pg_class where oid = 'public.notifications'::regclass), 'notifications force RLS');
select ok((select relforcerowsecurity from pg_class where oid = 'public.user_preferences'::regclass), 'user preferences force RLS');

select ok(to_regclass('public.relocation_cases_employee_idx') is not null, 'relocation employee index exists');
select ok(to_regclass('public.checklist_items_case_idx') is not null, 'checklist case index exists');
select ok(to_regclass('public.directory_entries_published_idx') is not null, 'published directory index exists');
select ok(to_regclass('public.directory_entries_expiry_idx') is not null, 'directory expiry index exists');
select ok(to_regclass('public.shortlist_items_user_idx') is not null, 'shortlist user index exists');
select ok(to_regclass('public.provider_requests_status_idx') is not null, 'provider request status index exists');
select ok(to_regclass('public.notifications_unread_idx') is not null, 'unread notification index exists');
select ok(to_regclass('public.checklist_items_case_key_unique') is not null, 'checklist key uniqueness exists');
select ok(to_regclass('public.shortlist_items_user_entry_unique') is not null, 'shortlist uniqueness exists');
select ok(to_regclass('public.provider_requests_active_identity') is not null, 'active provider request uniqueness exists');
select ok(to_regclass('public.notifications_dedupe_key_unique') is not null, 'notification dedupe uniqueness exists');

select policies_are('public', 'relocation_cases', array['employees can view own relocation cases', 'employees can view their own relocation case']);
select policies_are('public', 'checklist_items', array['employees can view own checklist items']);
select policies_are('public', 'cities', array['employees can view relevant cities']);
select policies_are('public', 'providers', array['employees can view relevant providers']);
select policies_are('public', 'directory_entries', array['employees can view published directory entries', 'employees can view directory entries tied to own requests']);
select policies_are('public', 'shortlist_items', array['employees can view own shortlist', 'employees can create own shortlist', 'employees can delete own shortlist']);
select policies_are('public', 'provider_requests', array['employees can view own provider requests']);
select policies_are('public', 'consent_records', array['employees can view own consent records']);
select policies_are('public', 'notifications', array['employees can view own notifications']);
select policies_are('public', 'user_preferences', array['employees can view own preferences']);

select ok(not has_table_privilege('anon', 'public.relocation_cases', 'SELECT'), 'anonymous cannot read relocation cases');
select ok(
  not exists (
    select 1
      from (values
        ('relocation_cases'), ('checklist_items'), ('cities'), ('providers'), ('directory_entries'),
        ('provider_requests'), ('notifications'), ('user_preferences')
      ) as exposed(table_name)
     where has_table_privilege('anon', 'public.' || exposed.table_name, 'SELECT')
  ),
  'anonymous cannot read any exposed employee table'
);
select ok(
  not exists (
    select 1
      from (values
        ('relocation_cases'), ('checklist_items'), ('cities'), ('providers'), ('directory_entries'),
        ('provider_requests'), ('notifications'), ('user_preferences')
      ) as exposed(table_name)
     where has_table_privilege('authenticated', 'public.' || exposed.table_name, 'INSERT')
        or has_table_privilege('authenticated', 'public.' || exposed.table_name, 'UPDATE')
        or has_table_privilege('authenticated', 'public.' || exposed.table_name, 'DELETE')
  ),
  'authenticated employee writes remain server-side for all exposed tables'
);

select ok(
  not exists (
    select 1
      from (values
        ('relocation_cases'), ('checklist_items'), ('cities'), ('providers'), ('directory_entries'),
        ('shortlist_items'), ('provider_requests'), ('notifications'), ('user_preferences')
      ) as mutable(table_name)
     where not exists (
       select 1
         from pg_trigger
        where tgrelid = ('public.' || mutable.table_name)::regclass
          and tgname = mutable.table_name || '_set_updated_at'
          and not tgisinternal
     )
  ),
  'all mutable employee tables have updated_at triggers'
);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000007001', 'employee-a@example.com'),
  ('00000000-0000-0000-0000-000000007002', 'employee-b@example.com')
on conflict (id) do nothing;

insert into public.tenants (id, name, slug, status)
values
  ('00000000-0000-0000-0000-000000007011', 'Employee Tenant A', 'employee-tenant-a', 'active'),
  ('00000000-0000-0000-0000-000000007012', 'Employee Tenant B', 'employee-tenant-b', 'active'),
  ('00000000-0000-0000-0000-000000007013', 'Suspended Employee Tenant', 'employee-tenant-suspended', 'suspended');

insert into public.memberships (id, tenant_id, user_id, status)
values
  ('00000000-0000-0000-0000-000000007021', '00000000-0000-0000-0000-000000007011', '00000000-0000-0000-0000-000000007001', 'active'),
  ('00000000-0000-0000-0000-000000007022', '00000000-0000-0000-0000-000000007012', '00000000-0000-0000-0000-000000007002', 'active'),
  ('00000000-0000-0000-0000-000000007023', '00000000-0000-0000-0000-000000007013', '00000000-0000-0000-0000-000000007001', 'active');

insert into public.membership_roles (membership_id, role_id)
select membership_id, (select id from public.roles where key = 'employee')
  from (values
    ('00000000-0000-0000-0000-000000007021'::uuid),
    ('00000000-0000-0000-0000-000000007022'::uuid),
    ('00000000-0000-0000-0000-000000007023'::uuid)
  ) as memberships(membership_id);

insert into public.cities (id, country_code, name, slug, timezone, status)
values
  ('00000000-0000-0000-0000-000000007031', 'IN', 'Bengaluru', 'bengaluru', 'Asia/Kolkata', 'active'),
  ('00000000-0000-0000-0000-000000007032', 'IN', 'Pune', 'pune', 'Asia/Kolkata', 'active');

insert into public.providers (id, city_id, category, name, summary, contact_policy, status)
values
  ('00000000-0000-0000-0000-000000007041', '00000000-0000-0000-0000-000000007031', 'housing', 'Bengaluru Homes', 'Relocation housing support', 'employee_request', 'active'),
  ('00000000-0000-0000-0000-000000007042', '00000000-0000-0000-0000-000000007032', 'housing', 'Pune Homes', 'Another city provider', 'employee_request', 'active');

insert into public.directory_entries (id, provider_id, title, description, metadata, source_url, published_at, expires_at, status)
values
  ('00000000-0000-0000-0000-000000007051', '00000000-0000-0000-0000-000000007041', 'Bengaluru housing guide', 'Published guide', '{}'::jsonb, 'https://example.com/bengaluru', now() - interval '1 day', now() + interval '30 days', 'published'),
  ('00000000-0000-0000-0000-000000007052', '00000000-0000-0000-0000-000000007041', 'Expired housing guide', 'Expired guide', '{}'::jsonb, 'https://example.com/expired', now() - interval '30 days', now() - interval '1 day', 'published'),
  ('00000000-0000-0000-0000-000000007053', '00000000-0000-0000-0000-000000007041', 'Draft housing guide', 'Draft guide', '{}'::jsonb, null, null, null, 'draft'),
  ('00000000-0000-0000-0000-000000007054', '00000000-0000-0000-0000-000000007042', 'Pune housing guide', 'Other city guide', '{}'::jsonb, 'https://example.com/pune', now() - interval '1 day', now() + interval '30 days', 'published');

insert into public.relocation_cases (id, tenant_id, employee_user_id, destination_city_id, move_date, status, progress_percent)
values
  ('00000000-0000-0000-0000-000000007061', '00000000-0000-0000-0000-000000007011', '00000000-0000-0000-0000-000000007001', '00000000-0000-0000-0000-000000007031', '2026-11-15', 'active', 25),
  ('00000000-0000-0000-0000-000000007062', '00000000-0000-0000-0000-000000007012', '00000000-0000-0000-0000-000000007002', '00000000-0000-0000-0000-000000007032', '2026-12-01', 'active', 40),
  ('00000000-0000-0000-0000-000000007063', '00000000-0000-0000-0000-000000007013', '00000000-0000-0000-0000-000000007001', '00000000-0000-0000-0000-000000007031', '2026-12-15', 'active', 10);

insert into public.checklist_items (id, case_id, key, title, description, state, due_at, completed_at, sort_order)
values
  ('00000000-0000-0000-0000-000000007071', '00000000-0000-0000-0000-000000007061', 'documents', 'Collect documents', 'Identity documents', 'pending', now() + interval '7 days', null, 1),
  ('00000000-0000-0000-0000-000000007072', '00000000-0000-0000-0000-000000007062', 'documents', 'Collect documents', 'Identity documents', 'pending', now() + interval '7 days', null, 1);

insert into public.shortlist_items (id, user_id, directory_entry_id, note)
values
  ('00000000-0000-0000-0000-000000007081', '00000000-0000-0000-0000-000000007001', '00000000-0000-0000-0000-000000007051', 'Ask about commute'),
  ('00000000-0000-0000-0000-000000007082', '00000000-0000-0000-0000-000000007002', '00000000-0000-0000-0000-000000007051', 'Ask about commute');

insert into public.provider_requests (id, case_id, directory_entry_id, status, submitted_at, idempotency_key)
values
  ('00000000-0000-0000-0000-000000007091', '00000000-0000-0000-0000-000000007061', '00000000-0000-0000-0000-000000007051', 'submitted', now() - interval '1 hour', 'request-a-0001'),
  ('00000000-0000-0000-0000-000000007092', '00000000-0000-0000-0000-000000007062', '00000000-0000-0000-0000-000000007054', 'submitted', now() - interval '1 hour', 'request-b-0001');

insert into public.consent_records (id, request_id, field_name, consented)
values
  ('00000000-0000-0000-0000-0000000070a1', '00000000-0000-0000-0000-000000007091', 'email', true),
  ('00000000-0000-0000-0000-0000000070a2', '00000000-0000-0000-0000-000000007092', 'email', true);

insert into public.notifications (id, user_id, kind, title, body, read_at, delivery_status, dedupe_key)
values
  ('00000000-0000-0000-0000-0000000070b1', '00000000-0000-0000-0000-000000007001', 'checklist', 'Next step', 'Collect documents', null, 'delivered', 'employee-a-checklist-1'),
  ('00000000-0000-0000-0000-0000000070b2', '00000000-0000-0000-0000-000000007002', 'checklist', 'Next step', 'Collect documents', null, 'delivered', 'employee-b-checklist-1');

insert into public.user_preferences (user_id, timezone, notification_settings, privacy_settings)
values
  ('00000000-0000-0000-0000-000000007001', 'Asia/Kolkata', '{"email":true}'::jsonb, '{"share_contact":false}'::jsonb),
  ('00000000-0000-0000-0000-000000007002', 'Asia/Kolkata', '{"email":false}'::jsonb, '{"share_contact":false}'::jsonb);

select throws_ok(
  $$insert into public.checklist_items (case_id, key, title, state)
    values ('00000000-0000-0000-0000-000000007061'::uuid, 'documents', 'Duplicate', 'pending')$$,
  '23505', null, 'duplicate checklist keys are rejected'
);

select throws_ok(
  $$insert into public.shortlist_items (user_id, directory_entry_id)
    values ('00000000-0000-0000-0000-000000007001'::uuid, '00000000-0000-0000-0000-000000007051'::uuid)$$,
  '23505', null, 'duplicate shortlist rows are rejected'
);

select throws_ok(
  $$insert into public.notifications (user_id, kind, title, body, delivery_status, dedupe_key)
    values ('00000000-0000-0000-0000-000000007001'::uuid, 'checklist', 'Duplicate', 'Duplicate', 'delivered', 'employee-a-checklist-1')$$,
  '23505', null, 'duplicate notification dedupe keys are rejected'
);

select throws_ok(
  $$insert into public.relocation_cases (tenant_id, employee_user_id, destination_city_id, move_date, status, progress_percent)
    values ('00000000-0000-0000-0000-000000007011'::uuid, '00000000-0000-0000-0000-000000007001'::uuid, '00000000-0000-0000-0000-000000007031'::uuid, '2026-11-15', 'active', 101)$$,
  '23514', null, 'progress outside 0..100 is rejected'
);

select throws_ok(
  $$insert into public.checklist_items (case_id, key, title, state, completed_at)
    values ('00000000-0000-0000-0000-000000007061'::uuid, 'invalid-completion', 'Invalid completion', 'completed', null)$$,
  '23514', null, 'completed checklist items require completion timestamps'
);

select throws_ok(
  $$insert into public.directory_entries (provider_id, title, description, published_at, expires_at, status)
      values ('00000000-0000-0000-0000-000000007041'::uuid, 'Invalid expiry', 'Expiry before publication', now(), now() - interval '1 hour', 'published')$$,
  '23514', null, 'directory entries reject expiry before publication'
);

select throws_ok(
  $$insert into public.directory_entries (provider_id, title, description, status)
      values ('00000000-0000-0000-0000-000000007041'::uuid, 'Missing publication', 'Published entries need a publication timestamp', 'published')$$,
  '23514', null, 'published directory entries require publication timestamps'
);

select throws_ok(
  $$insert into public.consent_records (request_id, field_name, consented, withdrawn_at)
      values ('00000000-0000-0000-0000-000000007091'::uuid, 'email', false, now())$$,
  '23514', null, 'withdrawn consent records must preserve a consented decision'
);

select throws_ok(
  $$update public.relocation_cases set status = 'draft'
      where id = '00000000-0000-0000-0000-000000007061'::uuid$$,
  '23514', null, 'invalid relocation status transitions are rejected'
);

select throws_ok(
  $$insert into public.provider_requests (case_id, directory_entry_id, status, submitted_at, idempotency_key)
      values ('00000000-0000-0000-0000-000000007061'::uuid, '00000000-0000-0000-0000-000000007051'::uuid, 'submitted', now(), 'request-a-0002')$$,
  '23505', null, 'duplicate active provider requests are rejected'
);

select throws_ok(
  $$update public.provider_requests set status = 'completed'
      where id = '00000000-0000-0000-0000-000000007091'::uuid$$,
  '23514', null, 'invalid provider request status transitions are rejected'
);

select throws_ok(
  $$insert into public.notifications (user_id, kind, title, body, read_at, delivery_status, dedupe_key)
      values ('00000000-0000-0000-0000-000000007001'::uuid, 'checklist', 'Unread', 'Pending delivery', now(), 'pending', 'employee-a-pending-read')$$,
  '23514', null, 'pending notifications cannot be marked read'
);

insert into public.provider_requests (case_id, directory_entry_id, status, submitted_at, withdrawn_at, idempotency_key)
values ('00000000-0000-0000-0000-000000007061', '00000000-0000-0000-0000-000000007051', 'withdrawn', now() - interval '2 hours', now(), 'request-a-withdrawn');

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000007001';

select is((select count(*) from public.relocation_cases), 1::bigint, 'employee A can read only own relocation case');
select is((select count(*) from public.checklist_items), 1::bigint, 'employee A can read only own checklist');
select is((select count(*) from public.shortlist_items), 1::bigint, 'employee A can read only own shortlist');
select is((select count(*) from public.provider_requests), 2::bigint, 'employee A can read only own provider request history');
select is((select count(*) from public.consent_records), 1::bigint, 'employee A can read only own consent records');
select is((select count(*) from public.notifications), 1::bigint, 'employee A can read only own notifications');
select is((select count(*) from public.user_preferences), 1::bigint, 'employee A can read only own preferences');

select is_empty($$select 1 from public.relocation_cases where id = '00000000-0000-0000-0000-000000007062'::uuid$$, 'employee A cannot read employee B relocation case');
select is_empty($$select 1 from public.relocation_cases where id = '00000000-0000-0000-0000-000000007063'::uuid$$, 'active membership cannot read a suspended tenant relocation case');
select is_empty($$select 1 from public.checklist_items where id = '00000000-0000-0000-0000-000000007072'::uuid$$, 'employee A cannot read employee B checklist');
select is_empty($$select 1 from public.shortlist_items where id = '00000000-0000-0000-0000-000000007082'::uuid$$, 'employee A cannot read employee B shortlist');
select is_empty($$select 1 from public.provider_requests where id = '00000000-0000-0000-0000-000000007092'::uuid$$, 'employee A cannot read employee B request');
select is_empty($$select 1 from public.consent_records where id = '00000000-0000-0000-0000-0000000070a2'::uuid$$, 'employee A cannot read employee B consent');
select is_empty($$select 1 from public.notifications where id = '00000000-0000-0000-0000-0000000070b2'::uuid$$, 'employee A cannot read employee B notification');
select is_empty($$select 1 from public.user_preferences where user_id = '00000000-0000-0000-0000-000000007002'::uuid$$, 'employee A cannot read employee B preferences');

select is((select count(*) from public.cities), 1::bigint, 'employee A can read only the relevant destination city');
select is((select count(*) from public.providers), 1::bigint, 'employee A can read only providers in the relevant city');
select is((select count(*) from public.directory_entries), 1::bigint, 'employee A can read only published non-expired directory entries for the relevant city');
select isnt_empty($$select 1 from public.directory_entries where id = '00000000-0000-0000-0000-000000007051'::uuid$$, 'published directory entry is visible');
select is_empty($$select 1 from public.directory_entries where id in ('00000000-0000-0000-0000-000000007052'::uuid, '00000000-0000-0000-0000-000000007053'::uuid, '00000000-0000-0000-0000-000000007054'::uuid)$$, 'expired, draft, and other-city directory entries are hidden');

select * from finish();
rollback;
