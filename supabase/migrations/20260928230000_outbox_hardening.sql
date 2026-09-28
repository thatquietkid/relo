set search_path = public, extensions, pg_catalog;

alter table public.outbox_events
  add column if not exists attempts integer not null default 0,
  add column if not exists lease_owner text,
  add column if not exists lease_until timestamptz,
  add column if not exists available_at timestamptz not null default now(),
  add column if not exists last_error text,
  add column if not exists failed_at timestamptz;

create index if not exists outbox_events_claim_idx
  on public.outbox_events (available_at, occurred_at, id)
  where published_at is null and failed_at is null;

create or replace function public.claim_outbox_batch(p_worker_id text, p_limit integer default 25)
returns setof public.outbox_events
language sql
security definer
set search_path = public, pg_catalog
as $$
  update public.outbox_events event
     set attempts = event.attempts + 1,
         lease_owner = p_worker_id,
         lease_until = now() + interval '5 minutes'
    from (
      select id
        from public.outbox_events
       where published_at is null
         and failed_at is null
         and attempts < 5
         and available_at <= now()
         and (lease_until is null or lease_until < now())
       order by occurred_at, id
       for update skip locked
       limit least(greatest(coalesce(p_limit, 25), 1), 25)
    ) pending
   where event.id = pending.id
  returning event.*;
$$;

create or replace function public.complete_outbox_event(p_event_id uuid, p_worker_id text)
returns boolean language sql security definer set search_path = public, pg_catalog
as $$
  update public.outbox_events
     set published_at = now(), lease_owner = null, lease_until = null, last_error = null
   where id = p_event_id and lease_owner = p_worker_id and published_at is null
  returning true;
$$;

create or replace function public.fail_outbox_event(p_event_id uuid, p_worker_id text, p_error text)
returns boolean language plpgsql security definer set search_path = public, pg_catalog
as $$
declare v_attempts integer;
begin
  select attempts into v_attempts from public.outbox_events where id = p_event_id and lease_owner = p_worker_id and published_at is null for update;
  if not found then return false; end if;
  update public.outbox_events
     set lease_owner = null,
         lease_until = null,
         last_error = left(coalesce(p_error, 'unknown failure'), 2000),
         failed_at = case when v_attempts >= 5 then now() else null end,
         available_at = now() + case v_attempts when 1 then interval '30 seconds' when 2 then interval '2 minutes' when 3 then interval '10 minutes' when 4 then interval '30 minutes' else interval '2 hours' end
   where id = p_event_id;
  return true;
end;
$$;

revoke all on function public.claim_outbox_batch(text, integer) from public, anon, authenticated;
revoke all on function public.complete_outbox_event(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_outbox_event(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_outbox_batch(text, integer) to service_role;
grant execute on function public.complete_outbox_event(uuid, text) to service_role;
grant execute on function public.fail_outbox_event(uuid, text, text) to service_role;
