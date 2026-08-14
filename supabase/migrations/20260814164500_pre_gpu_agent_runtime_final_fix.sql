-- Final clean-replay correction for the pre-GPU agent preview runtime.
-- Agent run rows are locked FOR UPDATE while advancing, so step/checkpoint inserts do not need ON CONFLICT fallbacks.

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
  v_state ai.agent_run_state;
  v_approval_id uuid;
  v_incident operations.incident_mode;
  v_agents_enabled boolean;
begin
  if v_user is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not operations.has_org_write(p_organization_id) then raise exception 'forbidden' using errcode='42501'; end if;
  if p_objective is null or length(btrim(p_objective))<3 or length(p_objective)>4000 then raise exception 'invalid_objective' using errcode='22023'; end if;
  if p_idempotency_key is null or length(p_idempotency_key)<8 or length(p_idempotency_key)>160 then raise exception 'invalid_idempotency_key' using errcode='22023'; end if;
  if not exists(select 1 from app.projects p where p.id=p_project_id and p.organization_id=p_organization_id and p.deleted_at is null) then raise exception 'project_not_found' using errcode='22023'; end if;
  if p_engagement_id is not null and not exists(select 1 from security.engagements e where e.id=p_engagement_id and e.organization_id=p_organization_id and e.project_id=p_project_id) then raise exception 'engagement_not_found' using errcode='22023'; end if;

  select s.incident_mode,s.agents_enabled into v_incident,v_agents_enabled
  from operations.system_state s
  where s.singleton=true;
  if not coalesce(v_agents_enabled,false) then raise exception 'agents_disabled' using errcode='P0001'; end if;
  if v_incident in ('maintenance','security_lockdown') then raise exception 'agent_start_blocked_by_incident_mode' using errcode='P0001'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':agent:'||p_idempotency_key,0));
  select r.id,r.state into v_run_id,v_state
  from ai.agent_runs r
  where r.organization_id=p_organization_id and r.idempotency_key=p_idempotency_key;

  if v_run_id is not null then
    select a.id into v_approval_id
    from security.approval_requests a
    where a.agent_run_id=v_run_id and a.organization_id=p_organization_id
    order by a.requested_at desc
    limit 1;
    return query select v_run_id,v_state::text,v_approval_id;
    return;
  end if;

  v_state := case when p_requires_approval then 'WAITING_FOR_APPROVAL'::ai.agent_run_state else 'QUEUED'::ai.agent_run_state end;

  insert into ai.agent_runs(
    organization_id,user_id,project_id,engagement_id,objective,state,current_step,max_steps,
    max_duration_seconds,max_tokens,max_tool_calls,max_cost,total_tokens,total_tool_calls,total_cost,
    model_alias,router_version,idempotency_key
  ) values(
    p_organization_id,v_user,p_project_id,p_engagement_id,btrim(p_objective),v_state,0,20,
    1800,50000,0,5,0,0,0,'vexonyx-general',1,p_idempotency_key
  ) returning id into v_run_id;

  insert into ai.agent_run_steps(
    organization_id,agent_run_id,step_number,state,idempotency_key,attempt,execution_status,
    action,observation,usage,budget,completed_at
  ) values(
    p_organization_id,v_run_id,0,v_state,'run:'||v_run_id::text||':0',1,'succeeded',
    jsonb_build_object('kind','created','mode','pre_gpu_preview'),
    jsonb_build_object('external_execution',false),
    jsonb_build_object('tokens',0,'tool_calls',0,'cost',0),
    jsonb_build_object('max_steps',20,'max_tokens',50000,'max_tool_calls',0,'max_cost',5),
    now()
  );

  insert into ai.agent_checkpoints(
    organization_id,agent_run_id,step_number,current_state,next_action,observation,usage_snapshot,budget_snapshot
  ) values(
    p_organization_id,v_run_id,0,v_state,
    case when p_requires_approval then jsonb_build_object('kind','await_approval') else jsonb_build_object('kind','advance_preview') end,
    jsonb_build_object('external_execution',false),
    jsonb_build_object('tokens',0,'tool_calls',0,'cost',0),
    jsonb_build_object('max_steps',20,'max_tokens',50000,'max_tool_calls',0,'max_cost',5)
  );

  if p_requires_approval then
    insert into security.approval_requests(
      organization_id,project_id,engagement_id,agent_run_id,operation_type,status,requested_by,expires_at
    ) values(
      p_organization_id,p_project_id,p_engagement_id,v_run_id,'start_active_assessment','pending',v_user,now()+interval '24 hours'
    ) returning id into v_approval_id;
  end if;

  return query select v_run_id,v_state::text,v_approval_id;
