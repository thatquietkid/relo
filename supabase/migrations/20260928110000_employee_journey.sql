set search_path = public, extensions, pg_catalog;

create table if not exists public.relocation_cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  employee_user_id uuid not null,
  destination_city_id uuid not null,
  move_date date not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'cancelled')),
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  key text not null check (length(btrim(key)) between 1 and 100),
  title text not null check (length(btrim(title)) between 1 and 200),
  description text,
  state text not null default 'pending' check (state in ('pending', 'in_progress', 'completed', 'skipped')),
  due_at timestamptz,
  completed_at timestamptz,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checklist_completion_state check (
    (state = 'completed' and completed_at is not null)
    or (state <> 'completed' and completed_at is null)
  )
);

create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  name text not null check (length(btrim(name)) between 1 and 160),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  timezone text not null check (length(btrim(timezone)) between 1 and 80),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null,
  category text not null check (length(btrim(category)) between 1 and 100),
  name text not null check (length(btrim(name)) between 1 and 200),
  summary text not null check (length(btrim(summary)) between 1 and 1000),
  contact_policy text not null default 'employee_request' check (contact_policy in ('employee_request', 'no_direct_contact')),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.directory_entries (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 240),
  description text not null check (length(btrim(description)) between 1 and 4000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  source_url text,
  published_at timestamptz,
  expires_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint directory_entry_expiry_after_publish check (expires_at is null or published_at is null or expires_at > published_at),
  constraint directory_entry_publish_state check (status <> 'published' or published_at is not null)
);

create table if not exists public.shortlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  directory_entry_id uuid not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_requests (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  directory_entry_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'in_review', 'approved', 'in_progress', 'completed', 'withdrawn', 'rejected')),
  submitted_at timestamptz,
  withdrawn_at timestamptz,
  idempotency_key text not null check (idempotency_key ~ '^[[:graph:]]{8,128}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_request_submission_state check (
    (status = 'draft' and submitted_at is null)
    or (status <> 'draft' and submitted_at is not null)
  ),
  constraint provider_request_withdrawal_state check (
    (status = 'withdrawn' and withdrawn_at is not null)
    or (status <> 'withdrawn' and withdrawn_at is null)
  )
);

