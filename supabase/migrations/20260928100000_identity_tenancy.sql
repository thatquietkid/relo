create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
set search_path = public, extensions, pg_catalog;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tenants_slug_unique on public.tenants (slug);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
  joined_at timestamptz not null default now(),
  suspended_at timestamptz,
  constraint memberships_one_user_per_tenant unique (tenant_id, user_id),
  constraint memberships_suspension_state check (
    (status = 'suspended' and suspended_at is not null)
    or (status <> 'suspended' and suspended_at is null)
  )
);

create index if not exists memberships_user_id_idx on public.memberships (user_id);
create index if not exists memberships_tenant_status_idx on public.memberships (tenant_id, status);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_:-]{1,63}$')
);

insert into public.roles (key)
values ('employee'), ('hr'), ('admin'), ('reviewer')
on conflict (key) do nothing;

create table if not exists public.membership_roles (
  membership_id uuid not null references public.memberships(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  primary key (membership_id, role_id)
);

create index if not exists membership_roles_role_id_idx on public.membership_roles (role_id);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  role_key text not null references public.roles(key) on update cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint invitations_acceptance_state check (
    (status = 'accepted' and accepted_at is not null)
    or (status <> 'accepted' and accepted_at is null)
  )
);

create unique index if not exists invitations_pending_email_unique
  on public.invitations (tenant_id, lower(email), status)
  where status = 'pending';
create index if not exists invitations_tenant_status_idx on public.invitations (tenant_id, status);
create index if not exists invitations_expiry_idx on public.invitations (expires_at);

create view public.invitation_views
with (security_invoker = true)
as
select id, tenant_id, email, role_key, status, expires_at, accepted_at, invited_by, created_at
  from public.invitations;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (length(btrim(action)) between 1 and 120),
  resource_type text not null check (length(btrim(resource_type)) between 1 and 120),
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_tenant_created_at_idx
  on public.audit_logs (tenant_id, created_at desc);
create index if not exists audit_logs_actor_user_id_idx on public.audit_logs (actor_user_id);

create table if not exists public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key ~ '^[\x21-\x7e]{8,128}$'),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  response_status integer not null check (response_status between 100 and 599),
  response_body jsonb not null check (jsonb_typeof(response_body) = 'object'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint idempotency_keys_actor_key_unique unique (tenant_id, actor_user_id, key)
);

create index if not exists idempotency_keys_expiry_idx on public.idempotency_keys (expires_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.tenants'::regclass
       and tgname = 'tenants_set_updated_at'
  ) then
    create trigger tenants_set_updated_at
      before update on public.tenants
      for each row execute function public.set_updated_at();
  end if;
end;
$$;

create or replace function public.hash_invitation_token(raw_token text)
returns text
language sql
immutable
strict
set search_path = public, extensions, pg_catalog
as $$
  select encode(digest(raw_token, 'sha256'), 'hex');
$$;

create or replace function public.current_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select m.tenant_id
    from public.memberships as m
   where m.user_id = auth.uid()
     and m.status = 'active';
$$;

create or replace function public.has_role(p_tenant_id uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
      from public.memberships as m
      join public.membership_roles as mr on mr.membership_id = m.id
      join public.roles as r on r.id = mr.role_id
     where m.tenant_id = p_tenant_id
       and m.user_id = auth.uid()
       and m.status = 'active'
       and r.key = p_role
  );
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.hash_invitation_token(text) from public, anon, authenticated;
revoke all on function public.current_tenant_ids() from public, anon;
revoke all on function public.has_role(uuid, text) from public, anon;
grant execute on function public.current_tenant_ids() to authenticated, service_role;
grant execute on function public.has_role(uuid, text) to authenticated, service_role;
grant execute on function public.hash_invitation_token(text) to service_role;

alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.roles enable row level security;
alter table public.membership_roles enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_logs enable row level security;
alter table public.idempotency_keys enable row level security;

revoke all on table public.tenants, public.memberships, public.roles, public.membership_roles,
  public.invitations, public.audit_logs, public.idempotency_keys, public.invitation_views
  from anon, authenticated;
grant select on public.tenants, public.memberships, public.roles, public.membership_roles,
  public.audit_logs to authenticated;
grant select (id, tenant_id, email, role_key, status, expires_at, accepted_at, invited_by, created_at)
  on public.invitations to authenticated;
grant select on public.invitation_views to authenticated;
grant select, insert on public.idempotency_keys to authenticated;
grant select, insert, update, delete on public.invitations to service_role;

create policy "members can view same tenant"
  on public.tenants for select to authenticated
  using (id in (select tenant_id from public.current_tenant_ids() as tenant_id));

create policy "members can view same tenant memberships"
  on public.memberships for select to authenticated
  using (
    user_id = auth.uid()
    and status = 'active'
    and tenant_id in (select tenant_id from public.current_tenant_ids() as tenant_id)
  );

create policy "authenticated users can view roles"
  on public.roles for select to authenticated
  using (true);

create policy "members can view assigned roles"
  on public.membership_roles for select to authenticated
  using (exists (
    select 1
      from public.memberships as m
     where m.id = membership_roles.membership_id
       and m.user_id = auth.uid()
       and m.status = 'active'
       and m.tenant_id in (select tenant_id from public.current_tenant_ids() as tenant_id)
  ));

create policy "tenant HR can view invitations"
  on public.invitations for select to authenticated
  using (exists (
    select 1
      from public.memberships as m
      join public.membership_roles as mr on mr.membership_id = m.id
      join public.roles as r on r.id = mr.role_id
     where m.tenant_id = invitations.tenant_id
       and m.user_id = auth.uid()
       and m.status = 'active'
       and r.key in ('hr', 'admin')
  ));

create policy "tenant admins can view audit logs"
  on public.audit_logs for select to authenticated
  using (exists (
    select 1
      from public.memberships as m
      join public.membership_roles as mr on mr.membership_id = m.id
      join public.roles as r on r.id = mr.role_id
     where m.tenant_id = audit_logs.tenant_id
       and m.user_id = auth.uid()
       and m.status = 'active'
       and r.key = 'admin'
  ));

create policy "actors can use idempotency keys"
  on public.idempotency_keys for select to authenticated
  using (
    actor_user_id = auth.uid()
    and tenant_id in (select tenant_id from public.current_tenant_ids() as tenant_id)
  );

create policy "actors can create idempotency keys"
  on public.idempotency_keys for insert to authenticated
  with check (
    actor_user_id = auth.uid()
    and tenant_id in (select tenant_id from public.current_tenant_ids() as tenant_id)
  );
