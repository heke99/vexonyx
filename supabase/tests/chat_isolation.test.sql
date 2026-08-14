begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data) values
('33333333-3333-4333-8333-333333333331','authenticated','authenticated','chat-a@vexonyx.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb),
('33333333-3333-4333-8333-333333333332','authenticated','authenticated','chat-b@vexonyx.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb);
insert into app.organizations(id,name,slug,created_by) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','Chat Isolation Org','chat-isolation-org','33333333-3333-4333-8333-333333333331');
insert into app.organization_members(organization_id,user_id,role) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','33333333-3333-4333-8333-333333333332','member');
insert into app.conversations(id,organization_id,user_id,title,status) values('cccccccc-cccc-4ccc-8ccc-ccccccccccc3','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','33333333-3333-4333-8333-333333333331','Private chat','active');
insert into app.messages(id,organization_id,conversation_id,user_id,role,content) values('dddddddd-dddd-4ddd-8ddd-ddddddddddd3','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','cccccccc-cccc-4ccc-8ccc-ccccccccccc3','33333333-3333-4333-8333-333333333331','user','{"kind":"text","text":"private"}'::jsonb);

set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333332';
select results_eq(
  $$select count(*) from app.conversations where id='cccccccc-cccc-4ccc-8ccc-ccccccccccc3'$$,
  array[0::bigint],
  'A member cannot read another members private conversation'
);
select results_eq(
  $$select count(*) from app.messages where conversation_id='cccccccc-cccc-4ccc-8ccc-ccccccccccc3'$$,
  array[0::bigint],
  'A member cannot read another members private messages'
);
select throws_ok(
  $$insert into app.messages(organization_id,conversation_id,user_id,role,content,idempotency_key) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','cccccccc-cccc-4ccc-8ccc-ccccccccccc3','33333333-3333-4333-8333-333333333332','user','{"kind":"text","text":"intrude"}'::jsonb,'intrude')$$,
  '42501',
  null,
  'A member cannot append to another members conversation'
);
reset role;

select has_column('ai','generation_requests','idempotency_key','Generation requests have idempotency keys');
select has_column('ai','generation_requests','project_id','Generation requests bind project context');
select has_column('app','messages','idempotency_key','Messages have retry-safe idempotency keys');

select * from finish();
rollback;
