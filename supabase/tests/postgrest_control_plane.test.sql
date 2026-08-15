begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select ok(
  coalesce((select array_to_string(rolconfig, ',') from pg_roles where rolname='authenticator'),'') like '%pgrst.db_schemas=%operations%audit%marketing%',
  'PostgREST exposes operations, audit and marketing control-plane schemas in order'
);
select ok(has_schema_privilege('service_role','operations','USAGE') and has_schema_privilege('service_role','audit','USAGE') and has_schema_privilege('service_role','marketing','USAGE'),
  'service role can address all exposed control-plane schemas');
select ok(not has_schema_privilege('authenticated','audit','USAGE'),
  'authenticated users cannot address audit schema directly');
select ok(not has_schema_privilege('authenticated','marketing','USAGE'),
  'authenticated users cannot address marketing schema directly');

select * from finish();
rollback;
