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

  raise exception using
    errcode = '42501',
    message = 'VEXONYX account creation is disabled while the platform is waitlist-only.';
end;
$$;

revoke all on function public.vexonyx_block_auth_user_creation_waitlist() from public;
revoke all on function public.vexonyx_block_auth_user_creation_waitlist() from anon;
revoke all on function public.vexonyx_block_auth_user_creation_waitlist() from authenticated;

create or replace function public.vexonyx_promote_operator_superadmin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(new.email, '')) = 'info@vexonyx.com' then
    insert into app.profiles (id, display_name, is_superadmin, created_at, updated_at)
    values (new.id, 'VEXONYX Admin', true, now(), now())
    on conflict (id) do update
      set is_superadmin = true,
          updated_at = now();
  end if;
  return new;
end;
$$;

revoke all on function public.vexonyx_promote_operator_superadmin() from public;
revoke all on function public.vexonyx_promote_operator_superadmin() from anon;
revoke all on function public.vexonyx_promote_operator_superadmin() from authenticated;

drop trigger if exists vexonyx_promote_operator_superadmin on auth.users;
create trigger vexonyx_promote_operator_superadmin
after insert on auth.users
for each row
execute function public.vexonyx_promote_operator_superadmin();
