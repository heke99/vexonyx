begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

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
select is(has_function_privilege('anon','launch.join_waitlist(text,text,text,text,text,text,text,text)','EXECUTE'),false,'Anon cannot bypass the server waitlist endpoint');
select is(has_function_privilege('authenticated','launch.join_waitlist(text,text,text,text,text,text,text,text)','EXECUTE'),false,'Authenticated users cannot bypass the server waitlist endpoint');

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
select is((select status from launch.waitlist_entries where id=(select entry_id from first_join)),'verified','Waitlist entry becomes verified and stops there');

select ok(to_regprocedure('launch.issue_waitlist_invitation(uuid,text,text)') is null,'Waitlist access invitation function does not exist');
select ok(to_regprocedure('launch.inspect_waitlist_invitation(uuid,text)') is null,'Waitlist account activation inspection function does not exist');
select unlike(
  pg_get_functiondef('public.vexonyx_block_auth_user_creation_waitlist()'::regprocedure),
  '%vexonyx_internal_provisioning%',
  'Auth creation trigger has no waitlist provisioning bypass'
);

select * from finish();
rollback;
