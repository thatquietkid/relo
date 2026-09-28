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

create table if not exists public.program_memberships (
  program_id uuid not null references public.programs(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  status text not null default 'enrolled' check (status in ('enrolled', 'active', 'completed', 'withdrawn')),
  enrolled_at timestamptz not null default now(),
  primary key (program_id, membership_id)
);

create table if not exists public.invitation_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  label text not null check (length(btrim(label)) between 1 and 200),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.invitation_batch_items (
  batch_id uuid not null references public.invitation_batches(id) on delete cascade,
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  primary key (batch_id, invitation_id)
);

create table if not exists public.review_assignments (
  id uuid primary key default gen_random_uuid(),
  reviewer_user_id uuid not null references auth.users(id) on delete cascade,
  city_id uuid not null references public.cities(id) on delete cascade,
  category text check (category is null or length(btrim(category)) between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key ~ '^[a-z][a-z0-9_.-]{1,100}$'),
  scope text not null default 'global' check (scope in ('global', 'tenant', 'environment')),
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table if not exists public.support_cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting_on_requester', 'resolved', 'closed')),
  subject text not null check (length(btrim(subject)) between 1 and 240),
  body text not null check (length(btrim(body)) between 1 and 10000),
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists programs_tenant_name_unique on public.programs (tenant_id, lower(name));
create index if not exists programs_tenant_status_idx on public.programs (tenant_id, status, starts_at desc);
create index if not exists program_memberships_membership_idx on public.program_memberships (membership_id, status);
create index if not exists invitation_batches_tenant_created_idx on public.invitation_batches (tenant_id, created_at desc);
create index if not exists invitation_batch_items_invitation_idx on public.invitation_batch_items (invitation_id);
create unique index if not exists review_assignments_reviewer_scope_unique
  on public.review_assignments (reviewer_user_id, city_id, coalesce(category, '*'));
create index if not exists review_assignments_city_category_idx on public.review_assignments (city_id, category, active);
create unique index if not exists feature_flags_key_scope_unique on public.feature_flags (key, scope);
create index if not exists support_cases_tenant_status_idx on public.support_cases (tenant_id, status, created_at desc);
create index if not exists support_cases_assignee_idx on public.support_cases (assigned_to, status, created_at desc);

create or replace function public.operations_can_access_tenant(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
      from public.memberships m
      join public.membership_roles mr on mr.membership_id = m.id
      join public.roles r on r.id = mr.role_id
      join public.tenants t on t.id = m.tenant_id and t.status = 'active'
     where m.tenant_id = p_tenant_id
       and m.user_id = auth.uid()
       and m.status = 'active'
       and r.key in ('hr', 'admin')
  )
  or public.is_platform_admin();
$$;

create or replace function public.reviewer_can_access_scope(p_city_id uuid, p_category text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select public.is_platform_admin()
      or exists (
        select 1
          from public.review_assignments ra
         where ra.reviewer_user_id = auth.uid()
           and ra.city_id = p_city_id
           and ra.active
           and (ra.category is null or ra.category = p_category)
      );
$$;

create or replace function public.enforce_program_membership_tenant()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if not exists (
    select 1
      from public.programs p
      join public.memberships m on m.tenant_id = p.tenant_id
     where p.id = new.program_id
       and m.id = new.membership_id
  ) then
    raise exception using errcode = '23514', message = 'PROGRAM_MEMBERSHIP_TENANT_MISMATCH';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_invitation_batch_tenant()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if not exists (
    select 1
      from public.invitation_batches b
      join public.invitations i on i.tenant_id = b.tenant_id
     where b.id = new.batch_id
       and i.id = new.invitation_id
  ) then
    raise exception using errcode = '23514', message = 'INVITATION_BATCH_TENANT_MISMATCH';
  end if;
  return new;
end;
$$;

revoke all on function public.operations_can_access_tenant(uuid) from public, anon, authenticated;
revoke all on function public.reviewer_can_access_scope(uuid, text) from public, anon, authenticated;
revoke all on function public.enforce_program_membership_tenant() from public, anon, authenticated;
revoke all on function public.enforce_invitation_batch_tenant() from public, anon, authenticated;
grant execute on function public.operations_can_access_tenant(uuid) to authenticated, service_role;
grant execute on function public.reviewer_can_access_scope(uuid, text) to authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.programs'::regclass and tgname = 'programs_set_updated_at') then
    create trigger programs_set_updated_at before update on public.programs for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.review_assignments'::regclass and tgname = 'review_assignments_set_updated_at') then
    create trigger review_assignments_set_updated_at before update on public.review_assignments for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.feature_flags'::regclass and tgname = 'feature_flags_set_updated_at') then
    create trigger feature_flags_set_updated_at before update on public.feature_flags for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.support_cases'::regclass and tgname = 'support_cases_set_updated_at') then
    create trigger support_cases_set_updated_at before update on public.support_cases for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.program_memberships'::regclass and tgname = 'program_memberships_tenant_guard') then
    create trigger program_memberships_tenant_guard before insert or update on public.program_memberships for each row execute function public.enforce_program_membership_tenant();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.invitation_batch_items'::regclass and tgname = 'invitation_batch_items_tenant_guard') then
    create trigger invitation_batch_items_tenant_guard before insert or update on public.invitation_batch_items for each row execute function public.enforce_invitation_batch_tenant();
  end if;
end;
$$;

alter table public.programs enable row level security;
alter table public.programs force row level security;
alter table public.program_memberships enable row level security;
alter table public.program_memberships force row level security;
alter table public.invitation_batches enable row level security;
alter table public.invitation_batches force row level security;
alter table public.invitation_batch_items enable row level security;
alter table public.invitation_batch_items force row level security;
alter table public.review_assignments enable row level security;
alter table public.review_assignments force row level security;
alter table public.feature_flags enable row level security;
alter table public.feature_flags force row level security;
alter table public.support_cases enable row level security;
alter table public.support_cases force row level security;

revoke all on table public.programs, public.program_memberships, public.invitation_batches,
  public.invitation_batch_items, public.review_assignments, public.feature_flags, public.support_cases
  from public, anon;
grant select, insert, update on public.programs, public.program_memberships,
  public.invitation_batches, public.invitation_batch_items to authenticated;
grant select on public.review_assignments, public.feature_flags, public.support_cases to authenticated;
grant all on public.programs, public.program_memberships, public.invitation_batches,
  public.invitation_batch_items, public.review_assignments, public.feature_flags, public.support_cases to service_role;

create policy "tenant operators can view programs"
  on public.programs for select to authenticated
  using (public.operations_can_access_tenant(tenant_id));
create policy "tenant operators can create programs"
  on public.programs for insert to authenticated
  with check (public.operations_can_access_tenant(tenant_id) and created_by = auth.uid());
create policy "tenant operators can update programs"
  on public.programs for update to authenticated
  using (public.operations_can_access_tenant(tenant_id))
  with check (public.operations_can_access_tenant(tenant_id));

create policy "tenant operators can view program memberships"
  on public.program_memberships for select to authenticated
  using (exists (select 1 from public.programs p where p.id = program_id and public.operations_can_access_tenant(p.tenant_id)));
create policy "tenant operators can manage program memberships"
  on public.program_memberships for insert to authenticated
  with check (exists (select 1 from public.programs p where p.id = program_id and public.operations_can_access_tenant(p.tenant_id)));
create policy "tenant operators can update program memberships"
  on public.program_memberships for update to authenticated
  using (exists (select 1 from public.programs p where p.id = program_id and public.operations_can_access_tenant(p.tenant_id)))
  with check (exists (select 1 from public.programs p where p.id = program_id and public.operations_can_access_tenant(p.tenant_id)));

create policy "tenant operators can view invitation batches"
  on public.invitation_batches for select to authenticated
  using (public.operations_can_access_tenant(tenant_id));
create policy "tenant operators can create invitation batches"
  on public.invitation_batches for insert to authenticated
  with check (public.operations_can_access_tenant(tenant_id) and created_by = auth.uid());
create policy "tenant operators can view invitation batch items"
  on public.invitation_batch_items for select to authenticated
  using (exists (select 1 from public.invitation_batches b where b.id = batch_id and public.operations_can_access_tenant(b.tenant_id)));
create policy "tenant operators can create invitation batch items"
  on public.invitation_batch_items for insert to authenticated
  with check (exists (select 1 from public.invitation_batches b where b.id = batch_id and public.operations_can_access_tenant(b.tenant_id)));

create policy "reviewers can view own assignments"
  on public.review_assignments for select to authenticated
  using (reviewer_user_id = auth.uid() or public.is_platform_admin());

create policy "platform admins can view feature flags"
  on public.feature_flags for select to authenticated
  using (public.is_platform_admin());

create policy "tenant operators can view support cases"
  on public.support_cases for select to authenticated
  using (public.operations_can_access_tenant(tenant_id) or assigned_to = auth.uid() or public.is_platform_admin());

create policy "tenant operators can update support cases"
  on public.support_cases for update to authenticated
  using (public.operations_can_access_tenant(tenant_id) or assigned_to = auth.uid() or public.is_platform_admin())
  with check (public.operations_can_access_tenant(tenant_id) or assigned_to = auth.uid() or public.is_platform_admin());
