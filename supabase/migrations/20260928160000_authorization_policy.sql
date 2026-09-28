set search_path = public, extensions, pg_catalog;

insert into public.roles (key)
values ('platform_admin')
on conflict (key) do nothing;

create table if not exists public.platform_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_key text not null default 'platform_admin' references public.roles(key),
  created_at timestamptz not null default now(),
  constraint platform_admin_users_role check (role_key = 'platform_admin')
);

create or replace function public.get_authorization_memberships()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'tenant_id', m.tenant_id,
        'user_id', m.user_id,
        'status', m.status,
        'joined_at', m.joined_at,
        'suspended_at', m.suspended_at,
        'tenant', jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'slug', t.slug,
          'status', t.status
        ),
        'roles', coalesce((
          select jsonb_agg(jsonb_build_object('id', r.id, 'key', r.key) order by r.key)
            from public.membership_roles as mr
            join public.roles as r on r.id = mr.role_id
           where mr.membership_id = m.id
        ), '[]'::jsonb)
      ) order by m.id
    ),
    '[]'::jsonb
  )
    from public.memberships as m
    join public.tenants as t on t.id = m.tenant_id
   where m.user_id = auth.uid();
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
      from public.platform_admin_users as pau
     where pau.user_id = auth.uid()
       and pau.role_key = 'platform_admin'
  );
$$;

revoke all on function public.get_authorization_memberships() from public, anon, authenticated;
revoke all on function public.is_platform_admin() from public, anon, authenticated;
grant execute on function public.get_authorization_memberships() to authenticated, service_role;
grant execute on function public.is_platform_admin() to authenticated, service_role;

alter table public.platform_admin_users enable row level security;
revoke all on table public.platform_admin_users from public, anon, authenticated;
grant select, insert, update, delete on public.platform_admin_users to service_role;
