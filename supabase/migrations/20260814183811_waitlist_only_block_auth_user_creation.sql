create or replace function public.vexonyx_block_auth_user_creation_waitlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'VEXONYX account creation is disabled while the platform is waitlist-only.';
end;
$$;

revoke all on function public.vexonyx_block_auth_user_creation_waitlist() from public;
revoke all on function public.vexonyx_block_auth_user_creation_waitlist() from anon;
revoke all on function public.vexonyx_block_auth_user_creation_waitlist() from authenticated;

drop trigger if exists vexonyx_waitlist_block_auth_user_creation on auth.users;
create trigger vexonyx_waitlist_block_auth_user_creation
before insert on auth.users
for each row
execute function public.vexonyx_block_auth_user_creation_waitlist();
