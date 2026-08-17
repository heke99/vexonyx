-- VEXONYX remains strictly waitlist-only. Keep future conversion metadata dormant, but do not allow waitlist account provisioning.

create or replace function public.vexonyx_block_auth_user_creation_waitlist()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if current_user='postgres' then
    return new;
  end if;

  if current_user='supabase_auth_admin' and lower(coalesce(new.email,''))='info@vexonyx.com' then
    return new;
  end if;

  if current_user='supabase_auth_admin'
     and lower(coalesce(new.email,''))='demo@vexonyx.com'
     and security.consume_demo_auth_creation_token(new.raw_user_meta_data ->> 'vexonyx_demo_provisioning_token') then
    new.raw_user_meta_data:=coalesce(new.raw_user_meta_data,'{}'::jsonb)-'vexonyx_demo_provisioning_token';
    return new;
  end if;

  raise exception using
    errcode='42501',
    message='VEXONYX account creation is disabled while the platform is waitlist-only.';
end;
$$;

revoke all on function public.vexonyx_block_auth_user_creation_waitlist() from public,anon,authenticated;
revoke execute on function launch.waitlist_auth_creation_allowed(text,text,text) from supabase_auth_admin;

update launch.waitlist_invitations
set status='revoked'
where status in ('created','sent');

update launch.waitlist_entries
set status='verified',invited_at=null,updated_at=now()
where status='invited' and converted_user_id is null and email_verified_at is not null;

update launch.waitlist_email_deliveries
set status='dead_letter',last_error='signup_closed_waitlist_only',payload='{}'::jsonb,updated_at=now()
where kind='access_invitation' and status in ('queued','sending');

notify pgrst,'reload schema';