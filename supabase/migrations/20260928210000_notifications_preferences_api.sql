set search_path = pg_catalog, public, extensions;

create or replace function public.employee_mark_notification_read(
  p_user_id uuid,
  p_notification_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_notification public.notifications%rowtype;
begin
  if auth.uid() is null or auth.uid() <> p_user_id
     or not exists (
       select 1
         from public.memberships m
         join public.tenants t on t.id = m.tenant_id and t.status = 'active'
         join public.membership_roles mr on mr.membership_id = m.id
         join public.roles r on r.id = mr.role_id and r.key = 'employee'
        where m.user_id = p_user_id and m.status = 'active'
      ) then
    raise exception using message = 'MEMBERSHIP_REQUIRED';
  end if;

  select * into v_notification from public.notifications where id = p_notification_id;
  if not found then raise exception using message = 'NOTIFICATION_NOT_FOUND'; end if;
  if v_notification.user_id <> p_user_id then raise exception using message = 'NOTIFICATION_FORBIDDEN'; end if;
  if v_notification.delivery_status <> 'delivered' then raise exception using message = 'NOTIFICATION_NOT_DELIVERED'; end if;
  if v_notification.read_at is not null then return 'already_read'; end if;

  update public.notifications set read_at = now() where id = p_notification_id;
  return 'updated';
end;
$$;

create or replace function public.employee_update_preferences(
  p_user_id uuid,
  p_timezone text,
  p_notification_settings jsonb,
  p_privacy_settings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_preferences public.user_preferences%rowtype;
begin
  if auth.uid() is null or auth.uid() <> p_user_id
     or p_timezone is null or length(btrim(p_timezone)) = 0 or length(btrim(p_timezone)) > 80
     or coalesce(jsonb_typeof(p_notification_settings), '') <> 'object'
     or coalesce(jsonb_typeof(p_privacy_settings), '') <> 'object'
     or not exists (
       select 1
         from public.memberships m
         join public.tenants t on t.id = m.tenant_id and t.status = 'active'
         join public.membership_roles mr on mr.membership_id = m.id
         join public.roles r on r.id = mr.role_id and r.key = 'employee'
        where m.user_id = p_user_id and m.status = 'active'
      ) then
    raise exception using message = 'MEMBERSHIP_REQUIRED';
  end if;

  insert into public.user_preferences (user_id, timezone, notification_settings, privacy_settings)
  values (p_user_id, btrim(p_timezone), p_notification_settings, p_privacy_settings)
  on conflict (user_id) do update set
    timezone = excluded.timezone,
    notification_settings = excluded.notification_settings,
    privacy_settings = excluded.privacy_settings;

  select * into v_preferences from public.user_preferences where user_id = p_user_id;
  return to_jsonb(v_preferences);
end;
$$;

revoke all on function public.employee_mark_notification_read(uuid, uuid) from public, anon, authenticated;
revoke all on function public.employee_update_preferences(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.employee_mark_notification_read(uuid, uuid) to authenticated;
grant execute on function public.employee_update_preferences(uuid, text, jsonb, jsonb) to authenticated;
