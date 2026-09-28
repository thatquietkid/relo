begin;

create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(42);

select has_table('public', 'tenants', 'tenants table exists');
select has_table('public', 'memberships', 'memberships table exists');
select has_table('public', 'invitations', 'invitations table exists');
select has_table('public', 'roles', 'roles table exists');
select has_table('public', 'membership_roles', 'membership_roles table exists');
select has_table('public', 'audit_logs', 'audit_logs table exists');
select has_table('public', 'idempotency_keys', 'idempotency_keys table exists');
select ok(to_regclass('public.invitation_views') is not null, 'safe invitation view exists');

select ok((select relrowsecurity from pg_class where oid = 'public.tenants'::regclass), 'RLS enabled on tenants');
select ok((select relrowsecurity from pg_class where oid = 'public.memberships'::regclass), 'RLS enabled on memberships');
select ok((select relrowsecurity from pg_class where oid = 'public.roles'::regclass), 'RLS enabled on roles');
select ok((select relrowsecurity from pg_class where oid = 'public.membership_roles'::regclass), 'RLS enabled on membership_roles');
select ok((select relrowsecurity from pg_class where oid = 'public.invitations'::regclass), 'RLS enabled on invitations');
select ok((select relrowsecurity from pg_class where oid = 'public.audit_logs'::regclass), 'RLS enabled on audit_logs');
select ok((select relrowsecurity from pg_class where oid = 'public.idempotency_keys'::regclass), 'RLS enabled on idempotency_keys');

select policies_are('public', 'tenants', array['members can view same tenant']);
select policies_are('public', 'memberships', array['members can view same tenant memberships']);
select policies_are('public', 'roles', array['authenticated users can view roles']);
select policies_are('public', 'membership_roles', array['members can view assigned roles']);
select policies_are('public', 'invitations', array['tenant HR can view invitations']);
select policies_are('public', 'audit_logs', array['tenant admins can view audit logs']);
select policies_are('public', 'idempotency_keys', array['actors can use idempotency keys', 'actors can create idempotency keys']);

select ok(not has_table_privilege('authenticated', 'public.invitations', 'SELECT'), 'raw invitations table SELECT is revoked for authenticated');
select ok(not has_column_privilege('authenticated', 'public.invitations', 'token_hash', 'SELECT'), 'invitation token_hash SELECT is revoked for authenticated');
select ok(not exists (
  select 1
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'invitation_views'
     and column_name = 'token_hash'
), 'safe invitation view omits token_hash');

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000101', 'identity-test-one@example.com'),
  ('00000000-0000-0000-0000-000000000202', 'identity-test-two@example.com')
on conflict (id) do nothing;

insert into public.tenants (id, name, slug)
values
  ('00000000-0000-0000-0000-000000000001', 'Tenant One', 'tenant-one'),
  ('00000000-0000-0000-0000-000000000002', 'Tenant Two', 'tenant-two');

insert into public.memberships (id, tenant_id, user_id, status)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 'active'),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000202', 'active'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000101', 'suspended');

insert into public.membership_roles (membership_id, role_id)
select '00000000-0000-0000-0000-000000000011'::uuid, id
  from public.roles
 where key = 'hr';

insert into public.membership_roles (membership_id, role_id)
select '00000000-0000-0000-0000-000000000013'::uuid, id
  from public.roles
 where key = 'employee';

insert into public.invitations (id, tenant_id, email, role_key, token_hash, expires_at, invited_by)
values (
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000002',
  'invitee@example.com',
  'employee',
  public.hash_invitation_token('identity-test-invitation'),
  now() + interval '1 day',
  '00000000-0000-0000-0000-000000000202'
);

insert into public.invitations (id, tenant_id, email, role_key, token_hash, expires_at, invited_by)
values (
  '00000000-0000-0000-0000-000000000302',
  '00000000-0000-0000-0000-000000000001',
  'safe-invitee@example.com',
  'employee',
  public.hash_invitation_token('identity-test-safe-invitation'),
  now() + interval '1 day',
  '00000000-0000-0000-0000-000000000101'
);

insert into public.audit_logs (id, tenant_id, actor_user_id, action, resource_type, metadata)
values (
  '00000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000202',
  'member.invited',
  'invitation',
  '{}'::jsonb
);

insert into public.idempotency_keys (id, tenant_id, actor_user_id, key, request_hash, response_status, response_body, expires_at)
values (
  '00000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000202',
  'invite-0001',
  public.hash_invitation_token('identity-test-request'),
  201,
  '{"accepted":true}'::jsonb,
  now() + interval '1 day'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000101';

select ok(public.has_role('00000000-0000-0000-0000-000000000001'::uuid, 'hr'), 'has_role allows a role in the requested tenant');
select ok(not public.has_role('00000000-0000-0000-0000-000000000002'::uuid, 'hr'), 'has_role denies a role from another tenant');

select isnt_empty(
  $$select id from public.invitation_views where id = '00000000-0000-0000-0000-000000000302'::uuid$$,
  'HR can read the safe invitation view'
);

select throws_ok(
  $$select token_hash from public.invitations where id = '00000000-0000-0000-0000-000000000302'::uuid$$,
  '42501',
  null,
  'HR cannot read invitation token_hash from the raw table'
);

select is_empty(
  $$select 1 from public.tenants where id = '00000000-0000-0000-0000-000000000002'::uuid$$,
  'a member cannot read another tenant'
);

select is_empty(
  $$select 1 from public.memberships where id = '00000000-0000-0000-0000-000000000013'::uuid$$,
  'a member cannot read another user membership'
);

select is_empty(
  $$select 1 from public.memberships where id = '00000000-0000-0000-0000-000000000012'::uuid$$,
  'a suspended membership is hidden from its own authenticated user'
);

select is_empty(
  $$select 1 from public.invitations where id = '00000000-0000-0000-0000-000000000301'::uuid$$,
  'a non-HR member cannot read invitations'
);

select is_empty(
  $$select 1 from public.audit_logs where id = '00000000-0000-0000-0000-000000000401'::uuid$$,
  'a non-admin member cannot read audit logs'
);

select is_empty(
  $$select 1 from public.membership_roles where membership_id = '00000000-0000-0000-0000-000000000013'::uuid$$,
  'a member cannot read another tenant membership roles'
);

select isnt_empty(
  $$select 1 from public.roles where key = 'employee'$$,
  'authenticated users can read static role definitions'
);

select is_empty(
  $$select 1 from public.idempotency_keys where id = '00000000-0000-0000-0000-000000000501'::uuid$$,
  'a member cannot read another tenant idempotency keys'
);

select throws_ok(
  $$insert into public.membership_roles (membership_id, role_id)
    select '00000000-0000-0000-0000-000000000011'::uuid, id from public.roles where key = 'admin'$$,
  '42501',
  null,
  'authenticated users cannot insert membership roles'
);

select throws_ok(
  $$update public.membership_roles set role_id = role_id
      where membership_id = '00000000-0000-0000-0000-000000000013'::uuid$$,
  '42501',
  null,
  'authenticated users cannot update membership roles'
);

select throws_ok(
  $$delete from public.membership_roles
      where membership_id = '00000000-0000-0000-0000-000000000013'::uuid$$,
  '42501',
  null,
  'authenticated users cannot delete membership roles'
);

set local role anon;
select throws_ok(
  $$select 1 from public.tenants$$,
  '42501',
  null,
  'anonymous users cannot read tenants'
);

select throws_ok(
  $$select 1 from public.invitation_views$$,
  '42501',
  null,
  'anonymous users cannot read the safe invitation view'
);

select * from finish();
rollback;
