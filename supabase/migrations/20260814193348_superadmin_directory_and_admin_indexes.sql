create or replace function app.superadmin_user_directory(
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  id uuid,
  email text,
  display_name text,
  is_superadmin boolean,
  account_created_at timestamptz,
  last_sign_in_at timestamptz,
  banned_until timestamptz,
  organization_count bigint
)
language sql
security definer
set search_path = app, auth, public, pg_temp
as $$
  select
    u.id,
    u.email::text,
    p.display_name,
    coalesce(p.is_superadmin, false),
    u.created_at,
    u.last_sign_in_at,
    u.banned_until,
    count(distinct om.organization_id)::bigint
  from auth.users u
  left join app.profiles p on p.id = u.id
  left join app.organization_members om on om.user_id = u.id
  where u.deleted_at is null
    and (
      nullif(trim(p_query), '') is null
      or coalesce(u.email, '') ilike '%' || trim(p_query) || '%'
      or coalesce(p.display_name, '') ilike '%' || trim(p_query) || '%'
      or u.id::text = trim(p_query)
    )
  group by u.id, u.email, p.display_name, p.is_superadmin, u.created_at, u.last_sign_in_at, u.banned_until
  order by u.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function app.superadmin_user_directory(text, integer, integer) from public, anon, authenticated;
grant execute on function app.superadmin_user_directory(text, integer, integer) to service_role;

create index if not exists waitlist_entries_status_created_at_idx
  on launch.waitlist_entries (status, created_at desc);
create index if not exists waitlist_entries_created_at_idx
  on launch.waitlist_entries (created_at desc);
create index if not exists organizations_status_created_at_idx
  on app.organizations (status, created_at desc);
create index if not exists generation_requests_created_at_idx
  on ai.generation_requests (created_at desc);
create index if not exists agent_runs_created_at_idx
  on ai.agent_runs (created_at desc);
create index if not exists jobs_status_created_at_idx
  on operations.jobs (status, created_at desc);
create index if not exists usage_monthly_month_start_idx
  on usage.usage_monthly (month_start desc);
create index if not exists audit_logs_created_at_idx
  on audit.audit_logs (created_at desc);
