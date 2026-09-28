begin;

create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(24);

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

select has_rls('public', 'programs');
select has_rls('public', 'program_memberships');
select has_rls('public', 'invitation_batches');
select has_rls('public', 'invitation_batch_items');
select has_rls('public', 'review_assignments');
select has_rls('public', 'feature_flags');
select has_rls('public', 'support_cases');

select ok((select relforcerowsecurity from pg_class where oid = 'public.programs'::regclass), 'programs force RLS');
select ok(to_regclass('public.programs_tenant_status_idx') is not null, 'programs have tenant status index');
select ok(to_regclass('public.review_assignments_reviewer_scope_unique') is not null, 'review assignments prevent duplicate scope');
select ok(to_regprocedure('public.operations_can_access_tenant(uuid)') is not null, 'operations tenant helper exists');
select ok(to_regprocedure('public.reviewer_can_access_scope(uuid,text)') is not null, 'reviewer scope helper exists');

select * from finish();
rollback;
