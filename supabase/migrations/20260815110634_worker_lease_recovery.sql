-- Production-aligned worker lease renewal and expired-lease recovery.

create index if not exists jobs_lease_idx
  on operations.jobs(status,lease_expires_at)
  where status in ('leased','running');

create or replace function operations.renew_job_lease(
  p_job_id uuid,
  p_worker_id text,
  p_lease_generation bigint,
  p_lease_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_count integer;
begin
  if p_worker_id is null or length(btrim(p_worker_id))<3 then
    raise exception 'invalid_worker' using errcode='22023';
  end if;
  if p_lease_seconds<10 or p_lease_seconds>3600 then
    raise exception 'invalid_lease_parameters' using errcode='22023';
  end if;

  update operations.jobs
  set lease_expires_at=now()+make_interval(secs=>p_lease_seconds),updated_at=now()
  where id=p_job_id
    and status in ('leased','running')
    and lease_owner=p_worker_id
    and lease_generation=p_lease_generation
    and lease_expires_at>now();
  get diagnostics v_count=row_count;
  return v_count=1;
end
$$;

create or replace function operations.requeue_expired_leases(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path=''
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
       set status=case when j.attempt_count >= j.max_attempts then 'dead_letter'::operations.job_status else 'queued'::operations.job_status end,
           available_at=case when j.attempt_count >= j.max_attempts then j.available_at else now() end,
           lease_owner=null,
           lease_expires_at=null,
           last_error=jsonb_build_object('code','lease_expired'),
           completed_at=case when j.attempt_count >= j.max_attempts then now() else null end,
           updated_at=now()
      from expired e
     where j.id=e.id
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

revoke all on function operations.renew_job_lease(uuid,text,bigint,integer) from public,anon,authenticated;
revoke all on function operations.requeue_expired_leases(integer) from public,anon,authenticated;
grant execute on function operations.renew_job_lease(uuid,text,bigint,integer) to service_role;
grant execute on function operations.requeue_expired_leases(integer) to service_role;

-- Keep the lease recovery job singular and replay-safe.
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
