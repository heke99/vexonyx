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

create table if not exists security.admin_verified_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  browser_secret_hash text not null,
  method text not null default 'password_plus_email_otp' check (method in ('password_plus_email_otp')),
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table security.admin_verified_sessions enable row level security;
revoke all on table security.admin_verified_sessions from public, anon, authenticated;
grant select, insert, update, delete on table security.admin_verified_sessions to service_role;

create index if not exists admin_verified_sessions_user_expiry_idx
  on security.admin_verified_sessions (user_id, expires_at desc)
  where revoked_at is null;

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

-- Superadmin control-plane access is deliberately server/service-role only.
-- A raw Supabase password session must never inherit organization-wide access
-- before the application has completed its email step-up verification.
create or replace function operations.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select org_id is not null and exists (
    select 1
    from app.organization_members m
    where m.organization_id = org_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function operations.has_org_write(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select org_id is not null and exists (
    select 1
    from app.organization_members m
    where m.organization_id = org_id
      and m.user_id = (select auth.uid())
      and m.role in ('organization_owner','organization_admin','member')
  );
$$;

create or replace function operations.has_org_admin(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select org_id is not null and exists (
    select 1
    from app.organization_members m
    where m.organization_id = org_id
      and m.user_id = (select auth.uid())
      and m.role in ('organization_owner','organization_admin')
  );
$$;

drop policy if exists organizations_delete_owner on app.organizations;
create policy organizations_delete_owner
on app.organizations
for delete
to authenticated
using (
  exists (
    select 1
    from app.organization_members m
    where m.organization_id = organizations.id
      and m.user_id = (select auth.uid())
      and m.role = 'organization_owner'
  )
);

drop policy if exists profiles_select_own_or_superadmin on app.profiles;
create policy profiles_select_own
on app.profiles
for select
to authenticated
using ((select auth.uid()) = id);
