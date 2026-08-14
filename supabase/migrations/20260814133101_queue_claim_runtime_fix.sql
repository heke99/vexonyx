-- Fix runtime ambiguity in claim_jobs() discovered by fencing smoke test.
-- Keep the original migration immutable; this forward migration replaces the function.
create or replace function operations.claim_jobs(
  p_queue_name text,
  p_worker_id text,
  p_limit integer default 1,
  p_lease_seconds integer default 60
)
returns table(job_id uuid, organization_id uuid, payload jsonb, priority smallint, lease_generation bigint, attempt integer)
language plpgsql security definer set search_path='' as $$
begin
  if p_queue_name not in ('inference','file-processing','embedding','sandbox','reports','email','usage','maintenance') then
    raise exception 'invalid_queue' using errcode='22023';
  end if;
  if p_worker_id is null or length(btrim(p_worker_id))<3 then
    raise exception 'invalid_worker' using errcode='22023';
  end if;
  if p_limit<1 or p_limit>50 or p_lease_seconds<10 or p_lease_seconds>3600 then
    raise exception 'invalid_lease_parameters' using errcode='22023';
  end if;

  return query
  with candidates as (
    select j.id
    from operations.jobs j
    where j.queue_name=p_queue_name
      and j.status='queued'
      and j.available_at<=now()
      and j.attempt_count<j.max_attempts
    order by j.priority asc,j.created_at asc
    for update skip locked
    limit p_limit
  ), claimed as (
    update operations.jobs j
      set status='leased',
          lease_owner=p_worker_id,
          lease_generation=j.lease_generation+1,
          lease_expires_at=now()+make_interval(secs=>p_lease_seconds),
          attempt_count=j.attempt_count+1,
          updated_at=now()
    from candidates c
    where j.id=c.id
    returning j.id,j.organization_id,j.payload,j.priority,j.lease_generation,j.attempt_count
  ), attempts as (
    insert into operations.job_attempts(job_id,attempt,lease_generation,worker_id,status)
    select c.id,c.attempt_count,c.lease_generation,p_worker_id,'started'
    from claimed c
    returning 1 as inserted
  )
  select c.id,c.organization_id,c.payload,c.priority,c.lease_generation,c.attempt_count
  from claimed c;
end $$;

revoke all on function operations.claim_jobs(text,text,integer,integer) from public,anon,authenticated;
grant execute on function operations.claim_jobs(text,text,integer,integer) to service_role;
notify pgrst,'reload schema';
