-- Production hardening discovered during the 2026-08-15 E2E review.
-- Keep Superadmin authentication rate limits atomic and independent from the growing audit log.
-- Remove one of two byte-for-byte equivalent parser queue indexes.

create table if not exists security.admin_auth_rate_limits (
  scope text not null,
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (scope, subject_hash)
);

alter table security.admin_auth_rate_limits enable row level security;
revoke all on security.admin_auth_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on security.admin_auth_rate_limits to service_role;

create or replace function security.consume_admin_auth_rate_limit(
  p_scope text,
  p_subject_hash text,
  p_max_attempts integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row security.admin_auth_rate_limits%rowtype;
  v_reset boolean;
  v_next_count integer;
begin
  if p_scope is null or length(p_scope) < 1 or length(p_scope) > 80 then
    raise exception 'invalid_rate_limit_scope' using errcode = '22023';
  end if;
  if p_subject_hash is null or p_subject_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_rate_limit_subject' using errcode = '22023';
  end if;
  if p_max_attempts < 1 or p_max_attempts > 1000 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid_rate_limit_configuration' using errcode = '22023';
  end if;

  select * into v_row
  from security.admin_auth_rate_limits
  where scope = p_scope and subject_hash = p_subject_hash
  for update;

  if not found then
    insert into security.admin_auth_rate_limits(scope, subject_hash, window_started_at, attempt_count, locked_until, updated_at)
    values(p_scope, p_subject_hash, v_now, 1, null, v_now);
    return true;
  end if;

  if v_row.locked_until is not null and v_row.locked_until > v_now then
    return false;
  end if;

  v_reset := v_row.window_started_at + make_interval(secs => p_window_seconds) <= v_now;
  v_next_count := case when v_reset then 1 else v_row.attempt_count + 1 end;

  update security.admin_auth_rate_limits
  set window_started_at = case when v_reset then v_now else window_started_at end,
      attempt_count = v_next_count,
      locked_until = case
        when v_next_count > p_max_attempts then v_now + make_interval(secs => p_window_seconds)
        else null
      end,
      updated_at = v_now
  where scope = p_scope and subject_hash = p_subject_hash;

  return v_next_count <= p_max_attempts;
end
$$;

create or replace function security.clear_admin_auth_rate_limit(
  p_scope text,
  p_subject_hash text
)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from security.admin_auth_rate_limits
  where scope = p_scope and subject_hash = p_subject_hash;
$$;

revoke all on function security.consume_admin_auth_rate_limit(text,text,integer,integer) from public, anon, authenticated;
revoke all on function security.clear_admin_auth_rate_limit(text,text) from public, anon, authenticated;
grant execute on function security.consume_admin_auth_rate_limit(text,text,integer,integer) to service_role;
grant execute on function security.clear_admin_auth_rate_limit(text,text) to service_role;

-- Both indexes had the exact same predicate and key order. Keep parser_jobs_claim_idx,
-- which communicates the runtime purpose used by the claim worker.
drop index if exists artifacts.parser_jobs_queue_idx;
