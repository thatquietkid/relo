set search_path = pg_catalog, public, extensions;

create table if not exists public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  actor_user_id uuid,
  aggregate_type text not null check (length(btrim(aggregate_type)) between 1 and 80),
  aggregate_id uuid not null,
  event_type text not null check (length(btrim(event_type)) between 1 and 120),
  event_version integer not null default 1 check (event_version > 0),
  trace_id text not null check (length(btrim(trace_id)) between 1 and 200),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists outbox_events_unpublished_idx
  on public.outbox_events (occurred_at, id)
  where published_at is null;
create index if not exists outbox_events_tenant_idx
  on public.outbox_events (tenant_id, occurred_at desc);

alter table public.outbox_events enable row level security;
revoke all on table public.outbox_events from public, anon, authenticated;

create or replace function public.enforce_checklist_item_state_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.state <> new.state and not (
    (old.state in ('pending', 'in_progress') and new.state in ('pending', 'in_progress', 'completed', 'skipped'))
    or (old.state = 'completed' and new.state in ('completed', 'pending', 'in_progress'))
    or (old.state = 'skipped' and new.state in ('skipped', 'pending', 'in_progress'))
  ) then
    raise exception using errcode = '23514', message = 'INVALID_CHECKLIST_STATE_TRANSITION';
  end if;
  if new.state = 'completed' and new.completed_at is null then
    raise exception using errcode = '23514', message = 'CHECKLIST_COMPLETION_TIMESTAMP_REQUIRED';
  end if;
  if new.state <> 'completed' and new.completed_at is not null then
    raise exception using errcode = '23514', message = 'CHECKLIST_COMPLETION_TIMESTAMP_FORBIDDEN';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_checklist_item_state_transition() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.checklist_items'::regclass
       and tgname = 'checklist_items_state_transition'
  ) then
    create trigger checklist_items_state_transition
      before update of state, completed_at on public.checklist_items
      for each row execute function public.enforce_checklist_item_state_transition();
  end if;
end;
$$;