end;
$$;

create or replace function ai.advance_pre_gpu_agent_run(
  p_organization_id uuid,
  p_run_id uuid
)
returns table(run_id uuid, run_state text, step_number integer)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_run ai.agent_runs%rowtype;
  v_next ai.agent_run_state;
  v_step integer;
  v_next_action jsonb;
begin
  if v_user is null then raise exception 'unauthorized' using errcode='42501'; end if;

  select * into v_run
  from ai.agent_runs r
  where r.id=p_run_id and r.organization_id=p_organization_id
  for update;
  if not found then raise exception 'run_not_found' using errcode='22023'; end if;

  if v_run.user_id<>v_user and not exists(
    select 1 from app.organization_members m
    where m.organization_id=p_organization_id
      and m.user_id=v_user
      and m.role in ('organization_owner','organization_admin')
  ) then raise exception 'forbidden' using errcode='42501'; end if;

  if v_run.state in ('COMPLETED','FAILED','CANCELLED') then
    return query select v_run.id,v_run.state::text,v_run.current_step;
    return;
  end if;

  if v_run.state='WAITING_FOR_APPROVAL' then
    if not exists(
      select 1 from security.approval_requests a
      where a.agent_run_id=v_run.id
        and a.organization_id=p_organization_id
        and a.status='approved'
    ) then raise exception 'approval_required' using errcode='42501'; end if;
    v_next := 'PLANNING';
  elsif v_run.state='QUEUED' then v_next := 'PLANNING';
  elsif v_run.state='PLANNING' then v_next := 'CONTEXT_LOADING';
  elsif v_run.state='CONTEXT_LOADING' then v_next := 'MODEL_RUNNING';
  elsif v_run.state='MODEL_RUNNING' then v_next := 'VALIDATING';
  elsif v_run.state='VALIDATING' then v_next := 'COMPLETED';
  else raise exception 'unsupported_pre_gpu_state:%',v_run.state using errcode='P0001';
  end if;

  v_step := v_run.current_step+1;
  v_next_action := case when v_next='COMPLETED' then jsonb_build_object('kind','none') else jsonb_build_object('kind','advance_preview') end;

  insert into ai.agent_run_steps(
    organization_id,agent_run_id,step_number,state,idempotency_key,attempt,execution_status,
    action,observation,usage,budget,completed_at
  ) values(
    p_organization_id,v_run.id,v_step,v_next,'run:'||v_run.id::text||':'||v_step::text,1,'succeeded',
    jsonb_build_object('kind','pre_gpu_transition','from_state',v_run.state,'to_state',v_next),
    jsonb_build_object('external_execution',false,'model_execution',false),
    jsonb_build_object('tokens',0,'tool_calls',0,'cost',0),
    jsonb_build_object('max_steps',v_run.max_steps,'max_tokens',v_run.max_tokens,'max_tool_calls',0,'max_cost',v_run.max_cost),
    now()
  );

  insert into ai.agent_checkpoints(
    organization_id,agent_run_id,step_number,current_state,next_action,observation,usage_snapshot,budget_snapshot
  ) values(
    p_organization_id,v_run.id,v_step,v_next,v_next_action,
    jsonb_build_object('external_execution',false,'model_execution',false),
    jsonb_build_object('tokens',0,'tool_calls',0,'cost',0),
    jsonb_build_object('max_steps',v_run.max_steps,'max_tokens',v_run.max_tokens,'max_tool_calls',0,'max_cost',v_run.max_cost)
  );

  update ai.agent_runs as r
  set state=v_next,
      current_step=v_step,
      started_at=coalesce(r.started_at,now()),
      completed_at=case when v_next='COMPLETED' then now() else null end,
      updated_at=now()
  where r.id=v_run.id and r.organization_id=p_organization_id;

  return query select v_run.id,v_next::text,v_step;
end;
$$;

notify pgrst,'reload schema';
