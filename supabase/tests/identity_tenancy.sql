select plan(18);

-- Required foundation assertions from the Task 3 brief.
select has_table('public.tenants');
select has_table('public.memberships');
select has_table('public.invitations');
select has_rls('public.memberships');
select policy_exists('public.memberships', 'members can view same tenant memberships');

select has_table('public.roles');
select has_table('public.membership_roles');
select has_table('public.audit_logs');
select has_table('public.idempotency_keys');
select has_rls('public.tenants');
select has_rls('public.invitations');
select has_rls('public.roles');
select has_rls('public.membership_roles');
select has_rls('public.audit_logs');
select has_rls('public.idempotency_keys');

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000101', 'identity-test-one@example.com'),
  ('00000000-0000-0000-0000-000000000202', 'identity-test-two@example.com')
on conflict (id) do nothing;

-- The fixture is created as the test owner, then queried as a normal user.
insert into public.tenants (id, name, slug)
values
  ('00000000-0000-0000-0000-000000000001', 'Tenant One', 'tenant-one'),
  ('00000000-0000-0000-0000-000000000002', 'Tenant Two', 'tenant-two');

insert into public.memberships (id, tenant_id, user_id, status)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 'active'),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000202', 'active'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000101', 'suspended');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);

select is_empty(
  $$select 1
    from public.memberships
   where id = '00000000-0000-0000-0000-000000000013'::uuid$$,
  'a member cannot read memberships from another tenant'
);

select is_empty(
  $$select 1
    from public.memberships
   where id = '00000000-0000-0000-0000-000000000012'::uuid$$,
  'a suspended membership is hidden from its own authenticated user'
);

set local role anon;
select is_empty(
  $$select 1 from public.tenants$$,
  'anonymous tenant data is not exposed'
);

select * from finish();
