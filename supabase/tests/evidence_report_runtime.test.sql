begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values('55555555-5555-4555-8555-555555555555','authenticated','authenticated','evidence-report@vexonyx.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb);
insert into app.organizations(id,name,slug,created_by)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5','Evidence Report Org','evidence-report-org','55555555-5555-4555-8555-555555555555');
insert into app.projects(id,organization_id,created_by,name,status)
values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5','55555555-5555-4555-8555-555555555555','Evidence Report Project','active');
insert into security.findings(id,organization_id,project_id,created_by,title,severity,status,first_observed_at)
values('cccccccc-cccc-4ccc-8ccc-ccccccccccc5','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5','55555555-5555-4555-8555-555555555555','Evidence runtime test','high','potential',now());
insert into reports.reports(id,organization_id,project_id,created_by,title,status)
values('dddddddd-dddd-4ddd-8ddd-ddddddddddd5','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5','55555555-5555-4555-8555-555555555555','Runtime report','draft');
insert into reports.report_sections(organization_id,report_id,section_key,title,position,content)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5','dddddddd-dddd-4ddd-8ddd-ddddddddddd5','executive_summary','Executive Summary',20,'{"kind":"markdown","text":"Initial summary"}'::jsonb);

set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-4555-8555-555555555555","email":"evidence-report@vexonyx.invalid","role":"authenticated"}';
create temporary table evidence_result on commit drop as
select * from security.create_finding_evidence('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5','cccccccc-cccc-4ccc-8ccc-ccccccccccc5','text','{"kind":"text","text":"first observation"}'::jsonb,null);
select is((select version from evidence_result),1,'Evidence begins at version one');
select ok((select length(content_hash)=64 from evidence_result),'Evidence version receives a SHA-256 hash');
select lives_ok(
  format('select * from security.append_finding_evidence_version(%L::uuid,%L::uuid,%L::jsonb)','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',(select evidence_id from evidence_result),'{"kind":"text","text":"second observation"}'),
  'Evidence can append a new immutable version'
);
select results_eq(
  format('select version from security.finding_evidence_versions where evidence_id=%L::uuid order by version',(select evidence_id from evidence_result)),
  array[1,2],
  'Both evidence versions remain available'
);

create temporary table report_snapshot on commit drop as
select * from reports.snapshot_report('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5','dddddddd-dddd-4ddd-8ddd-ddddddddddd5');
select is((select version from report_snapshot),1,'First report snapshot is version one');
select ok((select length(content_hash)=64 from report_snapshot),'Report snapshot has a SHA-256 hash');
create temporary table export_result on commit drop as
select * from reports.request_report_export('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5','dddddddd-dddd-4ddd-8ddd-ddddddddddd5',(select report_version_id from report_snapshot),'pdf','report-export-test-key');
select lives_ok(
  format('select * from reports.request_report_export(%L::uuid,%L::uuid,%L::uuid,%L,%L)','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5','dddddddd-dddd-4ddd-8ddd-ddddddddddd5',(select report_version_id from report_snapshot),'pdf','report-export-test-key'),
  'Retrying the same report export request is safe'
);
reset role;

select results_eq(
  $$select count(*) from operations.jobs where queue_name='reports' and idempotency_key like 'report-export:%'$$,
  array[1::bigint],
  'Repeated export request creates one report job'
);

select * from finish();
rollback;
