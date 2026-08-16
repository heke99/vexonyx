begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select has_schema('policies','Policy schema exists');
select has_table('policies','policy_sets','Versioned policy sets exist');
select has_table('ai','agent_profiles','Agent profile registry exists');
select results_eq($$select count(*) from ai.tool_definitions where enabled$$,array[0::bigint],'Seeded offensive/security tool definitions remain disabled');
select ok((select count(*) >= 7 from ai.agent_profiles where organization_id is null),'Built-in platform agent profiles are present');
select ok(exists(select 1 from policies.policy_assignments a join policies.policy_versions v on v.id=a.policy_version_id join policies.policy_sets s on s.id=v.policy_set_id where s.key='pentesting-professional' and a.scope_type='global' and a.enabled),'Professional security policy is globally assigned');

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data) values
('77777777-7777-4777-8777-777777777771','authenticated','authenticated','policy-owner@vexonyx.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb);
insert into app.organizations(id,name,slug,created_by) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7','Policy Test Org','policy-test-org','77777777-7777-4777-8777-777777777771'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8','Other Policy Org','other-policy-test-org','77777777-7777-4777-8777-777777777771');
insert into app.projects(id,organization_id,created_by,name,status) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7','77777777-7777-4777-8777-777777777771','Policy Test Project','active');
insert into ai.agent_runs(id,organization_id,project_id,user_id,objective,state) values('cccccccc-cccc-4ccc-8ccc-ccccccccccc7','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7','77777777-7777-4777-8777-777777777771','Evaluate effective policy','PLANNING');

select results_eq(
  $$select final_action from policies.evaluate_action('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7','cccccccc-cccc-4ccc-8ccc-ccccccccccc7','tool','network-scan')$$,
  array['allow_scoped'::text],
  'Global policy resolves network scanning to scope-only'
);
select results_eq(
  $$select requires_approval from policies.evaluate_action('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7','cccccccc-cccc-4ccc-8ccc-ccccccccccc7','tool','shell')$$,
  array[true],
  'Sandbox shell policy preserves explicit approval requirement'
);

insert into ai.agent_profiles(id,organization_id,slug,name,category,current_version) values('dddddddd-dddd-4ddd-8ddd-ddddddddddd8','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8','other-tenant-agent','Other Tenant Agent','security',1);
insert into ai.agent_profile_versions(id,agent_profile_id,version,status) values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee8','dddddddd-dddd-4ddd-8ddd-ddddddddddd8',1,'internal');
select throws_ok(
  $$insert into app.conversations(organization_id,user_id,title,status,agent_profile_id,agent_profile_version_id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7','77777777-7777-4777-8777-777777777771','Cross tenant profile','active','dddddddd-dddd-4ddd-8ddd-ddddddddddd8','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee8')$$,
  '23514',null,'Conversation cannot reference another tenant agent profile'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"77777777-7777-4777-8777-777777777771","email":"policy-owner@vexonyx.invalid","role":"authenticated"}';
select results_eq(
  $$select count(*) from ai.available_models_for_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7')$$,
  array[0::bigint],
  'No specific model alias is exposed before enabled deployment and entitlement'
);
reset role;

select * from finish();
rollback;