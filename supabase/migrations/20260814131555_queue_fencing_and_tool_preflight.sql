-- Queue workers use lease generation as a fencing token so stale workers cannot commit results.
-- Tool execution remains fail-closed and is evaluated only from trusted control-plane state.

create or replace function security.target_scope_decision(
  p_organization_id uuid,
  p_engagement_id uuid,
  p_type security.scope_type,
  p_value text
)
returns table(allowed boolean, reason text, normalized_target text)
language plpgsql stable security definer set search_path='' as $$
declare
  v_target text;
  v_excluded boolean := false;
  v_included boolean := false;
begin
  if not security.authorization_is_active(p_organization_id,p_engagement_id,now()) then
    return query select false,'authorization_not_active'::text,null::text; return;
  end if;
  if not exists(
    select 1 from security.engagements e
    where e.id=p_engagement_id and e.organization_id=p_organization_id and e.status='active'
  ) then
    return query select false,'engagement_not_active'::text,null::text; return;
  end if;

  begin
    v_target := security.normalize_scope_value(p_type,p_value);
  exception when others then
    return query select false,'target_normalization_failed'::text,null::text; return;
  end;

  if p_type='ip' then
    select exists(
      select 1 from security.engagement_scope s
      where s.organization_id=p_organization_id and s.engagement_id=p_engagement_id and s.is_excluded
        and ((s.type='ip' and s.normalized_value=v_target)
          or (s.type='cidr' and v_target::inet << s.normalized_value::cidr))
    ) into v_excluded;
    select exists(
      select 1 from security.engagement_scope s
      where s.organization_id=p_organization_id and s.engagement_id=p_engagement_id and not s.is_excluded
        and ((s.type='ip' and s.normalized_value=v_target)
          or (s.type='cidr' and v_target::inet << s.normalized_value::cidr))
    ) into v_included;
  else
    select exists(
      select 1 from security.engagement_scope s
      where s.organization_id=p_organization_id and s.engagement_id=p_engagement_id
        and s.is_excluded and s.type=p_type and s.normalized_value=v_target
    ) into v_excluded;
    select exists(
      select 1 from security.engagement_scope s
      where s.organization_id=p_organization_id and s.engagement_id=p_engagement_id
        and not s.is_excluded and s.type=p_type and s.normalized_value=v_target
    ) into v_included;
  end if;

  if v_excluded then
    return query select false,'target_explicitly_excluded'::text,v_target; return;
  end if;
  if not v_included then
    return query select false,'target_not_in_scope'::text,v_target; return;
  end if;
  return query select true,'authorized_in_scope'::text,v_target;
end $$;

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
    returning job_id
  )
  select c.id,c.organization_id,c.payload,c.priority,c.lease_generation,c.attempt_count
  from claimed c;
end $$;

create or replace function operations.start_job(
  p_job_id uuid,
  p_worker_id text,
  p_lease_generation bigint
)
returns boolean
language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  update operations.jobs
  set status='running',updated_at=now()
  where id=p_job_id
    and status='leased'
    and lease_owner=p_worker_id
    and lease_generation=p_lease_generation
    and lease_expires_at>now();
  get diagnostics v_count=row_count;
  return v_count=1;
end $$;

create or replace function operations.finish_job(
  p_job_id uuid,
  p_worker_id text,
  p_lease_generation bigint,
  p_success boolean,
  p_error jsonb default null
)
returns boolean
language plpgsql security definer set search_path='' as $$
declare
  v_count integer;
  v_attempt integer;
begin
  select attempt_count into v_attempt
  from operations.jobs
  where id=p_job_id
    and lease_owner=p_worker_id
    and lease_generation=p_lease_generation
    and status in ('leased','running')
    and lease_expires_at>now()
  for update;
  if not found then return false; end if;

  update operations.jobs
  set status=case
        when p_success then 'succeeded'::operations.job_status
        when attempt_count>=max_attempts then 'dead_letter'::operations.job_status
        else 'queued'::operations.job_status
      end,
      available_at=case
        when p_success or attempt_count>=max_attempts then available_at
        else now()+make_interval(secs=>least(300,5*attempt_count))
      end,
      last_error=case when p_success then null else coalesce(p_error,'{}'::jsonb) end,
      completed_at=case when p_success or attempt_count>=max_attempts then now() else null end,
      lease_owner=null,
      lease_expires_at=null,
      updated_at=now()
  where id=p_job_id and lease_owner=p_worker_id and lease_generation=p_lease_generation;
  get diagnostics v_count=row_count;
  if v_count<>1 then return false; end if;

  update operations.job_attempts
  set status=case when p_success then 'succeeded' else 'failed' end,
      error=case when p_success then null else p_error end,
      completed_at=now()
  where job_id=p_job_id
    and attempt=v_attempt
    and lease_generation=p_lease_generation
    and worker_id=p_worker_id;
  return true;
end $$;

create or replace function operations.requeue_expired_leases(p_limit integer default 100)
returns integer
language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  if p_limit<1 or p_limit>1000 then
    raise exception 'invalid_limit' using errcode='22023';
  end if;

  with expired as (
    select id
    from operations.jobs
    where status in ('leased','running') and lease_expires_at<=now()
    order by lease_expires_at
    for update skip locked
    limit p_limit
  ), updated as (
    update operations.jobs j
    set status=case
          when j.attempt_count>=j.max_attempts then 'dead_letter'::operations.job_status
          else 'queued'::operations.job_status
        end,
        lease_owner=null,
        lease_expires_at=null,
        last_error=jsonb_build_object('code','lease_expired'),
        completed_at=case when j.attempt_count>=j.max_attempts then now() else null end,
        updated_at=now()
    from expired e
    where j.id=e.id
    returning j.id,j.attempt_count,j.lease_generation
  )
  update operations.job_attempts a
  set status='lease_lost',error=jsonb_build_object('code','lease_expired'),completed_at=now()
  from updated u
  where a.job_id=u.id
    and a.attempt=u.attempt_count
    and a.lease_generation=u.lease_generation
    and a.status='started';
  get diagnostics v_count=row_count;
  return v_count;
