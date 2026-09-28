begin;

select plan(7);

select has_column('public', 'outbox_events', 'attempts', 'outbox tracks retry attempts');
select has_column('public', 'outbox_events', 'lease_owner', 'outbox tracks lease ownership');
select has_column('public', 'outbox_events', 'lease_until', 'outbox tracks lease expiry');
select has_column('public', 'outbox_events', 'available_at', 'outbox tracks next availability');
select has_index('public', 'outbox_events', 'outbox_events_claim_idx', 'outbox has a claim index');
select ok(to_regprocedure('public.claim_outbox_batch(text,integer)') is not null, 'outbox claim function is present');
select ok(to_regprocedure('public.fail_outbox_event(uuid,text,text)') is not null, 'outbox failure function is present');

select * from finish();

rollback;
