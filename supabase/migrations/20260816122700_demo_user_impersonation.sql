-- VEXONYX demo-account + secure superadmin preview support.
-- Additive, pre-GPU safe, and deliberately isolated from real commerce/execution.

alter table app.profiles
  add column if not exists account_kind text not null default 'standard';

do $$ begin
  alter table app.profiles add constraint profiles_account_kind_check
    check (account_kind in ('standard','demo','staff'));
exception when duplicate_object then null; end $$;

update app.profiles set account_kind='staff' where is_superadmin=true and account_kind='standard';

alter table app.organizations
  add column if not exists account_kind text not null default 'standard';

do $$ begin
  alter table app.organizations add constraint organizations_account_kind_check
    check (account_kind in ('standard','demo'));
exception when duplicate_object then null; end $$;

create table if not exists security.admin_impersonation_sessions(
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check(char_length(token_hash)=64),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references app.organizations(id) on delete cascade,
  reason text not null check(char_length(reason) between 3 and 500),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  ended_reason text,
  last_seen_at timestamptz,
  constraint admin_impersonation_not_self check(actor_user_id<>target_user_id),
  constraint admin_impersonation_expiry check(expires_at>created_at),
  constraint admin_impersonation_end_reason check(ended_at is null or ended_reason is not null)
);

create index if not exists admin_impersonation_actor_active_idx
  on security.admin_impersonation_sessions(actor_user_id,expires_at desc)
  where ended_at is null;
create index if not exists admin_impersonation_target_created_idx
  on security.admin_impersonation_sessions(target_user_id,created_at desc);

alter table security.admin_impersonation_sessions enable row level security;
revoke all on security.admin_impersonation_sessions from public, anon, authenticated;
grant select,insert,update,delete on security.admin_impersonation_sessions to service_role;

