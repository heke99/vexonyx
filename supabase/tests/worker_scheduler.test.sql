begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select ok(exists(select 1 from pg_extension where extname='pg_cron'),'pg_cron is enabled');
select ok(exists(select 1 from pg_extension where extname='pg_net'),'pg_net is enabled');
select is((select enabled from security.worker_scheduler_config where singleton),false,'scheduler is fail-closed until production enablement');
select is(security.invoke_worker('/api/internal/workers/isolated-parser'),null::bigint,'disabled scheduler makes no outbound request');

select ok(
  security.verify_worker_token((select decrypted_secret from vault.decrypted_secrets where name='vexonyx_worker_scheduler_token' order by created_at desc limit 1)),
  'Vault worker token verifies through its stored hash'
);
select ok(not security.verify_worker_token(repeat('0',64)),'incorrect worker token is rejected');
select ok(
  has_function_privilege('service_role','security.verify_worker_token(text)','EXECUTE')
  and not has_function_privilege('authenticated','security.verify_worker_token(text)','EXECUTE'),
  'worker token verification is service-role only'
);
select ok(not has_function_privilege('service_role','security.invoke_worker(text)','EXECUTE'),'HTTP scheduler invocation is not exposed through PostgREST roles');
select is((select count(*) from cron.job where jobname in ('vexonyx-file-processing','vexonyx-isolated-parser','vexonyx-render-reports','vexonyx-marketing-exports')),4::bigint,'exactly four stable worker schedules exist');
select ok(
  (select count(*) from security.worker_credentials where name='supabase-scheduler' and active and token_hash ~ '^[0-9a-f]{64}$')=1,
  'only the scheduler token digest is stored in the security registry'
);

select * from finish();
rollback;
