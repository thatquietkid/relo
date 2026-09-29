set search_path = '';

create or replace function public.operations_can_access_tenant(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin()
      or exists (
        select 1
          from public.memberships m
          join public.membership_roles mr on mr.membership_id = m.id
          join public.roles r on r.id = mr.role_id
          join public.tenants t on t.id = m.tenant_id and t.status = 'active'
         where m.tenant_id = p_tenant_id
           and m.user_id = auth.uid()
           and m.status = 'active'
           and r.key in ('hr', 'admin')
      );
$$;

revoke all on function public.operations_can_access_tenant(uuid) from public, anon, authenticated;
grant execute on function public.operations_can_access_tenant(uuid) to authenticated, service_role;