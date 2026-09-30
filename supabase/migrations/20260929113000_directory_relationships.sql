do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'providers_city_id_fkey') then
    alter table public.providers
      add constraint providers_city_id_fkey
      foreign key (city_id) references public.cities(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'directory_entries_provider_id_fkey') then
    alter table public.directory_entries
      add constraint directory_entries_provider_id_fkey
      foreign key (provider_id) references public.providers(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'provider_requests_case_id_fkey') then
    alter table public.provider_requests
      add constraint provider_requests_case_id_fkey
      foreign key (case_id) references public.relocation_cases(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'provider_requests_directory_entry_id_fkey') then
    alter table public.provider_requests
      add constraint provider_requests_directory_entry_id_fkey
      foreign key (directory_entry_id) references public.directory_entries(id);
  end if;
end;
$$;

drop policy if exists "tenant operators can view relocation cases" on public.relocation_cases;
create policy "tenant operators can view relocation cases"
  on public.relocation_cases for select to authenticated
  using (public.operations_can_access_tenant(tenant_id));

notify pgrst, 'reload schema';