create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  field_name text not null check (length(btrim(field_name)) between 1 and 100),
  consented boolean not null,
  recorded_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  constraint consent_withdrawal_state check (withdrawn_at is null or consented)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null check (length(btrim(kind)) between 1 and 100),
  title text not null check (length(btrim(title)) between 1 and 240),
  body text not null check (length(btrim(body)) between 1 and 4000),
  read_at timestamptz,
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'delivered', 'failed', 'suppressed')),
  dedupe_key text not null check (length(btrim(dedupe_key)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_read_state check (read_at is null or delivery_status = 'delivered')
);

create table if not exists public.user_preferences (
  user_id uuid primary key,
  timezone text not null check (length(btrim(timezone)) between 1 and 80),
  notification_settings jsonb not null default '{}'::jsonb check (jsonb_typeof(notification_settings) = 'object'),
  privacy_settings jsonb not null default '{}'::jsonb check (jsonb_typeof(privacy_settings) = 'object'),
  updated_at timestamptz not null default now()
);

create unique index if not exists cities_slug_unique on public.cities (slug);
create unique index if not exists checklist_items_case_key_unique on public.checklist_items (case_id, key);
create unique index if not exists shortlist_items_user_entry_unique on public.shortlist_items (user_id, directory_entry_id);
create unique index if not exists provider_requests_active_identity
  on public.provider_requests (case_id, directory_entry_id)
  where status <> 'withdrawn';
create unique index if not exists notifications_dedupe_key_unique on public.notifications (dedupe_key);

create index if not exists relocation_cases_tenant_idx on public.relocation_cases (tenant_id);
create index if not exists relocation_cases_employee_idx on public.relocation_cases (employee_user_id);
create index if not exists relocation_cases_destination_idx on public.relocation_cases (destination_city_id);
create index if not exists checklist_items_case_idx on public.checklist_items (case_id, sort_order);
create index if not exists cities_status_idx on public.cities (status);
create index if not exists providers_city_idx on public.providers (city_id, status, category);
create index if not exists directory_entries_published_idx on public.directory_entries (provider_id, status, published_at desc) where status = 'published';
create index if not exists directory_entries_expiry_idx on public.directory_entries (expires_at);
create index if not exists shortlist_items_user_idx on public.shortlist_items (user_id, created_at desc);
create index if not exists provider_requests_status_idx on public.provider_requests (case_id, status, updated_at desc);
create index if not exists consent_records_request_idx on public.consent_records (request_id, field_name);
create index if not exists notifications_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;

create or replace function public.employee_can_access_case(p_case_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
      from public.relocation_cases rc
      join public.memberships m on m.tenant_id = rc.tenant_id
       and m.user_id = rc.employee_user_id
       and m.status = 'active'
      join public.tenants t on t.id = rc.tenant_id and t.status = 'active'
     where rc.id = p_case_id
       and rc.employee_user_id = auth.uid()
       and rc.status <> 'cancelled'
  );
$$;

create or replace function public.employee_can_access_tenant(p_tenant_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
      from public.memberships m
      join public.tenants t on t.id = m.tenant_id
       and t.status = 'active'
     where m.tenant_id = p_tenant_id
       and m.user_id = auth.uid()
       and m.status = 'active'
  );
$$;

create or replace function public.employee_can_access_city(p_city_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
      from public.relocation_cases rc
      join public.memberships m on m.tenant_id = rc.tenant_id
       and m.user_id = rc.employee_user_id
       and m.status = 'active'
      join public.tenants t on t.id = rc.tenant_id and t.status = 'active'
     where rc.destination_city_id = p_city_id
       and rc.employee_user_id = auth.uid()
       and rc.status <> 'cancelled'
  );
$$;

create or replace function public.employee_can_access_user(p_user_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_catalog
as $$
  select p_user_id = auth.uid()
    and exists (
      select 1
        from public.memberships m
        join public.tenants t on t.id = m.tenant_id and t.status = 'active'
       where m.user_id = auth.uid()
         and m.status = 'active'
    );
$$;

create or replace function public.employee_can_view_directory_entry(
  p_provider_id uuid,
  p_status text,
  p_published_at timestamptz,
  p_expires_at timestamptz
)
returns boolean language sql stable security definer
set search_path = public, pg_catalog
as $$
  select p_status = 'published'
    and p_published_at is not null
    and p_published_at <= now()
    and (p_expires_at is null or p_expires_at > now())
    and exists (
      select 1
        from public.providers p
        join public.cities c on c.id = p.city_id
       where p.id = p_provider_id
         and p.status = 'active'
         and c.status = 'active'
         and public.employee_can_access_city(p.city_id)
    );
$$;

revoke all on function public.employee_can_access_case(uuid) from public, anon, authenticated;
revoke all on function public.employee_can_access_tenant(uuid) from public, anon, authenticated;
revoke all on function public.employee_can_access_city(uuid) from public, anon, authenticated;
revoke all on function public.employee_can_access_user(uuid) from public, anon, authenticated;
revoke all on function public.employee_can_view_directory_entry(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.employee_can_access_case(uuid) to authenticated, service_role;
grant execute on function public.employee_can_access_tenant(uuid) to authenticated, service_role;
grant execute on function public.employee_can_access_city(uuid) to authenticated, service_role;
grant execute on function public.employee_can_access_user(uuid) to authenticated, service_role;
grant execute on function public.employee_can_view_directory_entry(uuid, text, timestamptz, timestamptz) to authenticated, service_role;

create or replace function public.enforce_relocation_case_status_transition()
returns trigger language plpgsql set search_path = public, pg_catalog
as $$
begin
  if old.status <> new.status and not (
    (old.status = 'draft' and new.status in ('active', 'cancelled'))
    or (old.status = 'active' and new.status in ('completed', 'cancelled'))
  ) then
    raise exception using errcode = '23514', message = 'INVALID_RELOCATION_STATUS_TRANSITION';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_provider_request_status_transition()
returns trigger language plpgsql set search_path = public, pg_catalog
as $$
begin
  if old.status <> new.status and not (
    (old.status = 'draft' and new.status in ('submitted', 'withdrawn'))
    or (old.status = 'submitted' and new.status in ('in_review', 'withdrawn', 'rejected'))
    or (old.status = 'in_review' and new.status in ('approved', 'withdrawn', 'rejected'))
    or (old.status = 'approved' and new.status in ('in_progress', 'withdrawn'))
    or (old.status = 'in_progress' and new.status in ('completed', 'withdrawn'))
  ) then
    raise exception using errcode = '23514', message = 'INVALID_PROVIDER_REQUEST_STATUS_TRANSITION';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_relocation_case_status_transition() from public, anon, authenticated;
revoke all on function public.enforce_provider_request_status_transition() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.relocation_cases'::regclass and tgname = 'relocation_cases_set_updated_at') then
    create trigger relocation_cases_set_updated_at before update on public.relocation_cases for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.relocation_cases'::regclass and tgname = 'relocation_cases_status_transition') then
    create trigger relocation_cases_status_transition before update of status on public.relocation_cases for each row execute function public.enforce_relocation_case_status_transition();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.checklist_items'::regclass and tgname = 'checklist_items_set_updated_at') then
    create trigger checklist_items_set_updated_at before update on public.checklist_items for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.cities'::regclass and tgname = 'cities_set_updated_at') then
    create trigger cities_set_updated_at before update on public.cities for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.providers'::regclass and tgname = 'providers_set_updated_at') then
    create trigger providers_set_updated_at before update on public.providers for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.directory_entries'::regclass and tgname = 'directory_entries_set_updated_at') then
    create trigger directory_entries_set_updated_at before update on public.directory_entries for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.shortlist_items'::regclass and tgname = 'shortlist_items_set_updated_at') then
    create trigger shortlist_items_set_updated_at before update on public.shortlist_items for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.provider_requests'::regclass and tgname = 'provider_requests_set_updated_at') then
    create trigger provider_requests_set_updated_at before update on public.provider_requests for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.provider_requests'::regclass and tgname = 'provider_requests_status_transition') then
    create trigger provider_requests_status_transition before update of status on public.provider_requests for each row execute function public.enforce_provider_request_status_transition();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.notifications'::regclass and tgname = 'notifications_set_updated_at') then
    create trigger notifications_set_updated_at before update on public.notifications for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.user_preferences'::regclass and tgname = 'user_preferences_set_updated_at') then
    create trigger user_preferences_set_updated_at before update on public.user_preferences for each row execute function public.set_updated_at();
  end if;
end;
$$;

alter table public.relocation_cases enable row level security;
alter table public.relocation_cases force row level security;
alter table public.checklist_items enable row level security;
alter table public.checklist_items force row level security;
alter table public.cities enable row level security;
alter table public.cities force row level security;
alter table public.providers enable row level security;
alter table public.providers force row level security;
alter table public.directory_entries enable row level security;
alter table public.directory_entries force row level security;
alter table public.shortlist_items enable row level security;
alter table public.shortlist_items force row level security;
alter table public.provider_requests enable row level security;
alter table public.provider_requests force row level security;
alter table public.consent_records enable row level security;
alter table public.consent_records force row level security;
alter table public.notifications enable row level security;
alter table public.notifications force row level security;
alter table public.user_preferences enable row level security;
alter table public.user_preferences force row level security;

revoke all on table public.relocation_cases, public.checklist_items, public.cities, public.providers,
  public.directory_entries, public.shortlist_items, public.provider_requests, public.consent_records,
  public.notifications, public.user_preferences from public, anon, authenticated;
grant select on public.relocation_cases, public.checklist_items, public.cities, public.providers,
  public.directory_entries, public.shortlist_items, public.provider_requests, public.consent_records,
  public.notifications, public.user_preferences to authenticated;
grant all on public.relocation_cases, public.checklist_items, public.cities, public.providers,
  public.directory_entries, public.shortlist_items, public.provider_requests, public.consent_records,
  public.notifications, public.user_preferences to service_role;

create policy "employees can view own relocation cases" on public.relocation_cases
  for select to authenticated using (employee_user_id = auth.uid() and public.employee_can_access_tenant(tenant_id));
create policy "employees can view own checklist items" on public.checklist_items
  for select to authenticated using (public.employee_can_access_case(case_id));
create policy "employees can view relevant cities" on public.cities
  for select to authenticated using (public.employee_can_access_city(id));
create policy "employees can view relevant providers" on public.providers
  for select to authenticated using (public.employee_can_access_city(city_id));
create policy "employees can view published directory entries" on public.directory_entries
  for select to authenticated using (public.employee_can_view_directory_entry(provider_id, status, published_at, expires_at));
create policy "employees can view own shortlist" on public.shortlist_items
  for select to authenticated using (public.employee_can_access_user(user_id));
create policy "employees can view own provider requests" on public.provider_requests
  for select to authenticated using (public.employee_can_access_case(case_id));
create policy "employees can view own consent records" on public.consent_records
  for select to authenticated using (exists (select 1 from public.provider_requests pr where pr.id = request_id and public.employee_can_access_case(pr.case_id)));
create policy "employees can view own notifications" on public.notifications
  for select to authenticated using (public.employee_can_access_user(user_id));
create policy "employees can view own preferences" on public.user_preferences
  for select to authenticated using (public.employee_can_access_user(user_id));
