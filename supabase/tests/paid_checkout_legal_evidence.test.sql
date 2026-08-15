begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values
('77777777-7777-4777-8777-777777777771','authenticated','authenticated','legal-evidence-one@vexonyx.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb),
('77777777-7777-4777-8777-777777777772','authenticated','authenticated','legal-evidence-two@vexonyx.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb);

insert into app.organizations(id,name,slug,created_by)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa71','Legal Evidence Org','legal-evidence-org','77777777-7777-4777-8777-777777777771');

select ok(
  exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='billing' and c.relname='payment_transactions'
      and t.tgname='enforce_paid_checkout_legal_evidence' and not t.tgisinternal
  ),
  'paid checkout legal evidence trigger exists'
);

select throws_ok(
  $$insert into billing.payment_transactions(organization_id,user_id,provider,provider_transaction_id,kind,status,currency,metadata)
    values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa71'::uuid,null,'stripe','pi_legal_incomplete','credit_pack','succeeded','USD','{}'::jsonb)$$,
  'P0001','checkout_legal_evidence_incomplete',
  'paid checkout transaction fails when legal evidence identifiers are incomplete'
);

select throws_ok(
  $$insert into billing.payment_transactions(organization_id,user_id,provider,provider_transaction_id,kind,status,currency,metadata)
    values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa71'::uuid,'77777777-7777-4777-8777-777777777771'::uuid,'stripe','pi_legal_missing','credit_pack','succeeded','USD',
      '{"checkout_session_id":"cs_test_missing","catalog_id":"cccccccc-cccc-4ccc-8ccc-cccccccccc71"}'::jsonb)$$,
  'P0001','checkout_legal_acceptance_missing',
  'paid checkout transaction fails when no matching legal acceptance exists'
);

insert into billing.legal_acceptances(
  id,organization_id,user_id,checkout_kind,catalog_id,
  terms_version,refund_policy_version,acceptable_use_version,
  terms_accepted,refund_policy_accepted,acceptable_use_accepted,
  immediate_performance_requested,professional_use_acknowledged,
  auto_renewal_acknowledged,policy_snapshot,provider_checkout_session_id
) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddd71'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa71'::uuid,
  '77777777-7777-4777-8777-777777777771'::uuid,
  'credit_pack','cccccccc-cccc-4ccc-8ccc-cccccccccc71'::uuid,
  '2026-08-15','2026-08-15','2026-08-15',
  true,true,true,true,true,false,'{"test":"credit_pack"}'::jsonb,'cs_test_credit_pack'
);

select lives_ok(
  $$insert into billing.payment_transactions(organization_id,user_id,provider,provider_transaction_id,kind,status,currency,credits,metadata)
    values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa71'::uuid,'77777777-7777-4777-8777-777777777771'::uuid,'stripe','pi_legal_credit_pack','credit_pack','succeeded','USD',235,
      '{"checkout_session_id":"cs_test_credit_pack","catalog_id":"cccccccc-cccc-4ccc-8ccc-cccccccccc71"}'::jsonb)$$,
  'matching credit-pack checkout legal evidence allows the transaction'
);

select ok(
  (select completed_at is not null from billing.legal_acceptances where id='dddddddd-dddd-4ddd-8ddd-dddddddddd71'::uuid),
  'accepted checkout evidence is marked completed by the paid transaction'
);

insert into billing.legal_acceptances(
  id,organization_id,user_id,checkout_kind,catalog_id,
  terms_version,refund_policy_version,acceptable_use_version,
  terms_accepted,refund_policy_accepted,acceptable_use_accepted,
  immediate_performance_requested,professional_use_acknowledged,
  auto_renewal_acknowledged,policy_snapshot,provider_checkout_session_id
) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddd72'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa71'::uuid,
  '77777777-7777-4777-8777-777777777771'::uuid,
  'subscription','cccccccc-cccc-4ccc-8ccc-cccccccccc72'::uuid,
  '2026-08-15','2026-08-15','2026-08-15',
  true,true,true,true,true,false,'{"test":"subscription_no_renewal"}'::jsonb,'cs_test_subscription_no_renewal'
);

select throws_ok(
  $$insert into billing.payment_transactions(organization_id,user_id,provider,provider_transaction_id,kind,status,currency,metadata)
    values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa71'::uuid,'77777777-7777-4777-8777-777777777771'::uuid,'stripe','pi_legal_subscription_no_renewal','subscription','succeeded','USD',
      '{"checkout_session_id":"cs_test_subscription_no_renewal","catalog_id":"cccccccc-cccc-4ccc-8ccc-cccccccccc72"}'::jsonb)$$,
  'P0001','checkout_legal_acceptance_missing',
  'subscription payment is blocked without auto-renewal acknowledgement'
);

insert into billing.legal_acceptances(
  id,organization_id,user_id,checkout_kind,catalog_id,
  terms_version,refund_policy_version,acceptable_use_version,
  terms_accepted,refund_policy_accepted,acceptable_use_accepted,
  immediate_performance_requested,professional_use_acknowledged,
  auto_renewal_acknowledged,policy_snapshot,provider_checkout_session_id
) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddd73'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa71'::uuid,
  '77777777-7777-4777-8777-777777777771'::uuid,
  'subscription','cccccccc-cccc-4ccc-8ccc-cccccccccc73'::uuid,
  '2026-08-15','2026-08-15','2026-08-15',
  true,true,true,true,true,true,'{"test":"subscription"}'::jsonb,'cs_test_subscription'
);

select lives_ok(
  $$insert into billing.payment_transactions(organization_id,user_id,provider,provider_transaction_id,kind,status,currency,metadata)
    values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa71'::uuid,'77777777-7777-4777-8777-777777777771'::uuid,'stripe','pi_legal_subscription','subscription','succeeded','USD',
      '{"checkout_session_id":"cs_test_subscription","catalog_id":"cccccccc-cccc-4ccc-8ccc-cccccccccc73"}'::jsonb)$$,
  'subscription payment succeeds with complete auto-renewal legal evidence'
);

select lives_ok(
  $$insert into billing.payment_transactions(organization_id,user_id,provider,provider_transaction_id,kind,status,currency,metadata)
    values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa71'::uuid,null,'stripe','in_legal_invoice','invoice','succeeded','USD','{}'::jsonb)$$,
  'invoice lifecycle transactions remain outside checkout acceptance enforcement'
);

select ok(
  not exists (
    select 1 from billing.payment_transactions
    where provider_transaction_id in ('pi_legal_incomplete','pi_legal_missing','pi_legal_subscription_no_renewal')
  ),
  'blocked paid checkout transactions leave no payment rows behind'
);

select * from finish();
rollback;
