begin;

create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(23);

select ok(to_regprocedure('public.get_authorization_memberships()') is not null, 'authorization membership RPC exists');
select ok(to_regprocedure('public.is_platform_admin()') is not null, 'platform scope RPC exists');
select ok((select prosecdef from pg_proc where oid = 'public.get_authorization_memberships()'::regprocedure), 'membership RPC is security definer');
select ok((select prosecdef from pg_proc where oid = 'public.is_platform_admin()'::regprocedure), 'platform scope RPC is security definer');
select ok((select proconfig @> array['search_path=public, pg_catalog'] from pg_proc where oid = 'public.get_authorization_memberships()'::regprocedure), 'membership RPC fixes search_path');
select ok((select proconfig @> array['search_path=public, pg_catalog'] from pg_proc where oid = 'public.is_platform_admin()'::regprocedure), 'platform scope RPC fixes search_path');
select ok(has_function_privilege('authenticated', 'public.get_authorization_memberships()', 'EXECUTE'), 'authenticated can execute membership RPC');
select ok(not has_function_privilege('anon', 'public.get_authorization_memberships()', 'EXECUTE'), 'anonymous cannot execute membership RPC');
select ok(has_function_privilege('authenticated', 'public.is_platform_admin()', 'EXECUTE'), 'authenticated can execute platform scope RPC');
select ok(not has_function_privilege('anon', 'public.is_platform_admin()', 'EXECUTE'), 'anonymous cannot execute platform scope RPC');
select ok(to_regclass('public.platform_admin_users') is not null, 'platform admin assignment table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.platform_admin_users'::regclass), 'platform admin assignment table has RLS');
select ok(to_regclass('public.roles') is not null and exists (select 1 from public.roles where key = 'admin'), 'tenant admin role remains defined');
select ok(exists (select 1 from public.roles where key = 'platform_admin'), 'platform admin role is defined separately');
select ok(position('auth.uid()' in pg_get_functiondef('public.get_authorization_memberships()'::regprocedure)) > 0, 'membership RPC is bound to auth.uid');
select ok(position('p_user' in pg_get_functiondef('public.get_authorization_memberships()'::regprocedure)) = 0, 'membership RPC has no user supplied identity parameter');

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000601', 'authorization-test-one@example.com'),
  ('00000000-0000-0000-0000-000000000602', 'authorization-test-two@example.com')
on conflict (id) do nothing;

insert into public.tenants (id, name, slug)
values
  ('00000000-0000-0000-0000-000000000601', 'Authorization Tenant One', 'authorization-tenant-one'),
  ('00000000-0000-0000-0000-000000000602', 'Authorization Tenant Two', 'authorization-tenant-two'),
  ('00000000-0000-0000-0000-000000000603', 'Authorization Tenant Three', 'authorization-tenant-three');

insert into public.memberships (id, tenant_id, user_id, status, suspended_at)
values
  ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000601', 'active', null),
  ('00000000-0000-0000-0000-000000000612', '00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000601', 'suspended', now()),
  ('00000000-0000-0000-0000-000000000613', '00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000601', 'revoked', null),
  ('00000000-0000-0000-0000-000000000614', '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000602', 'active', null);

insert into public.membership_roles (membership_id, role_id)
select membership_id, (select id from public.roles where key = 'employee')
  from (values
    ('00000000-0000-0000-0000-000000000611'::uuid),
    ('00000000-0000-0000-0000-000000000612'::uuid),
    ('00000000-0000-0000-0000-000000000613'::uuid),
    ('00000000-0000-0000-0000-000000000614'::uuid)
  ) as memberships(membership_id);

insert into public.platform_admin_users (user_id)
values ('00000000-0000-0000-0000-000000000602');

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000601';

select is(
  (select count(*) from jsonb_array_elements(public.get_authorization_memberships())),
  3::bigint,
  'authorization membership RPC returns active, suspended, and revoked memberships'
);
select is(
  (select count(*) from jsonb_array_elements(public.get_authorization_memberships()) as item where item->>'status' = 'active'),
  1::bigint,
  'authorization membership RPC returns active membership'
);
select is(
  (select count(*) from jsonb_array_elements(public.get_authorization_memberships()) as item where item->>'status' = 'suspended'),
  1::bigint,
  'authorization membership RPC returns suspended membership'
);
select is(
  (select count(*) from jsonb_array_elements(public.get_authorization_memberships()) as item where item->>'status' = 'revoked'),
  1::bigint,
  'authorization membership RPC returns revoked membership'
);
select is(
  (select count(*) from jsonb_array_elements(public.get_authorization_memberships()) as item where item->>'user_id' <> '00000000-0000-0000-0000-000000000601'),
  0::bigint,
  'authorization membership RPC denies cross-user rows'
);
select ok(not public.is_platform_admin(), 'a non-platform user has no platform scope');

set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000602';
select ok(public.is_platform_admin(), 'a controlled platform assignment grants platform scope');

select * from finish();
rollback;
