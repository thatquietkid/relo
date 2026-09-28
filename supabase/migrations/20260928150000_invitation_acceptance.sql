set search_path = public, extensions, pg_catalog;

create or replace function public.accept_invitation(p_user_id uuid, p_raw_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
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

  insert into public.memberships (tenant_id, user_id, status)
  values (v_invitation.tenant_id, auth.uid(), 'active')
  on conflict (tenant_id, user_id) do update set status = 'active', suspended_at = null
  returning * into v_membership;

  select id into v_role_id from public.roles where key = 'employee';
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
      'roles', coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'key', r.key)) filter (where r.id is not null), '[]'::jsonb)
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
