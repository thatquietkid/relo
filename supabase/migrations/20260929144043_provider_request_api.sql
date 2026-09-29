set search_path = pg_catalog, public, extensions;

create policy "employees can view directory entries tied to own requests" on public.directory_entries
  for select to authenticated using (
    exists (
      select 1
        from public.provider_requests pr
        join public.relocation_cases rc on rc.id = pr.case_id
       where pr.directory_entry_id = directory_entries.id
         and rc.employee_user_id = auth.uid()
         and rc.status <> 'cancelled'
         and public.employee_can_access_case(rc.id)
    )
  );

create or replace function public.employee_submit_provider_request(
  p_user_id uuid,
  p_tenant_id uuid,
  p_case_id uuid,
  p_entry_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_consents jsonb,
  p_trace_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, extensions
as $$
declare
  v_case public.relocation_cases%rowtype;
  v_entry record;
  v_request public.provider_requests%rowtype;
  v_existing public.idempotency_keys%rowtype;
  v_consent jsonb;
  v_fields text[] := array['email', 'destination_city', 'move_date'];
begin
  if auth.uid() is null or auth.uid() <> p_user_id
     or coalesce(p_idempotency_key, '') !~ '^[\x21-\x7e]{8,128}$'
     or coalesce(p_request_hash, '') !~ '^[0-9a-f]{64}$'
     or not exists (
       select 1
         from public.memberships m
         join public.tenants t on t.id = m.tenant_id and t.status = 'active'
         join public.membership_roles mr on mr.membership_id = m.id
         join public.roles r on r.id = mr.role_id and r.key = 'employee'
        where m.user_id = p_user_id and m.tenant_id = p_tenant_id and m.status = 'active'
      ) then
    raise exception using message = 'MEMBERSHIP_REQUIRED';
  end if;

  if coalesce(jsonb_typeof(p_consents), '') <> 'array'
     or jsonb_array_length(p_consents) <> array_length(v_fields, 1)
     or exists (
       select 1 from jsonb_array_elements(p_consents) item
        where not (coalesce(item->>'field', '') = any(v_fields))
           or coalesce(item->>'consented', '') <> 'true'
      )
     or (select count(distinct item->>'field') from jsonb_array_elements(p_consents) item) <> array_length(v_fields, 1) then
    raise exception using message = 'CONSENT_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_user_id::text || ':' || p_idempotency_key, 0));
  delete from public.idempotency_keys where tenant_id = p_tenant_id and actor_user_id = p_user_id and key = p_idempotency_key and expires_at <= now();

  select * into v_existing from public.idempotency_keys
   where tenant_id = p_tenant_id and actor_user_id = p_user_id and key = p_idempotency_key;
  if found then
    if v_existing.request_hash <> p_request_hash then
      raise exception using message = 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
    select * into v_request from public.provider_requests where id = (v_existing.response_body->>'request_id')::uuid;
    if not found then raise exception using message = 'REQUEST_NOT_FOUND'; end if;
    return jsonb_build_object('provider_request', to_jsonb(v_request));
  end if;

  select * into v_case from public.relocation_cases
   where id = p_case_id and tenant_id = p_tenant_id and employee_user_id = p_user_id and status = 'active';
  if not found then raise exception using message = 'RELOCATION_CASE_NOT_FOUND'; end if;

  select de.*, p.city_id, p.contact_policy, p.status as provider_status, c.status as city_status
    into v_entry
    from public.directory_entries de
    join public.providers p on p.id = de.provider_id
    join public.cities c on c.id = p.city_id
   where de.id = p_entry_id
     and de.status = 'published'
     and de.published_at <= now()
     and (de.expires_at is null or de.expires_at > now())
     and p.status = 'active'
     and c.status = 'active';
  if not found then raise exception using message = 'ENTRY_NOT_FOUND'; end if;
  if v_entry.contact_policy <> 'employee_request' then raise exception using message = 'REQUEST_UNAVAILABLE'; end if;
  if v_entry.city_id <> v_case.destination_city_id then raise exception using message = 'DESTINATION_MISMATCH'; end if;
  if not public.employee_can_access_city(v_entry.city_id) then raise exception using message = 'DESTINATION_MISMATCH'; end if;

  if exists (select 1 from public.provider_requests where case_id = p_case_id and directory_entry_id = p_entry_id and status <> 'withdrawn') then
    raise exception using message = 'REQUEST_ALREADY_EXISTS';
  end if;

  insert into public.provider_requests (case_id, directory_entry_id, status, submitted_at)
  values (p_case_id, p_entry_id, 'submitted', now())
  returning * into v_request;

  for v_consent in select * from jsonb_array_elements(p_consents) loop
    insert into public.consent_records (request_id, field_name, consented)
    values (
      v_request.id,
      v_consent->>'field',
      true
    );
  end loop;

  insert into public.outbox_events (tenant_id, actor_user_id, aggregate_type, aggregate_id, event_type, event_version, trace_id, payload)
  values (p_tenant_id, p_user_id, 'provider_request', v_request.id, 'ProviderRequestSubmitted', 1, p_trace_id,
    jsonb_build_object('request_id', v_request.id, 'case_id', p_case_id, 'directory_entry_id', p_entry_id));

  insert into public.idempotency_keys (tenant_id, actor_user_id, key, request_hash, response_status, response_body, expires_at)
  values (p_tenant_id, p_user_id, p_idempotency_key, p_request_hash, 200, jsonb_build_object('request_id', v_request.id), now() + interval '24 hours');

  return jsonb_build_object('provider_request', to_jsonb(v_request));
end;
$$;

create or replace function public.employee_withdraw_provider_request(
  p_user_id uuid,
  p_tenant_id uuid,
  p_request_id uuid,
  p_trace_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_request public.provider_requests%rowtype;
begin
  if auth.uid() is null or auth.uid() <> p_user_id
     or not exists (
       select 1
         from public.memberships m
         join public.tenants t on t.id = m.tenant_id and t.status = 'active'
         join public.membership_roles mr on mr.membership_id = m.id
         join public.roles r on r.id = mr.role_id and r.key = 'employee'
     where m.user_id = p_user_id and m.tenant_id = p_tenant_id and m.status = 'active'
      ) then
    raise exception using message = 'MEMBERSHIP_REQUIRED';
  end if;

  select pr.* into v_request
    from public.provider_requests pr
    join public.relocation_cases rc on rc.id = pr.case_id
   where pr.id = p_request_id and rc.tenant_id = p_tenant_id and rc.employee_user_id = p_user_id
   for update;
  if not found then raise exception using message = 'REQUEST_NOT_FOUND'; end if;
  if v_request.status = 'withdrawn' then return jsonb_build_object('provider_request', to_jsonb(v_request)); end if;
  if v_request.status in ('completed', 'rejected') then raise exception using message = 'REQUEST_NOT_WITHDRAWABLE'; end if;

  update public.provider_requests set status = 'withdrawn', withdrawn_at = now() where id = v_request.id returning * into v_request;
  update public.consent_records set withdrawn_at = now() where request_id = v_request.id and withdrawn_at is null;
  insert into public.outbox_events (tenant_id, actor_user_id, aggregate_type, aggregate_id, event_type, event_version, trace_id, payload)
  values (p_tenant_id, p_user_id, 'provider_request', v_request.id, 'ConsentWithdrawn', 1, p_trace_id, jsonb_build_object('request_id', v_request.id));
  insert into public.outbox_events (tenant_id, actor_user_id, aggregate_type, aggregate_id, event_type, event_version, trace_id, payload)
  values (p_tenant_id, p_user_id, 'provider_request', v_request.id, 'ProviderRequestWithdrawn', 1, p_trace_id, jsonb_build_object('request_id', v_request.id));
  return jsonb_build_object('provider_request', to_jsonb(v_request));
end;
$$;

revoke all on function public.employee_submit_provider_request(uuid, uuid, uuid, uuid, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.employee_withdraw_provider_request(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.employee_submit_provider_request(uuid, uuid, uuid, uuid, text, text, jsonb, text) to authenticated;
grant execute on function public.employee_withdraw_provider_request(uuid, uuid, uuid, text) to authenticated;
