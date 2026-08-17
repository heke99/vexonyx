begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create temporary table first_join on commit drop as
select * from launch.join_waitlist(
  'waitlist-lifecycle@vexonyx.invalid','Lifecycle User',null,'Security researcher',null,'test',null,'waitlist-lifecycle-1'
);
create temporary table second_join on commit drop as
select * from launch.join_waitlist(
  'WAITLIST-LIFECYCLE@vexonyx.invalid','Different Name',null,null,null,'test',null,'waitlist-lifecycle-2'
);

select is((select entry_id from first_join),(select entry_id from second_join),'Repeated normalized email resolves to the same waitlist entry');
select is((select count(*)::integer from launch.waitlist_entries where email_normalized='waitlist-lifecycle@vexonyx.invalid'),1,'Repeated joins never create duplicate waitlist rows');
select is(has_function_privilege('anon','launch.join_waitlist(text,text,text,text,text,text,text,text)','EXECUTE'),false,'Public anon role cannot bypass the server waitlist endpoint');

select ok(
  launch.prepare_waitlist_verification_email((select entry_id from first_join),repeat('a',64),'https://www.vexonyx.com/api/v1/waitlist/verify?entry=test&token=one'),
  'First verification request queues an email'
);
select is(
  launch.prepare_waitlist_verification_email((select entry_id from first_join),repeat('b',64),'https://www.vexonyx.com/api/v1/waitlist/verify?entry=test&token=two'),
  false,
  'Verification resend is cooled down instead of invalidating the first link'
);
select is((select count(*)::integer from launch.waitlist_verification_tokens where entry_id=(select entry_id from first_join) and consumed_at is null),1,'Original verification token remains active during resend cooldown');
select is((select count(*)::integer from launch.waitlist_email_deliveries where entry_id=(select entry_id from first_join) and kind='verification'),1,'Verification email is represented by one durable outbox delivery');

select lives_ok(
  format('select * from launch.verify_waitlist(%L::uuid,%L)',(select entry_id from first_join),repeat('a',64)),
  'Valid verification token verifies the waitlist entry'
);
select is((select status from launch.waitlist_entries where id=(select entry_id from first_join)),'verified','Waitlist entry becomes verified');

create temporary table issued_invite on commit drop as
select * from launch.issue_waitlist_invitation(
  (select entry_id from first_join),repeat('c',64),'https://www.vexonyx.com/waitlist/access?entry=test&token=invite'
);
select is((select queued from issued_invite),true,'Verified waitlist entry can be queued for private-beta access');
select is(
  (select email from launch.inspect_waitlist_invitation((select entry_id from first_join),repeat('c',64))),
  'waitlist-lifecycle@vexonyx.invalid',
  'Invitation inspection is bound to the verified waitlist email'
);

select lives_ok(
  format($sql$
    insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
    values(
      '77777777-7777-4777-8777-777777777771','authenticated','authenticated','waitlist-lifecycle@vexonyx.invalid','',now(),now(),now(),
      jsonb_build_object('vexonyx_internal_provisioning','waitlist','waitlist_entry_id',%L,'waitlist_invitation_id',%L),
      jsonb_build_object('name','Lifecycle User')
    )
  $sql$,(select entry_id::text from first_join),(select invitation_id::text from issued_invite)),
  'Creating the invited Auth user atomically converts the waitlist identity'
);
select is((select status from launch.waitlist_entries where id=(select entry_id from first_join)),'converted','Converted waitlist entry is marked converted');
select ok(
  exists(
    select 1 from app.organization_members m
    where m.user_id='77777777-7777-4777-8777-777777777771'::uuid and m.role='organization_owner'
  ),
  'Converted account receives an owned workspace so login has immediate access'
);

select * from finish();
rollback;
