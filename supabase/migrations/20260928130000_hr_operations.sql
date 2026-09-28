set search_path = public, extensions, pg_catalog;

create table if not exists public.tenant_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  timezone text not null default 'UTC' check (length(btrim(timezone)) between 1 and 80),
  notification_settings jsonb not null default '{"email": true, "inApp": true}'::jsonb
    check (jsonb_typeof(notification_settings) = 'object'),
  default_program_status text not null default 'draft' check (default_program_status in ('draft', 'active')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists tenant_settings_updated_at_idx on public.tenant_settings (updated_at desc);

alter table public.tenant_settings enable row level security;
alter table public.tenant_settings force row level security;

revoke all on table public.tenant_settings from public, anon;
grant select, insert, update on public.tenant_settings to authenticated;
grant all on public.tenant_settings to service_role;

create policy "tenant operators can view settings"
  on public.tenant_settings for select to authenticated
  using (public.operations_can_access_tenant(tenant_id));

create policy "tenant operators can create settings"
  on public.tenant_settings for insert to authenticated
  with check (public.operations_can_access_tenant(tenant_id) and updated_by = auth.uid());

create policy "tenant operators can update settings"
  on public.tenant_settings for update to authenticated
  using (public.operations_can_access_tenant(tenant_id))
  with check (public.operations_can_access_tenant(tenant_id) and updated_by = auth.uid());

create or replace function public.audit_tenant_settings_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (
    new.tenant_id,
    coalesce(new.updated_by, auth.uid()),
    case when tg_op = 'INSERT' then 'tenant.settings_created' else 'tenant.settings_updated' end,
    'tenant_settings',
    new.tenant_id,
    jsonb_build_object(
      'timezone', new.timezone,
      'notification_settings', new.notification_settings,
      'default_program_status', new.default_program_status
    )
  );
  return new;
end;
$$;

revoke all on function public.audit_tenant_settings_change() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.tenant_settings'::regclass
       and tgname = 'tenant_settings_set_updated_at'
  ) then
    create trigger tenant_settings_set_updated_at
      before update on public.tenant_settings
      for each row execute function public.set_updated_at();
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.tenant_settings'::regclass
       and tgname = 'tenant_settings_audit'
  ) then
    create trigger tenant_settings_audit
      after insert or update on public.tenant_settings
      for each row execute function public.audit_tenant_settings_change();
  end if;
end;
$$;

grant update on public.provider_requests to authenticated;

create policy "tenant operators can view provider requests"
  on public.provider_requests for select to authenticated
  using (
    exists (
      select 1
        from public.relocation_cases rc
       where rc.id = provider_requests.case_id
         and public.operations_can_access_tenant(rc.tenant_id)
    )
  );

create policy "tenant operators can update provider requests"
  on public.provider_requests for update to authenticated
  using (
    exists (
      select 1
        from public.relocation_cases rc
       where rc.id = provider_requests.case_id
         and public.operations_can_access_tenant(rc.tenant_id)
    )
  )
  with check (
    exists (
      select 1
        from public.relocation_cases rc
       where rc.id = provider_requests.case_id
         and public.operations_can_access_tenant(rc.tenant_id)
    )
  );

create policy "tenant operators can view request providers"
  on public.providers for select to authenticated
  using (
    exists (
      select 1
        from public.provider_requests pr
        join public.relocation_cases rc on rc.id = pr.case_id
       where pr.directory_entry_id in (select de.id from public.directory_entries de where de.provider_id = providers.id)
         and public.operations_can_access_tenant(rc.tenant_id)
    )
  );

create policy "tenant operators can view request directory entries"
  on public.directory_entries for select to authenticated
  using (
    exists (
      select 1
        from public.provider_requests pr
        join public.relocation_cases rc on rc.id = pr.case_id
       where pr.directory_entry_id = directory_entries.id
         and public.operations_can_access_tenant(rc.tenant_id)
    )
  );

grant execute on function public.audit_tenant_settings_change() to service_role;
