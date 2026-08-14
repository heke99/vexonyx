begin;

select plan(6);

select has_table('ai', 'generation_attempts', 'generation attempts table exists');

select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ai' and c.relname='generation_attempts'),
  'generation attempts has RLS enabled'
);

select ok(
  has_table_privilege('authenticated', 'ai.generation_attempts', 'SELECT'),
  'authenticated users may select through RLS'
);

select ok(
  not has_table_privilege('authenticated', 'ai.generation_attempts', 'INSERT'),
  'authenticated users cannot create trusted generation attempts'
);

select ok(
  not has_table_privilege('authenticated', 'ai.generation_attempts', 'UPDATE'),
  'authenticated users cannot rewrite generation attempts'
);

select ok(
  exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='ai' and t.relname='generation_attempts'
      and c.conname='generation_attempts_request_org_fk'
  ),
  'generation attempt is bound to the same organization as its request'
);

select * from finish();
rollback;
