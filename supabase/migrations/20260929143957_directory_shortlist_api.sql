set search_path = pg_catalog, public, extensions;

grant insert, delete on public.shortlist_items to authenticated;

create policy "employees can create own shortlist" on public.shortlist_items
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
        from public.directory_entries de
       where de.id = directory_entry_id
         and public.employee_can_view_directory_entry(de.provider_id, de.status, de.published_at, de.expires_at)
    )
  );

create policy "employees can delete own shortlist" on public.shortlist_items
  for delete to authenticated
  using (public.employee_can_access_user(user_id));

create or replace function public.append_directory_event(
  p_event_id uuid,
  p_event_type text,
  p_version integer,
  p_occurred_at timestamptz,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_trace_id text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_entry_id uuid;
begin
  if p_actor_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'DIRECTORY_EVENT_ACTOR_MISMATCH';
  end if;
  if not exists (
    select 1
      from public.memberships m
      join public.membership_roles mr on mr.membership_id = m.id
      join public.roles r on r.id = mr.role_id and r.key = 'employee'
     where m.user_id = auth.uid()
       and m.tenant_id = p_tenant_id
       and m.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'DIRECTORY_EVENT_ACCESS_DENIED';
  end if;
  v_entry_id := (p_payload ->> 'directory_entry_id')::uuid;
  insert into public.outbox_events (id, tenant_id, actor_user_id, aggregate_type, aggregate_id, event_type, event_version, trace_id, payload, occurred_at)
  values (p_event_id, p_tenant_id, p_actor_id, 'directory_entry', v_entry_id, p_event_type, p_version, p_trace_id, p_payload, p_occurred_at);
end;
$$;

revoke all on function public.append_directory_event(uuid, text, integer, timestamptz, uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.append_directory_event(uuid, text, integer, timestamptz, uuid, uuid, text, jsonb) to authenticated;
