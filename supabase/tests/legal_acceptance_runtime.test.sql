begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select ok(
  to_regclass('billing.legal_acceptances') is not null,
  'billing legal acceptance audit table exists'
);

select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='billing' and c.relname='legal_acceptances'),
  'legal acceptance table has RLS enabled'
);

select ok(
  not has_table_privilege('authenticated','billing.legal_acceptances','SELECT'),
  'authenticated users cannot read contractual acceptance audit records directly'
);

select ok(
  not has_table_privilege('authenticated','billing.legal_acceptances','INSERT'),
  'authenticated users cannot forge contractual acceptance records directly'
);

select ok(
  has_table_privilege('service_role','billing.legal_acceptances','SELECT'),
  'service role can read contractual acceptance records'
);

select ok(
  has_table_privilege('service_role','billing.legal_acceptances','INSERT'),
  'service role can write contractual acceptance records'
);

insert into billing.legal_acceptances(
  organization_id,user_id,checkout_kind,catalog_id,
  terms_version,refund_policy_version,acceptable_use_version,
  terms_accepted,refund_policy_accepted,acceptable_use_accepted,
  immediate_performance_requested,professional_use_acknowledged,
  auto_renewal_acknowledged,policy_snapshot
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
  'subscription',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,
  '2026-08-15','2026-08-15','2026-08-15',
  true,true,true,true,true,true,
  '{"test":true}'::jsonb
);

select ok(
  (select retention_until > accepted_at + interval '6 years' from billing.legal_acceptances limit 1),
  'legal acceptance records default to long-term contractual retention'
);

select is(
  (select count(*) from billing.legal_acceptances where terms_accepted and refund_policy_accepted and acceptable_use_accepted),
  1::bigint,
  'acceptance acknowledgement fields persist together'
);

select * from finish();
rollback;
