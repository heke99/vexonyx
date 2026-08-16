create table if not exists security.demo_auth_creation_tokens (
  token_hash text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

alter table security.demo_auth_creation_tokens enable row level security;
revoke all on table security.demo_auth_creation_tokens from public;
revoke all on table security.demo_auth_creation_tokens from anon;
revoke all on table security.demo_auth_creation_tokens from authenticated;
revoke all on table security.demo_auth_creation_tokens from service_role;

create index if not exists demo_auth_creation_tokens_expires_at_idx
  on security.demo_auth_creation_tokens (expires_at);

create or replace function app.issue_demo_auth_creation_token()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_hash text;
begin
  delete from security.demo_auth_creation_tokens
  where expires_at < now() - interval '10 minutes'
     or used_at is not null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex');

  insert into security.demo_auth_creation_tokens (token_hash, expires_at)
  values (v_hash, now() + interval '2 minutes');

  return v_token;
end;
$$;

revoke all on function app.issue_demo_auth_creation_token() from public;
revoke all on function app.issue_demo_auth_creation_token() from anon;
revoke all on function app.issue_demo_auth_creation_token() from authenticated;
grant execute on function app.issue_demo_auth_creation_token() to service_role;

create or replace function security.consume_demo_auth_creation_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if p_token is null or length(p_token) < 32 then
    return false;
  end if;

  update security.demo_auth_creation_tokens
  set used_at = now()
  where token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
    and used_at is null
    and expires_at > now();

  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke all on function security.consume_demo_auth_creation_token(text) from public;
revoke all on function security.consume_demo_auth_creation_token(text) from anon;
revoke all on function security.consume_demo_auth_creation_token(text) from authenticated;
revoke all on function security.consume_demo_auth_creation_token(text) from service_role;
grant usage on schema security to supabase_auth_admin;
grant execute on function security.consume_demo_auth_creation_token(text) to supabase_auth_admin;

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
     and security.consume_demo_auth_creation_token(
       new.raw_user_meta_data ->> 'vexonyx_demo_provisioning_token'
     ) then
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
