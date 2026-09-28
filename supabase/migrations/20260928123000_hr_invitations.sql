set search_path = public, extensions, pg_catalog;

create or replace function public.hr_list_tenant_employees(
  p_tenant_id uuid,
  p_page integer,
  p_page_size integer,
  p_search text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  v_total integer;
  v_items jsonb;
begin
  if not public.operations_can_access_tenant(p_tenant_id) then
    raise exception using message = 'HR_ACCESS_DENIED';
  end if;

  select count(*)::integer into v_total
    from public.memberships m
    join auth.users u on u.id = m.user_id
   where m.tenant_id = p_tenant_id
     and m.status = 'active'
     and (
       v_search is null
       or lower(coalesce(u.email, '')) like '%' || v_search || '%'
       or lower(coalesce(u.raw_user_meta_data ->> 'full_name', '')) like '%' || v_search || '%'
     );

  select coalesce(jsonb_agg(row_to_json(item) order by item.joined_at desc, item.membership_id), '[]'::jsonb)
    into v_items
    from (
      select m.id as membership_id,
             m.user_id,
             coalesce(u.email, '') as email,
             nullif(u.raw_user_meta_data ->> 'full_name', '') as name,
             m.status,
             m.joined_at,
             coalesce((
               select jsonb_agg(r.key order by r.key)
                 from public.membership_roles mr
                 join public.roles r on r.id = mr.role_id
                where mr.membership_id = m.id
             ), '[]'::jsonb) as roles
        from public.memberships m
        join auth.users u on u.id = m.user_id
       where m.tenant_id = p_tenant_id
         and m.status = 'active'
         and (
           v_search is null
           or lower(coalesce(u.email, '')) like '%' || v_search || '%'
           or lower(coalesce(u.raw_user_meta_data ->> 'full_name', '')) like '%' || v_search || '%'
         )
       order by m.joined_at desc, m.id
       offset (v_page - 1) * v_page_size
       limit v_page_size
    ) item;

  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$$;

create or replace function public.hr_create_employee_invitation(
  p_tenant_id uuid,
  p_email text,
  p_created_by uuid,
  p_expires_at timestamptz,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_invitation public.invitations%rowtype;
  v_email text := lower(btrim(p_email));
begin
  if auth.uid() is null or auth.uid() <> p_created_by or not public.operations_can_access_tenant(p_tenant_id) then
    raise exception using message = 'HR_ACCESS_DENIED';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email) > 320 then
    raise exception using message = 'VALIDATION_ERROR';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using message = 'VALIDATION_ERROR';
  end if;
  if exists (select 1 from public.invitations where tenant_id = p_tenant_id and email = v_email and status = 'pending') then
    raise exception using message = 'INVITATION_ALREADY_PENDING';
  end if;

  insert into public.invitations (tenant_id, email, role_key, token_hash, expires_at, invited_by)
  values (p_tenant_id, v_email, 'employee', p_token_hash, p_expires_at, p_created_by)
  returning * into v_invitation;

  insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (p_tenant_id, p_created_by, 'member.invited', 'invitation', v_invitation.id, jsonb_build_object('role_key', 'employee', 'email', v_email));
  insert into public.outbox_events (tenant_id, actor_user_id, aggregate_type, aggregate_id, event_type, trace_id, payload)
  values (p_tenant_id, p_created_by, 'invitation', v_invitation.id, 'EmployeeInvitationCreated', gen_random_uuid()::text, jsonb_build_object('invitation_id', v_invitation.id, 'email', v_email));

  return jsonb_build_object('id', v_invitation.id, 'tenant_id', v_invitation.tenant_id, 'email', v_invitation.email,
    'role_key', v_invitation.role_key, 'status', v_invitation.status, 'expires_at', v_invitation.expires_at,
    'accepted_at', v_invitation.accepted_at, 'invited_by', v_invitation.invited_by, 'created_at', v_invitation.created_at);
exception when unique_violation then
  raise exception using message = 'INVITATION_ALREADY_PENDING';
end;
$$;

create or replace function public.hr_resend_employee_invitation(
  p_tenant_id uuid,
  p_invitation_id uuid,
  p_expires_at timestamptz,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_invitation public.invitations%rowtype;
begin
  if not public.operations_can_access_tenant(p_tenant_id) then
    raise exception using message = 'HR_ACCESS_DENIED';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using message = 'VALIDATION_ERROR';
  end if;
  if (select count(*) from public.audit_logs where tenant_id = p_tenant_id and action = 'member.invitation_resent' and resource_id = p_invitation_id and created_at > now() - interval '10 minutes') >= 3 then
    raise exception using message = 'INVITATION_RESEND_RATE_LIMITED';
  end if;

  update public.invitations
     set token_hash = p_token_hash, expires_at = p_expires_at
   where id = p_invitation_id and tenant_id = p_tenant_id and status = 'pending'
  returning * into v_invitation;
  if not found then raise exception using message = 'INVITATION_NOT_FOUND'; end if;

  insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (p_tenant_id, auth.uid(), 'member.invitation_resent', 'invitation', v_invitation.id, '{}'::jsonb);
  insert into public.outbox_events (tenant_id, actor_user_id, aggregate_type, aggregate_id, event_type, trace_id, payload)
  values (p_tenant_id, auth.uid(), 'invitation', v_invitation.id, 'EmployeeInvitationResent', gen_random_uuid()::text, jsonb_build_object('invitation_id', v_invitation.id));

  return jsonb_build_object('id', v_invitation.id, 'tenant_id', v_invitation.tenant_id, 'email', v_invitation.email,
    'role_key', v_invitation.role_key, 'status', v_invitation.status, 'expires_at', v_invitation.expires_at,
    'accepted_at', v_invitation.accepted_at, 'invited_by', v_invitation.invited_by, 'created_at', v_invitation.created_at);
end;
$$;

create or replace function public.hr_revoke_employee_invitation(
  p_tenant_id uuid,
  p_invitation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_invitation public.invitations%rowtype;
begin
  if not public.operations_can_access_tenant(p_tenant_id) then
    raise exception using message = 'HR_ACCESS_DENIED';
  end if;
  update public.invitations
     set status = 'revoked'
   where id = p_invitation_id and tenant_id = p_tenant_id and status = 'pending'
  returning * into v_invitation;
  if not found then return null; end if;

  insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (p_tenant_id, auth.uid(), 'member.invitation_revoked', 'invitation', v_invitation.id, '{}'::jsonb);
  insert into public.outbox_events (tenant_id, actor_user_id, aggregate_type, aggregate_id, event_type, trace_id, payload)
  values (p_tenant_id, auth.uid(), 'invitation', v_invitation.id, 'EmployeeInvitationRevoked', gen_random_uuid()::text, jsonb_build_object('invitation_id', v_invitation.id));

  return jsonb_build_object('id', v_invitation.id, 'tenant_id', v_invitation.tenant_id, 'email', v_invitation.email,
    'role_key', v_invitation.role_key, 'status', v_invitation.status, 'expires_at', v_invitation.expires_at,
    'accepted_at', v_invitation.accepted_at, 'invited_by', v_invitation.invited_by, 'created_at', v_invitation.created_at);
end;
$$;

revoke all on function public.hr_list_tenant_employees(uuid, integer, integer, text) from public, anon;
revoke all on function public.hr_create_employee_invitation(uuid, text, uuid, timestamptz, text) from public, anon;
revoke all on function public.hr_resend_employee_invitation(uuid, uuid, timestamptz, text) from public, anon;
revoke all on function public.hr_revoke_employee_invitation(uuid, uuid) from public, anon;
grant execute on function public.hr_list_tenant_employees(uuid, integer, integer, text) to authenticated, service_role;
grant execute on function public.hr_create_employee_invitation(uuid, text, uuid, timestamptz, text) to authenticated, service_role;
grant execute on function public.hr_resend_employee_invitation(uuid, uuid, timestamptz, text) to authenticated, service_role;
grant execute on function public.hr_revoke_employee_invitation(uuid, uuid) to authenticated, service_role;
