create table if not exists security.superadmin_identities (
  email text primary key,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint superadmin_identities_email_normalized check (email = lower(trim(email)))
);

alter table security.superadmin_identities enable row level security;
revoke all on table security.superadmin_identities from public, anon, authenticated;
grant select, insert, update, delete on table security.superadmin_identities to service_role;

create or replace function public.vexonyx_is_superadmin_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from security.superadmin_identities i
    where i.email = lower(trim(coalesce(p_email, '')))
      and i.active = true
  );
$$;

revoke all on function public.vexonyx_is_superadmin_email(text) from public, anon, authenticated;
grant execute on function public.vexonyx_is_superadmin_email(text) to service_role, supabase_auth_admin;

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
     and public.vexonyx_is_superadmin_email(new.email) then
    return new;
  end if;

  raise exception using
    errcode = '42501',
    message = 'VEXONYX account creation is disabled while the platform is waitlist-only.';
end;
$$;

create or replace function public.vexonyx_promote_operator_superadmin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.vexonyx_is_superadmin_email(new.email) then
    insert into app.profiles (id, display_name, is_superadmin, created_at, updated_at)
    values (new.id, 'VEXONYX Admin', true, now(), now())
    on conflict (id) do update
      set is_superadmin = true,
          updated_at = now();
  end if;
  return new;
end;
$$;

revoke all on function public.vexonyx_promote_operator_superadmin() from public, anon, authenticated;
