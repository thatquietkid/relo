create extension if not exists pgcrypto;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'employee' check (role in ('employee', 'hr', 'admin')),
  organization_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.relocation_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('pending', 'active', 'completed')),
  progress integer not null default 0 check (progress between 0 and 100),
  move_date date,
  created_at timestamptz not null default now()
);

create table public.growth_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table public.growth_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  metric_key text not null check (metric_key in ('acquisition', 'activation', 'retention', 'referral', 'revenue')),
  display_value text not null,
  detail text not null,
  trend text not null,
  updated_at timestamptz not null default now()
);

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.relocation_cases enable row level security;
alter table public.growth_events enable row level security;
alter table public.growth_metrics enable row level security;

create policy "members can view their organization" on public.organizations for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.organization_id = organizations.id));
create policy "users can create an organization for themselves" on public.organizations for insert to authenticated
with check ((select auth.uid()) = created_by);
create policy "users can view their own profile" on public.profiles for select to authenticated
using ((select auth.uid()) = id);
create policy "employees can view their own relocation case" on public.relocation_cases for select to authenticated
using (employee_id = (select auth.uid()) or exists (select 1 from public.profiles actor where actor.id = (select auth.uid()) and actor.organization_id = relocation_cases.organization_id and actor.role in ('hr', 'admin')));
create policy "employees can create their own growth events" on public.growth_events for insert to authenticated
with check ((select auth.uid()) = actor_id);
create policy "employees can view their own growth events" on public.growth_events for select to authenticated
using ((select auth.uid()) = actor_id);
create policy "hr can view organization growth metrics" on public.growth_metrics for select to authenticated
using (exists (select 1 from public.profiles actor where actor.id = (select auth.uid()) and actor.role in ('hr', 'admin') and (growth_metrics.organization_id is null or actor.organization_id = growth_metrics.organization_id)));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create index if not exists organizations_created_by_idx on public.organizations (created_by);
create index if not exists profiles_organization_id_idx on public.profiles (organization_id);
create index if not exists relocation_cases_organization_id_idx on public.relocation_cases (organization_id);
create index if not exists relocation_cases_employee_id_idx on public.relocation_cases (employee_id);
create index if not exists growth_events_organization_id_idx on public.growth_events (organization_id);
create index if not exists growth_events_actor_id_idx on public.growth_events (actor_id);
create index if not exists growth_metrics_organization_id_idx on public.growth_metrics (organization_id);

insert into public.growth_metrics (metric_key, display_value, detail, trend) values
  ('acquisition', '80%', 'Invite acceptance', '+9 pts'),
  ('activation', '12d', 'Time to first action', '-2 days'),
  ('retention', '71%', 'Active case progress', '+4 pts'),
  ('referral', '27', 'Helpful feedback responses', '+6 this month'),
  ('revenue', '₹75k', 'Average allowance managed', '42 cases');
