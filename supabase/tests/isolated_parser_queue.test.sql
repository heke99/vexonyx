begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values('77777777-7777-4777-8777-777777777777','authenticated','authenticated','isolated-parser@vexonyx.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb);
insert into app.organizations(id,name,slug,created_by)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7','Parser Runtime Org','parser-runtime-org','77777777-7777-4777-8777-777777777777');
insert into app.projects(id,organization_id,created_by,name,status)
values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7','77777777-7777-4777-8777-777777777777','Parser Runtime Project','active');
insert into artifacts.files(id,organization_id,project_id,uploaded_by,storage_bucket,storage_path,original_name,declared_mime_type,size_bytes,status)
values('cccccccc-cccc-4ccc-8ccc-ccccccccccc7','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7','77777777-7777-4777-8777-777777777777','project-artifacts','test/parser.pdf','parser.pdf','application/pdf',128,'safe_for_processing');
insert into artifacts.parser_jobs(id,organization_id,file_id,requested_by,parser_profile,parser_version,status,network_policy)
values('dddddddd-dddd-4ddd-8ddd-ddddddddddd7','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7','cccccccc-cccc-4ccc-8ccc-ccccccccccc7','77777777-7777-4777-8777-777777777777','bounded-document-parser','vexonyx-safe-parser-1','queued','deny_all');

select is((select max_memory_mb from artifacts.parser_jobs where id='dddddddd-dddd-4ddd-8ddd-ddddddddddd7'),2048,'parser jobs use the enforceable 2 GiB Sandbox floor');
select is((select max_wall_seconds from artifacts.parser_jobs where id='dddddddd-dddd-4ddd-8ddd-ddddddddddd7'),30,'parser jobs have an explicit wall-clock limit');

create temporary table parser_claim on commit drop as
select * from artifacts.claim_parser_jobs('parser-test-worker',1,120);
select is((select count(*) from parser_claim),1::bigint,'queued parser job is leased exactly once');
select is((select attempt from parser_claim),1,'claim increments parser attempt count');
select is((select count(*) from artifacts.claim_parser_jobs('parser-test-worker-2',1,120)),0::bigint,'active parser lease prevents a second claim');
select ok(
  artifacts.start_parser_job('dddddddd-dddd-4ddd-8ddd-ddddddddddd7','parser-test-worker',(select lease_generation from parser_claim),'sbx_test','python3.13','test1'),
  'leased parser job transitions to parsing with sandbox identity'
);
select is(
  artifacts.complete_parser_job(
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd7','parser-test-worker',(select lease_generation from parser_claim),
    'ready',null,'{"network":"deny_all","runtime":"python3.13"}'::jsonb,
    '[{"index":0,"content":"bounded parser output","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'::jsonb
  ),
  'ready',
  'parser completion atomically returns ready'
);
select is((select status::text from artifacts.files where id='cccccccc-cccc-4ccc-8ccc-ccccccccccc7'),'ready','successful parser completion promotes the file to ready');
select is((select count(*) from artifacts.file_chunks where file_id='cccccccc-cccc-4ccc-8ccc-ccccccccccc7'),1::bigint,'sanitized parser chunks are persisted');
select ok(
  not has_function_privilege('authenticated','artifacts.claim_parser_jobs(text,integer,integer)','EXECUTE')
  and has_function_privilege('service_role','artifacts.claim_parser_jobs(text,integer,integer)','EXECUTE'),
  'parser queue claim is service-role only'
);

select * from finish();
rollback;
