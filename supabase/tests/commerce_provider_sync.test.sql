begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into billing.plans(id,code,name,status,is_public,provider,provider_sync_status)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa91','provider-sync-test','Provider Sync Test','draft',false,'stripe','pending');

select throws_ok(
  $$update billing.plans set status='active',is_public=true where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa91'::uuid$$,
  '23514',
  'public_plan_provider_not_synced',
  'public plans cannot publish before Stripe Product sync'
);

update billing.plans set provider_product_id='prod_test_plan',provider_sync_status='synced',provider_synced_at=now()
where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa91'::uuid;

insert into billing.plan_prices(id,plan_id,billing_interval,currency,unit_amount_minor,provider,provider_sync_status,active)
values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa91','month','USD',9900,'stripe','pending',false);

select throws_ok(
  $$update billing.plan_prices set active=true where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91'::uuid$$,
  '23514',
  null,
  'unsynced Stripe prices cannot become checkout active'
);

update billing.plan_prices
set provider_price_id='price_test_monthly',provider_sync_status='synced',provider_synced_at=now(),active=true
where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91'::uuid;

select lives_ok(
  $$update billing.plans set status='active',is_public=true where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa91'::uuid$$,
  'synced plan with a synced active price can publish'
);

select throws_ok(
  $$update billing.plan_prices set active=false,effective_to=now() where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91'::uuid$$,
  '23514',
  'public_plan_cannot_lose_last_checkout_ready_price',
  'a public plan cannot lose its final checkout-ready price'
);

insert into billing.plan_prices(id,plan_id,billing_interval,currency,unit_amount_minor,provider,provider_price_id,provider_sync_status,provider_synced_at,active)
values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb92','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa91','year','USD',99000,'stripe','price_test_yearly','synced',now(),true);

select lives_ok(
  $$update billing.plan_prices set active=false,effective_to=now() where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91'::uuid$$,
  'one price can be deactivated when another synced active price remains'
);

insert into billing.credit_products(id,code,name,credits,currency,unit_amount_minor,provider,provider_sync_status,active)
values('cccccccc-cccc-4ccc-8ccc-cccccccccc91','credits-test','Credits Test',10000,'USD',2500,'stripe','pending',false);

select throws_ok(
  $$update billing.credit_products set active=true where id='cccccccc-cccc-4ccc-8ccc-cccccccccc91'::uuid$$,
  '23514',
  null,
  'credit packs cannot activate before Product and Price sync'
);

select lives_ok(
  $$update billing.credit_products set provider_product_id='prod_test_credit',provider_price_id='price_test_credit',provider_sync_status='synced',provider_synced_at=now(),active=true where id='cccccccc-cccc-4ccc-8ccc-cccccccccc91'::uuid$$,
  'synced credit packs can activate'
);

select ok(
  (select provider_sync_status='synced' and provider_price_id is not null from billing.plan_prices where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb92'::uuid),
  'checkout-ready price retains explicit provider sync state'
);

select * from finish();
rollback;
