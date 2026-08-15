begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values('66666666-6666-4666-8666-666666666666','authenticated','authenticated','credit-ledger@vexonyx.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb);
insert into app.organizations(id,name,slug,created_by)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6','Credit Ledger Org','credit-ledger-org','66666666-6666-4666-8666-666666666666');

select ok(
  has_function_privilege('service_role','billing.apply_credit_entry(uuid,uuid,text,bigint,text,text,jsonb)','EXECUTE'),
  'service role can apply credit ledger entries'
);
select ok(
  not has_function_privilege('authenticated','billing.apply_credit_entry(uuid,uuid,text,bigint,text,text,jsonb)','EXECUTE'),
  'authenticated users cannot apply trusted credit ledger entries directly'
);

select lives_ok(
  $$select * from billing.apply_credit_entry('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'::uuid,'66666666-6666-4666-8666-666666666666'::uuid,'admin_adjustment',100,'credit-test:grant',null,'{}'::jsonb)$$,
  'credit grant executes without PL/pgSQL name ambiguity'
);
select is(
  (select balance from billing.credit_accounts where organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'::uuid),
  100::bigint,
  'credit grant updates balance'
);

select lives_ok(
  $$select * from billing.apply_credit_entry('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'::uuid,'66666666-6666-4666-8666-666666666666'::uuid,'admin_adjustment',100,'credit-test:grant',null,'{}'::jsonb)$$,
  'replaying the same idempotency key is safe'
);
select is(
  (select count(*) from billing.credit_ledger where organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'::uuid),
  1::bigint,
  'duplicate idempotency key creates only one ledger row'
);

select lives_ok(
  $$select * from billing.apply_credit_entry('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'::uuid,'66666666-6666-4666-8666-666666666666'::uuid,'usage',-30,'credit-test:usage',null,'{}'::jsonb)$$,
  'usage debit executes successfully'
);
select throws_ok(
  $$select * from billing.apply_credit_entry('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'::uuid,'66666666-6666-4666-8666-666666666666'::uuid,'usage',-1000,'credit-test:overdraw',null,'{}'::jsonb)$$,
  'P0001',
  'insufficient_credits',
  'credit ledger blocks overdrafts'
);

select * from finish();
rollback;