create or replace function public.employee_activate_relocation_case(
  p_user_id uuid,
  p_tenant_id uuid,
  p_defaults jsonb,
  p_trace_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.relocation_cases%rowtype;
  v_item record;
  v_checklist jsonb;
begin
  if auth.uid() is null or auth.uid() <> p_user_id
     or not exists (
       select 1
         from public.memberships m
         join public.tenants t on t.id = m.tenant_id and t.status = 'active'
        where m.user_id = p_user_id
          and m.tenant_id = p_tenant_id
          and m.status = 'active'
     ) then
    raise exception using message = 'MEMBERSHIP_REQUIRED';
  end if;

  select * into v_case
    from public.relocation_cases
   where employee_user_id = p_user_id
     and tenant_id = p_tenant_id
     and status <> 'cancelled'
   order by created_at desc
   limit 1
   for update;
  if not found then
    raise exception using message = 'RELOCATION_CASE_NOT_FOUND';
  end if;

  if v_case.status = 'draft' then
    update public.relocation_cases
       set status = 'active'
     where id = v_case.id
     returning * into v_case;

    for v_item in
      select * from jsonb_to_recordset(coalesce(p_defaults, '[]'::jsonb)) as defaults(
        key text,
        title text,
        description text,
        due_at timestamptz,
        sort_order integer
      )
    loop
      insert into public.checklist_items (case_id, key, title, description, state, due_at, completed_at, sort_order)
      values (v_case.id, v_item.key, v_item.title, v_item.description, 'pending', v_item.due_at, null, v_item.sort_order)
      on conflict (case_id, key) do nothing;
    end loop;

    update public.relocation_cases rc
       set progress_percent = coalesce((
         select round(100.0 * count(*) filter (where ci.state = 'completed') / nullif(count(*), 0))::integer
           from public.checklist_items ci
          where ci.case_id = rc.id
       ), 0)
     where rc.id = v_case.id
     returning * into v_case;

    insert into public.outbox_events (
      tenant_id, actor_user_id, aggregate_type, aggregate_id, event_type, event_version, trace_id, payload
    ) values (
      v_case.tenant_id, p_user_id, 'relocation_case', v_case.id, 'RelocationCaseActivated', 1, p_trace_id,
      jsonb_build_object(
        'tenant_id', v_case.tenant_id,
        'case_id', v_case.id,
        'employee_user_id', v_case.employee_user_id
      )
    );
  end if;

  select coalesce(jsonb_agg(to_jsonb(ci) order by ci.sort_order, ci.id), '[]'::jsonb)
    into v_checklist
    from public.checklist_items ci
   where ci.case_id = v_case.id;

  return jsonb_build_object('relocation_case', to_jsonb(v_case), 'checklist', v_checklist);
end;
$$;

create or replace function public.employee_set_checklist_item_state(
  p_user_id uuid,
  p_tenant_id uuid,
  p_case_id uuid,
  p_item_id uuid,
  p_state text,
  p_idempotency_key text,
  p_request_hash text,
  p_trace_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.relocation_cases%rowtype;
  v_item public.checklist_items%rowtype;
  v_existing public.idempotency_keys%rowtype;
  v_completed_at timestamptz;
  v_progress integer;
  v_previous_state text;
begin
  if auth.uid() is null or auth.uid() <> p_user_id
     or not exists (
       select 1
         from public.memberships m
         join public.tenants t on t.id = m.tenant_id and t.status = 'active'
        where m.user_id = p_user_id
          and m.tenant_id = p_tenant_id
          and m.status = 'active'
     ) then
    raise exception using message = 'MEMBERSHIP_REQUIRED';
  end if;
  if p_state not in ('pending', 'in_progress', 'completed', 'skipped') then
    raise exception using message = 'VALIDATION_ERROR';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_user_id::text || ':' || p_idempotency_key, 0));
  delete from public.idempotency_keys
   where tenant_id = p_tenant_id
     and actor_user_id = p_user_id
     and key = p_idempotency_key
     and expires_at <= now();

  select * into v_existing
    from public.idempotency_keys
   where tenant_id = p_tenant_id
     and actor_user_id = p_user_id
     and key = p_idempotency_key;
  if found then
    if v_existing.request_hash <> p_request_hash then
      raise exception using message = 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
    return v_existing.response_body;
  end if;

  select * into v_case
    from public.relocation_cases
   where id = p_case_id
     and tenant_id = p_tenant_id
     and employee_user_id = p_user_id
     and status <> 'cancelled'
   for update;
  if not found then
    raise exception using message = 'RELOCATION_CASE_NOT_FOUND';
  end if;

  select * into v_item
    from public.checklist_items
   where id = p_item_id and case_id = p_case_id
   for update;
  if not found then
    raise exception using message = 'CHECKLIST_ITEM_NOT_FOUND';
  end if;

  if not (
    v_item.state = p_state
    or (v_item.state in ('pending', 'in_progress') and p_state in ('pending', 'in_progress', 'completed', 'skipped'))
    or (v_item.state = 'completed' and p_state in ('completed', 'pending', 'in_progress'))
    or (v_item.state = 'skipped' and p_state in ('skipped', 'pending', 'in_progress'))
  ) then
    raise exception using message = 'INVALID_CHECKLIST_STATE_TRANSITION';
  end if;

  v_previous_state := v_item.state;
  v_completed_at := case when p_state = 'completed' then coalesce(v_item.completed_at, now()) else null end;
  update public.checklist_items
     set state = p_state, completed_at = v_completed_at
   where id = v_item.id
   returning * into v_item;

  select coalesce(round(100.0 * count(*) filter (where ci.state = 'completed') / nullif(count(*), 0))::integer, 0)
    into v_progress
    from public.checklist_items ci
   where ci.case_id = p_case_id;

  if v_progress <> v_case.progress_percent then
    update public.relocation_cases
       set progress_percent = v_progress
     where id = v_case.id;
    insert into public.outbox_events (
      tenant_id, actor_user_id, aggregate_type, aggregate_id, event_type, event_version, trace_id, payload
    ) values (
      v_case.tenant_id, p_user_id, 'relocation_case', v_case.id, 'ChecklistProgressChanged', 1, p_trace_id,
      jsonb_build_object(
        'tenant_id', v_case.tenant_id,
        'case_id', v_case.id,
        'employee_user_id', v_case.employee_user_id,
        'previous_progress_percent', v_case.progress_percent,
        'progress_percent', v_progress
      )
    );
  end if;

  if v_previous_state <> 'completed' and v_item.state = 'completed' then
    insert into public.outbox_events (
      tenant_id, actor_user_id, aggregate_type, aggregate_id, event_type, event_version, trace_id, payload
    ) values (
      v_case.tenant_id, p_user_id, 'checklist_item', v_item.id, 'ChecklistItemCompleted', 1, p_trace_id,
      jsonb_build_object(
        'tenant_id', v_case.tenant_id,
        'case_id', v_case.id,
        'employee_user_id', v_case.employee_user_id,
        'item_id', v_item.id,
        'state', v_item.state,
        'completed_at', v_item.completed_at
      )
    );
  end if;

  insert into public.idempotency_keys (
    tenant_id, actor_user_id, key, request_hash, response_status, response_body, expires_at
  ) values (
    p_tenant_id, p_user_id, p_idempotency_key, p_request_hash, 200,
    jsonb_build_object('checklist_item', to_jsonb(v_item)), now() + interval '24 hours'
  );

  return jsonb_build_object('checklist_item', to_jsonb(v_item));
end;
$$;

revoke all on function public.employee_activate_relocation_case(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.employee_set_checklist_item_state(uuid, uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;

grant execute on function public.employee_activate_relocation_case(uuid, uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.employee_set_checklist_item_state(uuid, uuid, uuid, uuid, text, text, text, text) to authenticated, service_role;