end $$;

create or replace function operations.tool_preflight(
  p_organization_id uuid,
  p_project_id uuid,
  p_engagement_id uuid,
  p_agent_run_id uuid,
  p_tool_name text,
  p_tool_version text,
  p_target_type security.scope_type,
  p_target_value text
)
returns table(allowed boolean, reason text, normalized_target text, requires_approval boolean)
language plpgsql stable security definer set search_path='' as $$
declare
  v_state operations.system_state%rowtype;
  v_tool ai.tool_definitions%rowtype;
  v_scope record;
  v_requires_approval boolean;
  v_approved boolean := false;
begin
  select * into v_state from operations.system_state where singleton=true;
  if not found then
    return query select false,'system_state_missing'::text,null::text,false; return;
  end if;
  if v_state.incident_mode in ('maintenance','security_lockdown') then
    return query select false,('incident_mode_'||v_state.incident_mode::text),null::text,false; return;
  end if;
  if not v_state.agents_enabled then
    return query select false,'agents_disabled'::text,null::text,false; return;
  end if;
  if not v_state.external_tools_enabled then
    return query select false,'external_tools_disabled'::text,null::text,false; return;
  end if;
  if not v_state.sandbox_scheduling_enabled then
    return query select false,'sandbox_scheduling_disabled'::text,null::text,false; return;
  end if;
  if not v_state.external_network_enabled then
    return query select false,'external_network_disabled'::text,null::text,false; return;
  end if;

  if not exists(
    select 1 from app.projects p
    where p.id=p_project_id and p.organization_id=p_organization_id
      and p.status='active' and p.deleted_at is null
  ) then
    return query select false,'project_not_active'::text,null::text,false; return;
  end if;
  if not exists(
    select 1 from ai.agent_runs r
    where r.id=p_agent_run_id and r.organization_id=p_organization_id
      and (r.project_id is null or r.project_id=p_project_id)
      and r.state not in ('COMPLETED','FAILED','CANCELLED')
  ) then
    return query select false,'agent_run_not_active'::text,null::text,false; return;
  end if;

  select * into v_tool
  from ai.tool_definitions t
  where t.name=p_tool_name and t.version=p_tool_version and t.enabled=true and t.retired_at is null;
  if not found then
    return query select false,'tool_version_not_enabled'::text,null::text,false; return;
  end if;
  v_requires_approval := v_tool.requires_approval;

  if exists(
    select 1 from operations.kill_switches k
    where k.enabled and k.deactivated_at is null and (
      k.scope_type='global'
      or (k.scope_type='organization' and k.scope_id=p_organization_id::text)
      or (k.scope_type='project' and k.scope_id=p_project_id::text)
      or (k.scope_type='run' and k.scope_id=p_agent_run_id::text)
      or (k.scope_type='tool' and k.scope_id=p_tool_name)
      or k.scope_type in ('sandbox','external_network')
    )
  ) then
    return query select false,'kill_switch_active'::text,null::text,v_requires_approval; return;
  end if;

  select * into v_scope
  from security.target_scope_decision(p_organization_id,p_engagement_id,p_target_type,p_target_value);
  if not coalesce(v_scope.allowed,false) then
    return query select false,coalesce(v_scope.reason,'scope_denied'),v_scope.normalized_target,v_requires_approval; return;
  end if;

  if v_requires_approval then
    select exists(
      select 1 from security.approval_requests a
      where a.organization_id=p_organization_id
        and a.project_id=p_project_id
        and a.agent_run_id=p_agent_run_id
        and a.status='approved'
        and a.operation_type=p_tool_name
        and (a.expires_at is null or a.expires_at>now())
    ) into v_approved;
    if not v_approved then
      return query select false,'approval_required'::text,v_scope.normalized_target,true; return;
    end if;
  end if;

  return query select true,'preflight_passed'::text,v_scope.normalized_target,v_requires_approval;
end $$;

revoke all on function security.target_scope_decision(uuid,uuid,security.scope_type,text) from public,anon,authenticated;
grant execute on function security.target_scope_decision(uuid,uuid,security.scope_type,text) to service_role;
revoke all on function operations.claim_jobs(text,text,integer,integer) from public,anon,authenticated;
grant execute on function operations.claim_jobs(text,text,integer,integer) to service_role;
revoke all on function operations.start_job(uuid,text,bigint) from public,anon,authenticated;
grant execute on function operations.start_job(uuid,text,bigint) to service_role;
revoke all on function operations.finish_job(uuid,text,bigint,boolean,jsonb) from public,anon,authenticated;
grant execute on function operations.finish_job(uuid,text,bigint,boolean,jsonb) to service_role;
revoke all on function operations.requeue_expired_leases(integer) from public,anon,authenticated;
grant execute on function operations.requeue_expired_leases(integer) to service_role;
revoke all on function operations.tool_preflight(uuid,uuid,uuid,uuid,text,text,security.scope_type,text) from public,anon,authenticated;
grant execute on function operations.tool_preflight(uuid,uuid,uuid,uuid,text,text,security.scope_type,text) to service_role;

notify pgrst,'reload schema';