-- Transactional synthetic dataset. Only the server-side service role may call it.
create or replace function app.provision_demo_account(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_org uuid;
  v_plan uuid;
  v_github uuid;
  v_project_web uuid;
  v_project_api uuid;
  v_project_internal uuid;
  v_month date := date_trunc('month', now())::date;
begin
  if not exists (
    select 1 from auth.users u
    where u.id=p_user_id and lower(u.email)=lower('demo@vexonyx.com')
  ) then
    raise exception 'demo user must be demo@vexonyx.com';
  end if;

  insert into app.profiles(id,display_name,timezone,is_superadmin,account_kind)
  values(p_user_id,'VEXONYX Demo','Europe/Stockholm',false,'demo')
  on conflict(id) do update set
    display_name=excluded.display_name,
    timezone=excluded.timezone,
    is_superadmin=false,
    account_kind='demo',
    updated_at=now();

  select id into v_org from app.organizations where slug='vexonyx-demo-workspace';
  if v_org is null then
    insert into app.organizations(name,slug,created_by,status,metadata,account_kind)
    values('VEXONYX Demo Workspace','vexonyx-demo-workspace',p_user_id,'active',
      '{"demo":true,"synthetic":true,"exclude_from_analytics":true}'::jsonb,'demo')
    returning id into v_org;
  else
    update app.organizations set
      name='VEXONYX Demo Workspace', created_by=p_user_id, status='active', account_kind='demo',
      metadata=coalesce(metadata,'{}'::jsonb)||'{"demo":true,"synthetic":true,"exclude_from_analytics":true}'::jsonb,
      updated_at=now()
    where id=v_org;
  end if;

  delete from app.organization_members where organization_id=v_org and user_id<>p_user_id;
  insert into app.organization_members(organization_id,user_id,role)
  values(v_org,p_user_id,'organization_owner')
  on conflict(organization_id,user_id) do update set role='organization_owner',updated_at=now();

  -- Keep the demo dataset deterministic on every reset without touching any real workspace.
  delete from ai.agent_runs where organization_id=v_org;
  delete from app.conversations where organization_id=v_org;
  delete from app.projects where organization_id=v_org;
  delete from integrations.installations where organization_id=v_org;
  delete from usage.usage_events where organization_id=v_org;
  delete from usage.usage_monthly where organization_id=v_org;

  insert into app.projects(organization_id,created_by,name,description,status,metadata)
  values(v_org,p_user_id,'Web App Security Audit','Synthetic authorized web assessment for dashboard validation.','active','{"demo":true,"seed_key":"web-audit"}'::jsonb)
  returning id into v_project_web;
  insert into app.projects(organization_id,created_by,name,description,status,metadata)
  values(v_org,p_user_id,'API Pentest','Synthetic API security assessment for dashboard validation.','active','{"demo":true,"seed_key":"api-pentest"}'::jsonb)
  returning id into v_project_api;
  insert into app.projects(organization_id,created_by,name,description,status,metadata)
  values(v_org,p_user_id,'Internal Network Assessment','Synthetic internal assessment; no external execution is enabled.','active','{"demo":true,"seed_key":"internal-network"}'::jsonb)
  returning id into v_project_internal;

  insert into app.conversations(organization_id,project_id,user_id,title,status,model_selection_mode)
  values
    (v_org,v_project_web,p_user_id,'Review authentication and session security','active','auto'),
    (v_org,v_project_api,p_user_id,'Map API attack surface','active','deep'),
    (v_org,v_project_internal,p_user_id,'Prioritize internal findings','active','fast');

  insert into ai.agent_runs(organization_id,project_id,user_id,state,objective,model_alias,total_tokens,total_tool_calls,total_cost,started_at,completed_at,model_selection_mode,policy_snapshot,effective_capabilities)
  values
    (v_org,v_project_web,p_user_id,'COMPLETED','Finding vulnerabilities in authorized web application',null,18420,14,0.82,now()-interval '3 days',now()-interval '3 days'+interval '11 minutes','auto','{"demo_seed":true,"synthetic":true}'::jsonb,'{"network":"disabled","external_actions":false}'::jsonb),
    (v_org,v_project_api,p_user_id,'COMPLETED','Reviewing API authentication and authorization controls',null,12180,9,0.54,now()-interval '2 days',now()-interval '2 days'+interval '8 minutes','deep','{"demo_seed":true,"synthetic":true}'::jsonb,'{"network":"disabled","external_actions":false}'::jsonb),
    (v_org,v_project_internal,p_user_id,'COMPLETED','Analyzing uploaded source and assessment notes',null,9100,6,0.39,now()-interval '1 day',now()-interval '1 day'+interval '6 minutes','fast','{"demo_seed":true,"synthetic":true}'::jsonb,'{"network":"disabled","external_actions":false}'::jsonb),
    (v_org,v_project_web,p_user_id,'WAITING_FOR_USER','Generating security report from synthetic evidence',null,5160,3,0.21,now()-interval '2 hours',null,'auto','{"demo_seed":true,"synthetic":true}'::jsonb,'{"network":"disabled","external_actions":false}'::jsonb);

  select id into v_plan from billing.plans where code='pro' and status='active' order by created_at limit 1;
  insert into billing.subscriptions(organization_id,plan_id,status,current_period_start,current_period_end,provider,provider_subscription_id,metadata)
  values(v_org,v_plan,'active',date_trunc('month',now()),date_trunc('month',now())+interval '1 month','internal_demo',null,
    '{"demo":true,"synthetic":true,"exclude_from_revenue":true}'::jsonb)
  on conflict(organization_id) do update set
    plan_id=excluded.plan_id,status='active',current_period_start=excluded.current_period_start,
    current_period_end=excluded.current_period_end,provider='internal_demo',provider_subscription_id=null,
    metadata=excluded.metadata,updated_at=now();

  insert into billing.credit_accounts(organization_id,balance,lifetime_purchased,lifetime_granted,lifetime_consumed)
  values(v_org,10000,0,12840,2840)
  on conflict(organization_id) do update set
    balance=10000,lifetime_purchased=0,lifetime_granted=12840,lifetime_consumed=2840,updated_at=now();

  delete from billing.credit_ledger where organization_id=v_org and metadata->>'demo_seed'='true';
  insert into billing.credit_ledger(organization_id,user_id,entry_type,amount,balance_after,idempotency_key,metadata)
  values
    (v_org,p_user_id,'grant',12840,12840,'demo-seed-grant','{"demo_seed":true,"synthetic":true}'::jsonb),
    (v_org,p_user_id,'consume',-2840,10000,'demo-seed-consume','{"demo_seed":true,"synthetic":true}'::jsonb);

  insert into usage.usage_monthly(organization_id,month_start,metric,quantity,cost)
  values
    (v_org,v_month,'agent_runs',14,1.96),
    (v_org,v_month,'credits',2840,0),
    (v_org,v_month,'tokens',44860,1.96)
  on conflict(organization_id,month_start,metric) do update set quantity=excluded.quantity,cost=excluded.cost,updated_at=now();

  insert into usage.usage_events(organization_id,user_id,project_id,event_type,quantity,unit,cost,metadata)
  values
    (v_org,p_user_id,v_project_web,'agent_run',1,'run',0.82,'{"demo":true,"synthetic":true}'::jsonb),
    (v_org,p_user_id,v_project_api,'agent_run',1,'run',0.54,'{"demo":true,"synthetic":true}'::jsonb),
    (v_org,p_user_id,v_project_internal,'agent_run',1,'run',0.39,'{"demo":true,"synthetic":true}'::jsonb);

  select id into v_github from integrations.catalog where slug='github' limit 1;
  if v_github is not null then
    insert into integrations.installations(organization_id,catalog_id,installed_by,status,display_name,provider_account_ref,granted_scopes,config,last_success_at)
    values(v_org,v_github,p_user_id,'connected','GitHub · Demo','demo-synthetic',array[]::text[],
      '{"demo":true,"synthetic":true,"secrets_present":false}'::jsonb,now()-interval '1 hour')
    on conflict(organization_id,catalog_id,provider_account_ref) do update set
      installed_by=p_user_id,status='connected',display_name='GitHub · Demo',granted_scopes=array[]::text[],
      config='{"demo":true,"synthetic":true,"secrets_present":false}'::jsonb,last_success_at=excluded.last_success_at,updated_at=now();
  end if;

  return v_org;
end;
$$;

revoke all on function app.provision_demo_account(uuid) from public, anon, authenticated;
grant execute on function app.provision_demo_account(uuid) to service_role;
