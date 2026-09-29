alter table public.relocation_cases
  add constraint relocation_cases_destination_city_id_fkey
  foreign key (destination_city_id) references public.cities(id) on delete restrict;

notify pgrst, 'reload schema';
