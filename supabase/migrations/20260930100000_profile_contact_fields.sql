alter table public.profiles
  add column if not exists phone text not null default '',
  add column if not exists bio text not null default '',
  add column if not exists department text not null default '',
  add column if not exists job_title text not null default '',
  add column if not exists preferences jsonb not null default '{"notificationsEmail":true,"notificationsInApp":true,"theme":"dark"}'::jsonb;

drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile" on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "users can create their own profile" on public.profiles;
create policy "users can create their own profile" on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);
