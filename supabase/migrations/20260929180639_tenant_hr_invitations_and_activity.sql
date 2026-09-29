set search_path = '';

create or replace function public.hr_create_tenant_invitation(
  p_tenant_id uuid,
  p_email text,
  p_created_by uuid,
  p_role_key text,
  p_expires_at timestamptz,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.invitations%rowtype;
  v_email text := lower(btrim(p_email));
begin
  if auth.uid() is null or auth.uid() <> p_created_by or not public.operations_can_access_tenant(p_tenant_id) then
    raise exception using message = 'HR_ACCESS_DENIED';
  end if;
  if p_role_key not in ('employee', 'hr') then
    raise exception using message = 'ROLE_NOT_ALLOWED';
  end if;
  if p_role_key = 'hr' and not public.has_role(p_tenant_id, 'admin') then
    raise exception using message = 'ROLE_NOT_ALLOWED';
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
  values (p_tenant_id, v_email, p_role_key, p_token_hash, p_expires_at, p_created_by)
  returning * into v_invitation;

  insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (p_tenant_id, p_created_by, 'member.invited', 'invitation', v_invitation.id,
          jsonb_build_object('role_key', p_role_key));
  insert into public.outbox_events (tenant_id, actor_user_id, aggregate_type, aggregate_id, event_type, trace_id, payload)
  values (p_tenant_id, p_created_by, 'invitation', v_invitation.id, 'EmployeeInvitationCreated', gen_random_uuid()::text,
          jsonb_build_object('invitation_id', v_invitation.id, 'role_key', p_role_key));

  return jsonb_build_object('id', v_invitation.id, 'tenant_id', v_invitation.tenant_id, 'email', v_invitation.email,
    'role_key', v_invitation.role_key, 'status', v_invitation.status, 'expires_at', v_invitation.expires_at,
    'accepted_at', v_invitation.accepted_at, 'invited_by', v_invitation.invited_by, 'created_at', v_invitation.created_at);
exception when unique_violation then
  raise exception using message = 'INVITATION_ALREADY_PENDING';
end;
$$;

revoke all on function public.hr_create_tenant_invitation(uuid, text, uuid, text, timestamptz, text) from public, anon;
grant execute on function public.hr_create_tenant_invitation(uuid, text, uuid, text, timestamptz, text) to authenticated, service_role;

create or replace function public.accept_invitation(p_user_id uuid, p_raw_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user auth.users;
  v_invitation public.invitations;
  v_membership public.memberships;
  v_role_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception using errcode = 'P0001', message = 'AUTHENTICATION_REQUIRED';
  end if;

  select * into v_auth_user from auth.users where id = auth.uid();
  select * into v_invitation
    from public.invitations
   where token_hash = public.hash_invitation_token(p_raw_token)
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'INVITATION_INVALID_TOKEN';
  end if;
  if v_invitation.status = 'accepted' then
    raise exception using errcode = 'P0001', message = 'INVITATION_ALREADY_ACCEPTED';
  end if;
  if v_invitation.status <> 'pending' or v_invitation.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'INVITATION_EXPIRED';
  end if;
  if lower(btrim(coalesce(v_auth_user.email, ''))) <> lower(btrim(v_invitation.email)) then
    raise exception using errcode = 'P0001', message = 'INVITATION_EMAIL_MISMATCH';
  end if;
  if v_invitation.role_key not in ('employee', 'hr') then
    raise exception using errcode = 'P0001', message = 'INVITATION_INVALID_ROLE';
  end if;

  if exists (
    select 1
      from public.memberships m
      join public.membership_roles mr on mr.membership_id = m.id
      join public.roles r on r.id = mr.role_id
     where m.tenant_id = v_invitation.tenant_id
       and m.user_id = auth.uid()
       and r.key in ('hr', 'admin')
  ) then
    raise exception using errcode = 'P0001', message = 'INVITATION_PRIVILEGED_MEMBERSHIP_CONFLICT';
  end if;

  insert into public.memberships (tenant_id, user_id, status)
  values (v_invitation.tenant_id, auth.uid(), 'active')
  on conflict (tenant_id, user_id) do update set status = 'active', suspended_at = null
  returning * into v_membership;

  select id into v_role_id from public.roles where key = v_invitation.role_key;
  insert into public.membership_roles (membership_id, role_id)
  values (v_membership.id, v_role_id)
  on conflict do nothing;

  update public.invitations
     set status = 'accepted', accepted_at = now()
   where id = v_invitation.id;

  insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (v_invitation.tenant_id, auth.uid(), 'invitation.accepted', 'invitation', v_invitation.id,
          jsonb_build_object('membership_id', v_membership.id, 'role_key', v_invitation.role_key));

  return (
    select jsonb_build_object(
      'id', m.id,
      'tenant_id', m.tenant_id,
      'user_id', m.user_id,
      'status', m.status,
      'joined_at', m.joined_at,
      'suspended_at', m.suspended_at,
      'tenant', jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug, 'status', t.status),
      'roles', coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'key', r.key) order by r.key) filter (where r.id is not null), '[]'::jsonb)
    )
      from public.memberships m
      join public.tenants t on t.id = m.tenant_id
      left join public.membership_roles mr on mr.membership_id = m.id
      left join public.roles r on r.id = mr.role_id
     where m.id = v_membership.id
     group by m.id, t.id
  );
end;
$$;

revoke all on function public.accept_invitation(uuid, text) from public, anon, authenticated;
grant execute on function public.accept_invitation(uuid, text) to authenticated, service_role;
