create or replace function reports.request_report_export(
  p_organization_id uuid,
  p_report_id uuid,
  p_report_version_id uuid,
  p_format text,
  p_idempotency_key text
)
returns table(export_id uuid, job_id uuid, export_status text)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_export reports.report_exports%rowtype;
  v_job_id uuid;
  v_job_key text;
begin
  if v_user is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not operations.has_org_write(p_organization_id) then raise exception 'forbidden' using errcode='42501'; end if;
  if p_format not in ('pdf','docx','markdown','json') then raise exception 'invalid_format' using errcode='22023'; end if;
  if p_idempotency_key is null or length(p_idempotency_key)<8 or length(p_idempotency_key)>160 then raise exception 'invalid_idempotency_key' using errcode='22023'; end if;
  if not exists(select 1 from reports.report_versions rv where rv.id=p_report_version_id and rv.report_id=p_report_id and rv.organization_id=p_organization_id) then raise exception 'report_version_not_found' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':report-export:'||p_idempotency_key,0));
  select * into v_export from reports.report_exports e where e.organization_id=p_organization_id and e.idempotency_key=p_idempotency_key;
  if found then
    if v_export.report_id<>p_report_id or v_export.report_version_id<>p_report_version_id or v_export.format<>p_format then raise exception 'idempotency_key_reused_with_different_request' using errcode='22023'; end if;
  else
    insert into reports.report_exports(organization_id,report_id,report_version_id,format,status,requested_by,idempotency_key)
    values(p_organization_id,p_report_id,p_report_version_id,p_format,'queued',v_user,p_idempotency_key)
    returning * into v_export;
  end if;
  v_job_key := 'report-export:'||v_export.id::text;
  insert into operations.jobs(organization_id,queue_name,priority,status,payload,idempotency_key,max_attempts)
  values(p_organization_id,'reports',3,'queued',jsonb_build_object('exportId',v_export.id,'reportId',p_report_id,'reportVersionId',p_report_version_id,'format',p_format,'organizationId',p_organization_id),v_job_key,5)
  on conflict(queue_name,idempotency_key) do update set updated_at=now()
  returning id into v_job_id;
  return query select v_export.id,v_job_id,v_export.status;
end;
$$;

create or replace function ai.start_pre_gpu_agent_run(
  p_organization_id uuid,
  p_project_id uuid,
  p_engagement_id uuid,
  p_objective text,
  p_requires_approval boolean,
  p_idempotency_key text
)
returns table(run_id uuid, run_state text, approval_request_id uuid)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_run_id uuid;
  v_state text;
  v_approval_id uuid;
  v_incident text;
  v_agents_enabled boolean;
begin
  if v_user is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not operations.has_org_write(p_organization_id) then raise exception 'forbidden' using errcode='42501'; end if;
  if p_objective is null or length(btrim(p_objective))<3 or length(p_objective)>4000 then raise exception 'invalid_objective' using errcode='22023'; end if;
  if p_idempotency_key is null or length(p_idempotency_key)<8 or length(p_idempotency_key)>160 then raise exception 'invalid_idempotency_key' using errcode='22023'; end if;
  if not exists(select 1 from app.projects p where p.id=p_project_id and p.organization_id=p_organization_id and p.deleted_at is null) then raise exception 'project_not_found' using errcode='22023'; end if;
  if p_engagement_id is not null and not exists(select 1 from security.engagements e where e.id=p_engagement_id and e.organization_id=p_organization_id and e.project_id=p_project_id) then raise exception 'engagement_not_found' using errcode='22023'; end if;
  select incident_mode,agents_enabled into v_incident,v_agents_enabled from operations.system_state where singleton=true;
  if not coalesce(v_agents_enabled,false) then raise exception 'agents_disabled' using errcode='P0001'; end if;
  if v_incident in ('maintenance','security_lockdown') then raise exception 'agent_start_blocked_by_incident_mode' using errcode='P0001'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':agent:'||p_idempotency_key,0));
  select r.id,r.state into v_run_id,v_state from ai.agent_runs r where r.organization_id=p_organization_id and r.idempotency_key=p_idempotency_key;
  if v_run_id is not null then
    select a.id into v_approval_id from security.approval_requests a where a.agent_run_id=v_run_id and a.organization_id=p_organization_id order by a.requested_at desc limit 1;
    return query select v_run_id,v_state,v_approval_id;
    return;
  end if;
  v_state := case when p_requires_approval then 'WAITING_FOR_APPROVAL' else 'QUEUED' end;
  insert into ai.agent_runs(organization_id,user_id,project_id,engagement_id,objective,state,current_step,max_steps,max_duration_seconds,max_tokens,max_tool_calls,max_cost,total_tokens,total_tool_calls,total_cost,model_alias,router_version,idempotency_key)
  values(p_organization_id,v_user,p_project_id,p_engagement_id,btrim(p_objective),v_state,0,20,1800,50000,0,5,0,0,0,'vexonyx-general',1,p_idempotency_key)
  returning id into v_run_id;
  insert into ai.agent_run_steps(organization_id,agent_run_id,step_number,state,idempotency_key,attempt,execution_status,action,observation,usage,budget,completed_at)
  values(p_organization_id,v_run_id,0,v_state,'run:'||v_run_id::text||':0',1,'completed',jsonb_build_object('kind','created','mode','pre_gpu_preview'),jsonb_build_object('external_execution',false),jsonb_build_object('tokens',0,'tool_calls',0,'cost',0),jsonb_build_object('max_steps',20,'max_tokens',50000,'max_tool_calls',0,'max_cost',5),now());
  insert into ai.agent_checkpoints(organization_id,agent_run_id,step_number,current_state,next_action,observation,usage,budget)
  values(p_organization_id,v_run_id,0,v_state,case when p_requires_approval then jsonb_build_object('kind','await_approval') else jsonb_build_object('kind','advance_preview') end,jsonb_build_object('external_execution',false),jsonb_build_object('tokens',0,'tool_calls',0,'cost',0),jsonb_build_object('max_steps',20,'max_tokens',50000,'max_tool_calls',0,'max_cost',5));
  if p_requires_approval then
    insert into security.approval_requests(organization_id,project_id,engagement_id,agent_run_id,operation_type,status,requested_by,expires_at)
    values(p_organization_id,p_project_id,p_engagement_id,v_run_id,'start_active_assessment','pending',v_user,now()+interval '24 hours')
    returning id into v_approval_id;
  end if;
  return query select v_run_id,v_state,v_approval_id;
end;
$$;
