begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data) values
('66666666-6666-4666-8666-666666666661','authenticated','authenticated','agent-owner@vexonyx.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb),
('66666666-6666-4666-8666-666666666662','authenticated','authenticated','agent-member@vexonyx.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb);
insert into app.organizations(id,name,slug,created_by) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6','Agent Runtime Org','agent-runtime-org','66666666-6666-4666-8666-666666666661');
insert into app.organization_members(organization_id,user_id,role) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6','66666666-6666-4666-8666-666666666662','member');
insert into app.projects(id,organization_id,created_by,name,status) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6','66666666-6666-4666-8666-666666666661','Agent Runtime Project','active');

set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-6666-4666-8666-666666666662","email":"agent-member@vexonyx.invalid","role":"authenticated"}';
create temporary table run_result on commit drop as
select * from ai.start_pre_gpu_agent_run('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6',null,'Prepare a safe assessment plan',true,'agent-runtime-idempotency');
select is((select run_state from run_result),'WAITING_FOR_APPROVAL','Approval-gated run begins waiting for approval');
select ok((select approval_request_id is not null from run_result),'Approval request is created with the run');
select lives_ok(
  $$select * from ai.start_pre_gpu_agent_run('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6',null,'Prepare a safe assessment plan',true,'agent-runtime-idempotency')$$,
  'Retrying start with same idempotency key is safe'
);
select results_eq(
  $$select count(*) from ai.agent_runs where organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6' and idempotency_key='agent-runtime-idempotency'$$,
  array[1::bigint],
  'Idempotent start creates one run'
);
select throws_ok(
  format('select * from security.review_agent_approval(%L::uuid,%L::uuid,%L::security.approval_status,%L)','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',(select approval_request_id from run_result),'approved','member tries to approve'),
  '42501', null, 'Non-admin cannot approve an agent gate'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-6666-4666-8666-666666666661","email":"agent-owner@vexonyx.invalid","role":"authenticated"}';
select lives_ok(
  format('select * from security.review_agent_approval(%L::uuid,%L::uuid,%L::security.approval_status,%L)','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',(select approval_request_id from run_result),'approved','approved for preview'),
  'Organization owner can approve the gate'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-6666-4666-8666-666666666662","email":"agent-member@vexonyx.invalid","role":"authenticated"}';
select lives_ok(
  format('select * from ai.advance_pre_gpu_agent_run(%L::uuid,%L::uuid)','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',(select run_id from run_result)),
  'Run owner can advance one persisted preview step after approval'
);
reset role;

select results_eq(
  format('select current_state from ai.agent_checkpoints where agent_run_id=%L::uuid order by step_number desc limit 1',(select run_id from run_result)),
  array['PLANNING'::text],
  'Latest checkpoint records the resumed planning state'
);

select * from finish();
rollback;
