-- Crash-safe worker recovery. A process can disappear after claiming a job; expired
-- leases must become claimable again without human intervention.

create or replace function operations.requeue_expired_leases(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid_limit' using errcode='22023';
  end if;

  with expired as (
    select id
    from operations.jobs
    where status in ('leased','running')
      and lease_expires_at <= now()
    order by lease_expires_at
    for update skip locked
    limit p_limit
  ), updated as (
    update operations.jobs j
       set status = case when j.attempt_count >= j.max_attempts then 'dead_letter'::operations.job_status else 'queued'::operations.job_status end,
           available_at = case when j.attempt_count >= j.max_attempts then j.available_at else now() end,
           lease_owner = null,
           lease_expires_at = null,
           last_error = jsonb_build_object('code','lease_expired'),
           completed_at = case when j.attempt_count >= j.max_attempts then now() else null end,
           updated_at = now()
      from expired e
     where j.id = e.id
    returning j.id,j.attempt_count,j.lease_generation
  ), marked_attempts as (
    update operations.job_attempts a
       set status='lease_lost',
           error=jsonb_build_object('code','lease_expired'),
           completed_at=now()
      from updated u
     where a.job_id=u.id
       and a.attempt=u.attempt_count
       and a.lease_generation=u.lease_generation
       and a.status='started'
    returning a.job_id
  )
  select count(*)::integer into v_count from updated;

  return v_count;
end
$$;

revoke all on function operations.requeue_expired_leases(integer) from public, anon, authenticated;

create or replace function artifacts.requeue_expired_parser_leases(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid_limit' using errcode='22023';
  end if;

  with expired as (
    select id
    from artifacts.parser_jobs
    where status in ('leased','parsing')
      and lease_expires_at <= now()
    order by lease_expires_at
    for update skip locked
    limit p_limit
  ), updated as (
    update artifacts.parser_jobs j
       set status = case when j.attempt_count >= 5 then 'dead_letter' else 'failed' end,
           lease_owner = null,
           lease_expires_at = null,
           sandbox_session_id = null,
           sandbox_runtime = null,
           sandbox_region = null,
           error_code = 'parser_lease_expired',
           completed_at = case when j.attempt_count >= 5 then now() else null end,
           updated_at = now()
      from expired e
     where j.id=e.id
    returning j.id,j.file_id,j.attempt_count
  ), dead_files as (
    update artifacts.files f
       set status='failed',
           blocked_reason='parser_lease_expired',
           updated_at=now()
      from updated u
     where f.id=u.file_id and u.attempt_count >= 5
    returning f.id
  )
  select count(*)::integer into v_count from updated;

  return v_count;
end
$$;

revoke all on function artifacts.requeue_expired_parser_leases(integer) from public, anon, authenticated;

-- Stable schedule name makes replay/idempotent upgrades safe.
do $schedule$
declare r record;
begin
  for r in select jobid from cron.job where jobname='vexonyx-lease-recovery' loop
    perform cron.unschedule(r.jobid);
  end loop;
end
$schedule$;

select cron.schedule(
  'vexonyx-lease-recovery',
  '* * * * *',
  $$select operations.requeue_expired_leases(500), artifacts.requeue_expired_parser_leases(500);$$
);
