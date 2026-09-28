begin;

create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(25);

select has_table('public', 'programs', 'programs table exists');
select has_table('public', 'program_memberships', 'program memberships table exists');
select has_table('public', 'invitation_batches', 'invitation batches table exists');
select has_table('public', 'invitation_batch_items', 'invitation batch items table exists');
select has_table('public', 'review_assignments', 'review assignments table exists');
select has_table('public', 'feature_flags', 'feature flags table exists');
select has_table('public', 'support_cases', 'support cases table exists');

select has_column('public', 'programs', 'tenant_id', 'programs are tenant scoped');
select has_column('public', 'programs', 'destination_city_id', 'programs target a destination city');
select has_column('public', 'invitation_batches', 'created_by', 'invitation batches record their actor');
select has_column('public', 'review_assignments', 'reviewer_user_id', 'review assignments are user scoped');
select has_column('public', 'feature_flags', 'config', 'feature flags retain structured configuration');
select has_column('public', 'support_cases', 'assigned_to', 'support cases retain assignment');

select ok((select relrowsecurity from pg_class where oid = 'public.programs'::regclass), 'programs have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.program_memberships'::regclass), 'program memberships have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.invitation_batches'::regclass), 'invitation batches have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.invitation_batch_items'::regclass), 'invitation batch items have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.review_assignments'::regclass), 'review assignments have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.feature_flags'::regclass), 'feature flags have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.support_cases'::regclass), 'support cases have RLS');

select ok((select relforcerowsecurity from pg_class where oid = 'public.programs'::regclass), 'programs force RLS');
select ok(to_regclass('public.programs_tenant_status_idx') is not null, 'programs have tenant status index');
select ok(to_regclass('public.review_assignments_reviewer_scope_unique') is not null, 'review assignments prevent duplicate scope');
select ok(to_regprocedure('public.operations_can_access_tenant(uuid)') is not null, 'operations tenant helper exists');
select ok(to_regprocedure('public.reviewer_can_access_scope(uuid,text)') is not null, 'reviewer scope helper exists');

select * from finish();
rollback;
