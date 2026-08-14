begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values('22222222-2222-2222-2222-222222222222','authenticated','authenticated','ci-file@vexonyx.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb);
insert into app.organizations(id,name,slug,created_by)
values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','CI File Org','ci-file-org','22222222-2222-2222-2222-222222222222');
update app.organization_members set role='member'
where organization_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2' and user_id='22222222-2222-2222-2222-222222222222';
insert into app.projects(id,organization_id,created_by,name,status)
values('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','22222222-2222-2222-2222-222222222222','CI File Project','active');
insert into artifacts.files(id,organization_id,project_id,uploaded_by,storage_bucket,storage_path,original_name,declared_mime_type,size_bytes,status,classification)
values('ffffffff-ffff-4fff-8fff-fffffffffff2','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2','22222222-2222-2222-2222-222222222222','project-artifacts','ci/file.txt','file.txt','text/plain',4,'quarantined','confidential');

set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select lives_ok(
  $$select * from artifacts.finalize_upload('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2','ffffffff-ffff-4fff-8fff-fffffffffff2')$$,
  'Organization member can finalize its quarantined project upload'
);
select lives_ok(
  $$select * from artifacts.finalize_upload('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2','ffffffff-ffff-4fff-8fff-fffffffffff2')$$,
  'Upload finalization is idempotent while file remains quarantined'
);
reset role;

select results_eq(
  $$select count(*) from operations.jobs where queue_name='file-processing' and idempotency_key='file-process:ffffffff-ffff-4fff-8fff-fffffffffff2'$$,
  array[1::bigint],
  'Repeated finalization creates exactly one processing job'
);
select results_eq(
  $$select organization_id from operations.jobs where queue_name='file-processing' and idempotency_key='file-process:ffffffff-ffff-4fff-8fff-fffffffffff2'$$,
  array['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'::uuid],
  'Processing job remains bound to the file organization'
);

select * from finish();
rollback;
