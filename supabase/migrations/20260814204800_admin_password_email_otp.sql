create table if not exists security.admin_auth_challenges (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('login', 'password_reset')),
  user_id uuid not null references auth.users(id) on delete cascade,
  email_hash text not null,
  browser_secret_hash text not null,
  attempts smallint not null default 0 check (attempts >= 0 and attempts <= 10),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table security.admin_auth_challenges enable row level security;
revoke all on table security.admin_auth_challenges from public, anon, authenticated;
grant select, insert, update, delete on table security.admin_auth_challenges to service_role;

create index if not exists admin_auth_challenges_user_created_idx
  on security.admin_auth_challenges (user_id, created_at desc);

create index if not exists admin_auth_challenges_expiry_idx
  on security.admin_auth_challenges (expires_at)
  where consumed_at is null;

create or replace function public.vexonyx_superadmin_user_id(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  where lower(u.email) = lower(trim(coalesce(p_email, '')))
    and public.vexonyx_is_superadmin_email(u.email)
  limit 1;
$$;

revoke all on function public.vexonyx_superadmin_user_id(text) from public, anon, authenticated;
grant execute on function public.vexonyx_superadmin_user_id(text) to service_role;
