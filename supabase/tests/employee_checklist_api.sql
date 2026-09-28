begin;

create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(12);

select has_table('public', 'outbox_events', 'employee domain events use a durable outbox');
select has_column('public', 'outbox_events', 'trace_id', 'outbox events retain request trace IDs');
select has_column('public', 'outbox_events', 'payload', 'outbox events retain structured payloads');
select ok(
  exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.checklist_items'::regclass
       and tgname = 'checklist_items_state_transition'
  ),
  'checklist state transitions are guarded in the database'
);
select ok(to_regclass('public.outbox_events_unpublished_idx') is not null, 'outbox polling has an unpublished index');
select ok(to_regprocedure('public.employee_activate_relocation_case(uuid,uuid,jsonb,text)') is not null, 'activation RPC exists');
select ok(to_regprocedure('public.employee_set_checklist_item_state(uuid,uuid,uuid,uuid,text,text,text,text)') is not null, 'checklist mutation RPC exists');
select ok(
  not has_function_privilege(
    'anon',
    'public.employee_set_checklist_item_state(uuid,uuid,uuid,uuid,text,text,text,text)',
    'execute'
  ),
  'anonymous callers cannot execute the checklist mutation RPC'
);
select ok(
  pg_get_functiondef(to_regprocedure('public.employee_activate_relocation_case(uuid,uuid,jsonb,text)'))
    like '%''Collect documents''%'
    and pg_get_functiondef(to_regprocedure('public.employee_activate_relocation_case(uuid,uuid,jsonb,text)'))
      like '%''Set up banking''%',
  'activation RPC owns a fixed default checklist definition'
);
select ok(
  pg_get_functiondef(to_regprocedure('public.employee_activate_relocation_case(uuid,uuid,jsonb,text)'))
    not like '%jsonb_to_recordset(coalesce(p_defaults%',
  'activation RPC does not parse caller-supplied checklist defaults'
);
select ok(
  pg_get_functiondef(to_regprocedure('public.employee_activate_relocation_case(uuid,uuid,jsonb,text)'))
    like '%r.key = ''employee''%',
  'activation RPC requires the employee role'
);
select ok(
  pg_get_functiondef(to_regprocedure('public.employee_set_checklist_item_state(uuid,uuid,uuid,uuid,text,text,text,text)'))
    like '%r.key = ''employee''%',
  'checklist mutation RPC requires the employee role'
);

select * from finish();
rollback;
