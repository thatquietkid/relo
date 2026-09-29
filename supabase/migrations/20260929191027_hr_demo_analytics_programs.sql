set search_path = public, extensions, pg_catalog;

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  destination_city_id uuid not null references public.cities(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint programs_date_range check (ends_at > starts_at)
);

create unique index if not exists programs_tenant_name_unique on public.programs (tenant_id, lower(name));
create index if not exists programs_tenant_status_idx on public.programs (tenant_id, status, starts_at desc);

alter table public.programs enable row level security;
alter table public.programs force row level security;
revoke all on table public.programs from public, anon;
grant select, insert, update on public.programs to authenticated;
grant all on public.programs to service_role;

drop policy if exists "tenant operators can view programs" on public.programs;
create policy "tenant operators can view programs" on public.programs
  for select to authenticated using (public.operations_can_access_tenant(tenant_id));
drop policy if exists "tenant operators can create programs" on public.programs;
create policy "tenant operators can create programs" on public.programs
  for insert to authenticated with check (public.operations_can_access_tenant(tenant_id) and created_by = auth.uid());
drop policy if exists "tenant operators can update programs" on public.programs;
create policy "tenant operators can update programs" on public.programs
  for update to authenticated using (public.operations_can_access_tenant(tenant_id))
  with check (public.operations_can_access_tenant(tenant_id));

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.programs'::regclass and tgname = 'programs_set_updated_at') then
    create trigger programs_set_updated_at before update on public.programs for each row execute function public.set_updated_at();
  end if;
end;
$$;

create table if not exists public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  aggregate_type text not null check (length(btrim(aggregate_type)) between 1 and 80),
  aggregate_id uuid not null,
  event_type text not null check (length(btrim(event_type)) between 1 and 120),
  event_version integer not null default 1 check (event_version > 0),
  trace_id text not null check (length(btrim(trace_id)) between 1 and 200),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists outbox_events_tenant_idx on public.outbox_events (tenant_id, occurred_at desc);
alter table public.outbox_events enable row level security;
alter table public.outbox_events force row level security;
revoke all on table public.outbox_events from public, anon;
grant select on public.outbox_events to authenticated;
grant all on public.outbox_events to service_role;
drop policy if exists "tenant operators can view growth events" on public.outbox_events;
create policy "tenant operators can view growth events" on public.outbox_events
  for select to authenticated using (public.operations_can_access_tenant(tenant_id));

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
alter table public.report_exports enable row level security;
alter table public.report_exports force row level security;
revoke all on table public.report_exports from public, anon;
grant select, insert on public.report_exports to authenticated;
grant all on public.report_exports to service_role;
drop policy if exists "tenant operators can view report exports" on public.report_exports;
create policy "tenant operators can view report exports" on public.report_exports
  for select to authenticated using (public.operations_can_access_tenant(tenant_id) and requested_by = auth.uid());
drop policy if exists "tenant operators can create report exports" on public.report_exports;
create policy "tenant operators can create report exports" on public.report_exports
  for insert to authenticated with check (public.operations_can_access_tenant(tenant_id) and requested_by = auth.uid());
