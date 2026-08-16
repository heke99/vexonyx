-- Allow the internal demo account to be created through Supabase Admin only,
-- while preserving the public waitlist-only Auth creation lock.
create or replace function public.vexonyx_block_auth_user_creation_waitlist()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'postgres' then
    return new;
  end if;

  if current_user = 'supabase_auth_admin'
     and lower(coalesce(new.email, '')) = 'info@vexonyx.com' then
    return new;
  end if;

  if current_user = 'supabase_auth_admin'
     and lower(coalesce(new.email, '')) = 'demo@vexonyx.com'
     and coalesce(new.raw_app_meta_data ->> 'vexonyx_internal_provisioning', '') = 'demo' then
    return new;
  end if;

  raise exception using
    errcode = '42501',
    message = 'VEXONYX account creation is disabled while the platform is waitlist-only.';
end;
$$;

revoke all on function public.vexonyx_block_auth_user_creation_waitlist() from public;
revoke all on function public.vexonyx_block_auth_user_creation_waitlist() from anon;
revoke all on function public.vexonyx_block_auth_user_creation_waitlist() from authenticated;
