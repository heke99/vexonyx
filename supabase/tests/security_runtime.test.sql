begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values('11111111-1111-1111-1111-111111111111','authenticated','authenticated','ci-member@vexonyx.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb);
insert into app.organizations(id,name,slug,created_by)
values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','CI Security Org','ci-security-org','11111111-1111-1111-1111-111111111111');
update app.organization_members set role='member'
where organization_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1' and user_id='11111111-1111-1111-1111-111111111111';
insert into app.projects(id,organization_id,created_by,name,status)
values('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','11111111-1111-1111-1111-111111111111','CI Security Project','active');
insert into security.engagements(id,organization_id,project_id,created_by,name,type,status)
values
('cccccccc-cccc-cccc-cccc-ccccccccccc1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','11111111-1111-1111-1111-111111111111','Active Engagement','web_application','active'),
('cccccccc-cccc-cccc-cccc-ccccccccccc2','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','11111111-1111-1111-1111-111111111111','Draft Engagement','web_application','draft');

select policies_are(
  'security','engagements',
  array['engagements_tenant_select','engagements_insert_member','engagements_update_scoped','engagements_delete_admin'],
  'Engagements have exactly one scoped update policy'
);

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select results_eq(
  $$update security.engagements set name='ILLEGAL ACTIVE EDIT' where id='cccccccc-cccc-cccc-cccc-ccccccccccc1' returning 1$$,
  $$select 1 where false$$,
  'Member cannot mutate an active engagement'
);
select throws_ok(
  $$update security.engagements set status='active' where id='cccccccc-cccc-cccc-cccc-ccccccccccc2'$$,
  '42501',
  'new row violates row-level security policy for table "engagements"',
  'Member cannot promote a draft engagement to active'
);
reset role;

insert into operations.jobs(id,queue_name,payload,idempotency_key)
values('dddddddd-dddd-dddd-dddd-ddddddddddd1','inference','{}'::jsonb,'ci-fencing-test');
select lives_ok(
  $$select * from operations.claim_jobs('inference','ci-worker-A',1,120)$$,
  'Queue claim executes at runtime'
);
select results_eq(
  $$select count(*) from operations.job_attempts where job_id='dddddddd-dddd-dddd-dddd-ddddddddddd1'$$,
  array[1::bigint],
  'Queue claim creates one attempt record'
);
select results_eq(
  $$select operations.renew_job_lease('dddddddd-dddd-dddd-dddd-ddddddddddd1','ci-worker-A',2,120)$$,
  array[false],
  'Wrong lease generation cannot renew'
);
select results_eq(
  $$select operations.renew_job_lease('dddddddd-dddd-dddd-dddd-ddddddddddd1','ci-worker-A',1,120)$$,
  array[true],
  'Current lease generation renews'
);
select results_eq(
  $$select operations.finish_job('dddddddd-dddd-dddd-dddd-ddddddddddd1','ci-worker-A',2,true,null)$$,
  array[false],
  'Stale worker generation cannot finish'
);
select results_eq(
  $$select operations.finish_job('dddddddd-dddd-dddd-dddd-ddddddddddd1','ci-worker-A',1,true,null)$$,
  array[true],
  'Current worker generation can finish'
);

update operations.system_state
set incident_mode='normal',agents_enabled=true,external_tools_enabled=true,sandbox_scheduling_enabled=true,external_network_enabled=true
where singleton=true;
insert into ai.agent_runs(id,organization_id,project_id,engagement_id,user_id,state,objective)
values('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','cccccccc-cccc-cccc-cccc-ccccccccccc1','11111111-1111-1111-1111-111111111111','MODEL_RUNNING','CI binding test');
select results_eq(
  $$select reason from operations.tool_preflight(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    'cccccccc-cccc-cccc-cccc-ccccccccccc2',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
    'missing-test-tool','1.0.0','domain','example.invalid')$$,
  array['agent_run_scope_binding_mismatch'::text],
  'Tool preflight binds the run to the exact engagement before tool lookup'
);

select * from finish();
rollback;
