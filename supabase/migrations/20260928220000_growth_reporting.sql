set search_path = public, extensions, pg_catalog;

create table if not exists public.reviewer_settings (
  reviewer_user_id uuid primary key references auth.users(id) on delete cascade,
  city_ids uuid[] not null default '{}',
  categories text[] not null default '{}',
  timezone text not null default 'UTC' check (length(btrim(timezone)) between 1 and 80),
  notification_settings jsonb not null default '{"email": true, "inApp": true}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.report_exports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  from_at timestamptz not null,
  to_at timestamptz not null,
  idempotency_key text not null check (idempotency_key ~ '^[\x21-\x7e]{8,128}$'),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  output_path text,
  constraint report_exports_window check (to_at > from_at)
);

create unique index if not exists report_exports_request_unique on public.report_exports (tenant_id, requested_by, idempotency_key);
create index if not exists report_exports_tenant_requested_idx on public.report_exports (tenant_id, requested_at desc);

alter table public.reviewer_settings enable row level security;
alter table public.reviewer_settings force row level security;
alter table public.report_exports enable row level security;
alter table public.report_exports force row level security;

revoke all on table public.reviewer_settings, public.report_exports from public, anon;
grant select, insert, update on public.reviewer_settings to authenticated;
grant select, insert on public.report_exports to authenticated;
grant all on public.reviewer_settings, public.report_exports to service_role;
grant select on public.outbox_events to authenticated;

create policy "reviewers can view own settings" on public.reviewer_settings
  for select to authenticated using (reviewer_user_id = auth.uid());
create policy "reviewers can create own settings" on public.reviewer_settings
  for insert to authenticated with check (reviewer_user_id = auth.uid());
create policy "reviewers can update own settings" on public.reviewer_settings
  for update to authenticated using (reviewer_user_id = auth.uid()) with check (reviewer_user_id = auth.uid());

create policy "tenant operators can view report exports" on public.report_exports
  for select to authenticated using (public.operations_can_access_tenant(tenant_id) and requested_by = auth.uid());
create policy "tenant operators can create report exports" on public.report_exports
  for insert to authenticated with check (public.operations_can_access_tenant(tenant_id) and requested_by = auth.uid());

create policy "tenant operators can view growth events" on public.outbox_events
  for select to authenticated using (public.operations_can_access_tenant(tenant_id));

grant insert, update on public.providers, public.directory_entries to authenticated;

create or replace function public.reviewer_can_access_provider(p_provider_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.providers p
     where p.id = p_provider_id
       and public.reviewer_can_access_scope(p.city_id, p.category)
  );
$$;

create or replace function public.reviewer_can_access_directory_entry(p_entry_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_catalog
as $$
  select exists (
    select 1
      from public.directory_entries de
      join public.providers p on p.id = de.provider_id
     where de.id = p_entry_id
       and public.reviewer_can_access_scope(p.city_id, p.category)
  );
$$;

revoke all on function public.reviewer_can_access_provider(uuid) from public, anon, authenticated;
revoke all on function public.reviewer_can_access_directory_entry(uuid) from public, anon, authenticated;
grant execute on function public.reviewer_can_access_provider(uuid) to authenticated, service_role;
grant execute on function public.reviewer_can_access_directory_entry(uuid) to authenticated, service_role;

create policy "reviewers can view scoped providers" on public.providers
  for select to authenticated using (public.reviewer_can_access_provider(id));
create policy "reviewers can create scoped providers" on public.providers
  for insert to authenticated with check (public.reviewer_can_access_scope(city_id, category));
create policy "reviewers can update scoped providers" on public.providers
  for update to authenticated using (public.reviewer_can_access_provider(id)) with check (public.reviewer_can_access_scope(city_id, category));

create policy "reviewers can view scoped directory entries" on public.directory_entries
  for select to authenticated using (public.reviewer_can_access_directory_entry(id));
create policy "reviewers can create scoped directory entries" on public.directory_entries
  for insert to authenticated with check (public.reviewer_can_access_provider(provider_id));
create policy "reviewers can update scoped directory entries" on public.directory_entries
  for update to authenticated using (public.reviewer_can_access_directory_entry(id))
  with check (public.reviewer_can_access_provider(provider_id));

create or replace function public.audit_directory_publication()
returns trigger language plpgsql security definer set search_path = public, pg_catalog
as $$
begin
  if old.status is distinct from new.status and new.status in ('published', 'archived') then
    insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
    select m.tenant_id, auth.uid(), case when new.status = 'published' then 'directory.entry_published' else 'directory.entry_unpublished' end, 'directory_entry', new.id,
           jsonb_build_object('reason', case when new.status = 'archived' then 'reviewer_action' else null end)
      from public.memberships m
     where m.user_id = auth.uid() and m.status = 'active'
     order by m.joined_at
     limit 1;
  end if;
  return new;
end;
$$;

revoke all on function public.audit_directory_publication() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.reviewer_settings'::regclass and tgname = 'reviewer_settings_set_updated_at') then
    create trigger reviewer_settings_set_updated_at before update on public.reviewer_settings for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.directory_entries'::regclass and tgname = 'directory_entries_publication_audit') then
    create trigger directory_entries_publication_audit after update of status on public.directory_entries for each row execute function public.audit_directory_publication();
  end if;
end;
$$;
