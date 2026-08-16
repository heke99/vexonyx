create or replace function app.get_demo_user_id()
returns uuid
language sql
stable
security definer
set search_path=''
as $$
  select u.id
  from auth.users u
  where lower(u.email)=lower('demo@vexonyx.com')
  order by u.created_at
  limit 1
$$;

revoke all on function app.get_demo_user_id() from public, anon, authenticated;
grant execute on function app.get_demo_user_id() to service_role;
