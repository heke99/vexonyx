create or replace function app.superadmin_user_directory_count(p_query text default null)
returns bigint
language sql
security definer
set search_path = app, auth, public, pg_temp
as $$
  select count(*)::bigint
  from auth.users u
  left join app.profiles p on p.id = u.id
  where u.deleted_at is null
    and (
      nullif(trim(p_query), '') is null
      or coalesce(u.email, '') ilike '%' || trim(p_query) || '%'
      or coalesce(p.display_name, '') ilike '%' || trim(p_query) || '%'
      or u.id::text = trim(p_query)
    );
$$;

revoke all on function app.superadmin_user_directory_count(text) from public, anon, authenticated;
grant execute on function app.superadmin_user_directory_count(text) to service_role;
