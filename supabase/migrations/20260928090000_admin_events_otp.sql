create table if not exists public.platform_events (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('auth', 'relocation', 'content', 'growth', 'system')),
  event_name text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  summary text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

alter table public.platform_events enable row level security;

drop policy if exists "admins can view platform events" on public.platform_events;
create policy "admins can view platform events" on public.platform_events for select to authenticated
using (exists (
  select 1 from public.profiles actor
  where actor.id = (select auth.uid()) and actor.role = 'admin'
));

drop policy if exists "admins can append platform events" on public.platform_events;
create policy "admins can append platform events" on public.platform_events for insert to authenticated
with check (exists (
  select 1 from public.profiles actor
  where actor.id = (select auth.uid()) and actor.role = 'admin'
));

create index if not exists platform_events_occurred_at_idx on public.platform_events (occurred_at desc);
create index if not exists platform_events_category_idx on public.platform_events (category);
create index if not exists platform_events_severity_idx on public.platform_events (severity);

insert into public.platform_events (category, event_name, severity, summary, properties, occurred_at)
select * from (values
  ('auth', 'otp_auth_enabled', 'info', 'Passwordless email authentication is ready for the admin workspace.', '{"surface":"admin"}'::jsonb, now() - interval '6 minutes'),
  ('system', 'frontend_deploy_live', 'info', 'Responsive Relo frontend deployment is serving production traffic.', '{"service":"relo-prototype"}'::jsonb, now() - interval '18 minutes'),
  ('system', 'backend_deploy_live', 'info', 'Backend auth and RBAC deployment is healthy.', '{"service":"relo-backend"}'::jsonb, now() - interval '22 minutes'),
  ('growth', 'aarrr_metrics_refreshed', 'info', 'AARRR growth metrics were refreshed for the current programme view.', '{"metrics":["acquisition","activation","retention","referral","revenue"]}'::jsonb, now() - interval '1 hour'),
  ('relocation', 'pending_invitation_threshold', 'warning', 'Three employee invitations have not been opened yet.', '{"count":3,"threshold":3}'::jsonb, now() - interval '2 hours'),
  ('content', 'provider_verification_due', 'warning', 'A curated provider record is due for freshness review.', '{"provider":"Example Movers"}'::jsonb, now() - interval '4 hours'),
  ('auth', 'smtp_configuration_pending', 'critical', 'Production SMTP credentials must be configured before OTP delivery can be used.', '{"destination":"Render environment"}'::jsonb, now() - interval '5 hours')
) as seed(category, event_name, severity, summary, properties, occurred_at)
where not exists (select 1 from public.platform_events);
