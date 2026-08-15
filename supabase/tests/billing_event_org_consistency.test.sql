begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values('77777777-7777-4777-8777-777777777777','authenticated','authenticated','billing-event-org@vexonyx.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb);

insert into app.organizations(id,name,slug,created_by)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7','Billing Event Org A','billing-event-org-a','77777777-7777-4777-8777-777777777777'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc7','Billing Event Org B','billing-event-org-b','77777777-7777-4777-8777-777777777777');

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid='billing.payment_transactions'::regclass
      and tgname='sync_event_organization_from_payment_transaction'
      and not tgisinternal
  ),
  'payment transactions have an audit-organization sync trigger'
);

select ok(
  has_function_privilege('service_role','billing.sync_event_organization_from_payment_transaction()','EXECUTE')
  and not has_function_privilege('authenticated','billing.sync_event_organization_from_payment_transaction()','EXECUTE'),
  'audit sync trigger function is service-role only'
);

insert into billing.events(event_type,external_id,payload)
values('invoice.paid','evt_billing_org_missing','{}'::jsonb);

insert into billing.payment_transactions(
  organization_id,provider,provider_transaction_id,kind,status,currency,metadata
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7','stripe','in_billing_org_missing','invoice','succeeded','USD',
  '{"event_id":"evt_billing_org_missing"}'::jsonb
);

select is(
  (select organization_id from billing.events where external_id='evt_billing_org_missing'),
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7'::uuid,
  'transaction persistence fills a missing billing event organization'
);

insert into billing.events(organization_id,event_type,external_id,payload)
values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7','invoice.paid','evt_billing_org_existing','{}'::jsonb);

insert into billing.payment_transactions(
  organization_id,provider,provider_transaction_id,kind,status,currency,metadata
) values (
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc7','stripe','in_billing_org_existing','invoice','succeeded','USD',
  '{"event_id":"evt_billing_org_existing"}'::jsonb
);

select is(
  (select organization_id from billing.events where external_id='evt_billing_org_existing'),
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7'::uuid,
  'audit sync never overwrites an existing organization with a conflicting one'
);

select * from finish();
rollback;
