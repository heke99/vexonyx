begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data) values
('44444444-4444-4444-8444-444444444441','authenticated','authenticated','owner-invite@vexonyx.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb),
('44444444-4444-4444-8444-444444444442','authenticated','authenticated','member-invite@vexonyx.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb),
('44444444-4444-4444-8444-444444444443','authenticated','authenticated','wrong-invite@vexonyx.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb);
insert into app.organizations(id,name,slug,created_by) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','Invitation Org','invitation-org','44444444-4444-4444-8444-444444444441');

set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-8444-444444444441","email":"owner-invite@vexonyx.invalid","role":"authenticated"}';
create temporary table invitation_result on commit drop as
select * from app.create_organization_invitation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','member-invite@vexonyx.invalid','member');
select ok((select length(raw_token)=64 from invitation_result),'Invitation returns a one-time raw token');
select ok((select expires_at > now() from invitation_result),'Invitation has a future expiry');
select throws_ok(
  $$select * from app.create_organization_invitation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','wrong-invite@vexonyx.invalid','organization_owner')$$,
  '22023', null, 'Invitation cannot grant organization owner access'
);
reset role;

select is(
  (select length(token_hash) from app.organization_invitations where id=(select invitation_id from invitation_result)),
  64,
  'Only the token hash is persisted'
);
select isnt(
  (select token_hash from app.organization_invitations where id=(select invitation_id from invitation_result)),
  (select raw_token from invitation_result),
  'Persisted token is not the raw invitation token'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-8444-444444444443","email":"wrong-invite@vexonyx.invalid","role":"authenticated"}';
select throws_ok(
  format('select * from app.accept_organization_invitation(%L::uuid,%L)',(select invitation_id from invitation_result),(select raw_token from invitation_result)),
  '42501', null, 'Different email cannot accept the invitation'
);

set local request.jwt.claims = '{"sub":"44444444-4444-4444-8444-444444444442","email":"member-invite@vexonyx.invalid","role":"authenticated"}';
select lives_ok(
  format('select * from app.accept_organization_invitation(%L::uuid,%L)',(select invitation_id from invitation_result),(select raw_token from invitation_result)),
  'Invited email can accept the invitation'
);
reset role;

select * from finish();
rollback;
