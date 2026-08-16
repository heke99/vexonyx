-- VEXONYX AI policy, agent profile, model-selection and controlled-learning control plane.
-- Additive and pre-GPU safe: no model or offensive tool execution is enabled by this migration.

create schema if not exists policies;
revoke all on schema policies from public, anon, authenticated;
grant usage on schema policies to service_role;

create table policies.policy_sets(
  id uuid primary key default gen_random_uuid(),
  key text not null unique check(key ~ '^[a-z0-9][a-z0-9._-]{2,95}$'),
  name text not null check(char_length(name) between 2 and 160),
  description text,
  layer text not null check(layer in ('platform','global','plan','organization','workspace','agent','run')),
  locked boolean not null default false,
  enabled boolean not null default true,
  current_version integer not null default 0 check(current_version >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table policies.policy_versions(
  id uuid primary key default gen_random_uuid(),
  policy_set_id uuid not null references policies.policy_sets(id) on delete cascade,
  version integer not null check(version > 0),
  status text not null default 'draft' check(status in ('draft','active','retired')),
  change_reason text,
  created_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  unique(policy_set_id,version)
);
create unique index policy_versions_one_active_idx on policies.policy_versions(policy_set_id) where status='active';

create table policies.policy_rules(
  id uuid primary key default gen_random_uuid(),
  policy_version_id uuid not null references policies.policy_versions(id) on delete cascade,
  category text not null check(char_length(category) between 1 and 120),
  resource text not null default '*' check(char_length(resource) between 1 and 180),
  action text not null check(action in ('allow','deny','sandbox_only','allow_scoped','require_approval','limit')),
  condition jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  severity text not null default 'medium' check(severity in ('info','low','medium','high','critical')),
  priority integer not null default 100 check(priority between 0 and 100000),
  non_overridable boolean not null default false,
  created_at timestamptz not null default now()
);
create index policy_rules_version_lookup_idx on policies.policy_rules(policy_version_id,category,resource,priority desc);

create table policies.policy_assignments(
  id uuid primary key default gen_random_uuid(),
  policy_version_id uuid not null references policies.policy_versions(id) on delete cascade,
  scope_type text not null check(scope_type in ('global','plan','organization','workspace','agent','run')),
  scope_id text,
  priority integer not null default 100 check(priority between 0 and 100000),
  enabled boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint policy_assignment_scope_id_check check(
    (scope_type='global' and scope_id is null)
    or (scope_type<>'global' and scope_id is not null and char_length(scope_id) between 1 and 180)
  ),
  constraint policy_assignment_window_check check(ends_at is null or starts_at is null or ends_at > starts_at)
);
create unique index policy_assignments_identity_idx on policies.policy_assignments(policy_version_id,scope_type,coalesce(scope_id,''));
create index policy_assignments_effective_idx on policies.policy_assignments(scope_type,scope_id,enabled,starts_at,ends_at);

create table policies.policy_exceptions(
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references policies.policy_assignments(id) on delete cascade,
  rule_id uuid not null references policies.policy_rules(id) on delete cascade,
  override_action text not null check(override_action in ('allow','deny','sandbox_only','allow_scoped','require_approval','limit')),
  reason text not null check(char_length(reason) between 3 and 1000),
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(assignment_id,rule_id)
);

create table policies.policy_decisions(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references app.organizations(id) on delete cascade,
  project_id uuid references app.projects(id) on delete set null,
  agent_run_id uuid references ai.agent_runs(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  category text not null,
  resource text not null,
  final_action text not null,
  allowed boolean not null,
  requires_approval boolean not null default false,
  matched_rules jsonb not null default '[]'::jsonb,
  effective_context jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now()
);
create index policy_decisions_run_created_idx on policies.policy_decisions(agent_run_id,created_at desc);
create index policy_decisions_org_created_idx on policies.policy_decisions(organization_id,created_at desc);

create table policies.policy_change_logs(
  id uuid primary key default gen_random_uuid(),
  policy_set_id uuid references policies.policy_sets(id) on delete set null,
  policy_version_id uuid references policies.policy_versions(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  before_state jsonb,
  after_state jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index policy_change_logs_set_created_idx on policies.policy_change_logs(policy_set_id,created_at desc);

create table ai.agent_profiles(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references app.organizations(id) on delete cascade,
  slug text not null check(slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null check(char_length(name) between 2 and 120),
  description text,
  category text not null default 'security',
  enabled boolean not null default true,
  current_version integer not null default 0 check(current_version >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index agent_profiles_global_slug_idx on ai.agent_profiles(slug) where organization_id is null;
create unique index agent_profiles_org_slug_idx on ai.agent_profiles(organization_id,slug) where organization_id is not null;
create index agent_profiles_org_enabled_idx on ai.agent_profiles(organization_id,enabled,name);

create table ai.agent_profile_versions(
  id uuid primary key default gen_random_uuid(),
  agent_profile_id uuid not null references ai.agent_profiles(id) on delete cascade,
  version integer not null check(version > 0),
  status text not null default 'draft' check(status in ('draft','eval','internal','canary','production','retired')),
  system_instructions text not null default '',
  max_autonomy text not null default 'medium' check(max_autonomy in ('low','medium','high')),
  sandbox_profile text not null default 'standard-isolated',
  network_access text not null default 'scope_only' check(network_access in ('none','internet','scope_only','allowlist','custom')),
  timeout_seconds integer not null default 1800 check(timeout_seconds between 1 and 86400),
  max_steps integer not null default 30 check(max_steps between 1 and 500),
  max_tool_calls integer not null default 50 check(max_tool_calls between 0 and 1000),
  max_cost numeric(12,4) not null default 25 check(max_cost >= 0),
  planner_config jsonb not null default '{}'::jsonb,
  context_config jsonb not null default '{}'::jsonb,
  memory_config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(agent_profile_id,version)
);
create unique index agent_profile_versions_one_production_idx on ai.agent_profile_versions(agent_profile_id) where status='production';

create table ai.agent_tool_assignments(
  agent_profile_version_id uuid not null references ai.agent_profile_versions(id) on delete cascade,
  tool_definition_id uuid not null references ai.tool_definitions(id) on delete cascade,
  access_mode text not null check(access_mode in ('allow','deny','sandbox_only','scope_only','require_approval')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key(agent_profile_version_id,tool_definition_id)
);

create table ai.agent_model_preferences(
  agent_profile_version_id uuid not null references ai.agent_profile_versions(id) on delete cascade,
  model_alias text not null references ai.models(alias) on update cascade on delete restrict,
  purpose text not null default 'primary',
  preference_order integer not null default 100 check(preference_order >= 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(agent_profile_version_id,model_alias,purpose)
);
create index agent_model_preferences_order_idx on ai.agent_model_preferences(agent_profile_version_id,purpose,preference_order);

create table ai.model_entitlements(
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check(scope_type in ('plan','organization')),
  scope_id text not null check(char_length(scope_id) between 1 and 180),
  model_alias text not null references ai.models(alias) on update cascade on delete cascade,
  enabled boolean not null default true,
  limits jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(scope_type,scope_id,model_alias)
);

create table app.user_model_preferences(
  organization_id uuid not null references app.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  model_selection_mode text not null default 'auto' check(model_selection_mode in ('auto','fast','pro','deep','specific')),
  model_alias text references ai.models(alias) on update cascade on delete set null,
  updated_at timestamptz not null default now(),
  primary key(organization_id,user_id),
  constraint user_model_specific_requires_alias check(model_selection_mode<>'specific' or model_alias is not null)
);
create index user_model_preferences_user_idx on app.user_model_preferences(user_id,organization_id);

alter table app.conversations
  add column agent_profile_id uuid references ai.agent_profiles(id) on delete set null,
  add column agent_profile_version_id uuid references ai.agent_profile_versions(id) on delete set null,
  add column model_selection_mode text not null default 'auto' check(model_selection_mode in ('auto','fast','pro','deep','specific')),
  add column selected_model_alias text references ai.models(alias) on update cascade on delete set null,
  add constraint conversations_specific_model_check check(model_selection_mode<>'specific' or selected_model_alias is not null);

alter table ai.agent_runs
  add column agent_profile_id uuid references ai.agent_profiles(id) on delete set null,
  add column agent_profile_version_id uuid references ai.agent_profile_versions(id) on delete set null,
  add column model_selection_mode text not null default 'auto' check(model_selection_mode in ('auto','fast','pro','deep','specific')),
  add column requested_model_alias text references ai.models(alias) on update cascade on delete set null,
  add column policy_snapshot jsonb not null default '{}'::jsonb,
  add column effective_capabilities jsonb not null default '{}'::jsonb,
  add constraint agent_runs_specific_model_check check(model_selection_mode<>'specific' or requested_model_alias is not null);
create index agent_runs_profile_created_idx on ai.agent_runs(agent_profile_id,created_at desc) where agent_profile_id is not null;

alter table ai.generation_requests
  add column model_selection_mode text not null default 'auto' check(model_selection_mode in ('auto','fast','pro','deep','specific')),
  add column requested_model_alias text references ai.models(alias) on update cascade on delete set null,
  add column agent_profile_version_id uuid references ai.agent_profile_versions(id) on delete set null,
  add column policy_snapshot jsonb not null default '{}'::jsonb,
  add constraint generation_requests_specific_model_check check(model_selection_mode<>'specific' or requested_model_alias is not null);

alter table ai.memory_items
  add column trust_level text not null default 'untrusted' check(trust_level in ('untrusted','user_asserted','workspace_verified','organization_verified','platform_verified')),
  add column sensitivity text not null default 'internal' check(sensitivity in ('public','internal','confidential','restricted')),
  add column instruction_authority text not null default 'content' check(instruction_authority in ('content','memory_hint','trusted_context')),
  add column expires_at timestamptz;
create index memory_expiry_idx on ai.memory_items(expires_at) where expires_at is not null and deleted_at is null;

alter table security.engagements
  add column network_access text not null default 'scope_only' check(network_access in ('none','internet','scope_only','allowlist','custom')),
  add column allowed_techniques text[] not null default '{}',
  add column out_of_scope_notes text,
  add column rules jsonb not null default '{}'::jsonb;

create table ai.learning_candidates(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references app.organizations(id) on delete cascade,
  source_agent_run_id uuid references ai.agent_runs(id) on delete set null,
  source_generation_request_id uuid references ai.generation_requests(id) on delete set null,
  candidate_type text not null check(candidate_type in ('memory','routing','agent_prompt','planning','tool_selection','model_weights')),
  status text not null default 'candidate' check(status in ('candidate','evaluating','rejected','approved','shadow','canary','promoted','rolled_back')),
  summary text not null check(char_length(summary) between 3 and 2000),
  evidence jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  consent_state text not null default 'not_applicable' check(consent_state in ('not_applicable','required','granted','denied')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index learning_candidates_status_created_idx on ai.learning_candidates(status,candidate_type,created_at desc);

create table ai.agent_evaluations(
  id uuid primary key default gen_random_uuid(),
  agent_profile_version_id uuid not null references ai.agent_profile_versions(id) on delete cascade,
  baseline_profile_version_id uuid references ai.agent_profile_versions(id) on delete set null,
  suite_id text not null,
  suite_version text not null,
  environment text not null default 'controlled_lab',
  status text not null check(status in ('queued','running','passed','failed','cancelled')),
  score numeric,
  metrics jsonb not null default '{}'::jsonb,
  artifact_ref text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index agent_evaluations_profile_created_idx on ai.agent_evaluations(agent_profile_version_id,created_at desc);

create table ai.rollouts(
  id uuid primary key default gen_random_uuid(),
  target_type text not null check(target_type in ('model','agent_profile','policy','router')),
  target_id text not null,
  target_version text not null,
  phase text not null default 'candidate' check(phase in ('candidate','shadow','canary_1','canary_5','canary_25','canary_50','production','rolled_back')),
  traffic_percent numeric(5,2) not null default 0 check(traffic_percent between 0 and 100),
  status text not null default 'planned' check(status in ('planned','running','paused','completed','failed','rolled_back')),
  guardrails jsonb not null default '{}'::jsonb,
  baseline_metrics jsonb not null default '{}'::jsonb,
  observed_metrics jsonb not null default '{}'::jsonb,
  rollback_target text,
  created_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(target_type,target_id,target_version)
);
create index rollouts_status_phase_idx on ai.rollouts(status,phase,created_at desc);

-- Protect profile references at the database boundary. A tenant may reference only
-- a platform-global profile or a profile owned by the same organization, and the
-- pinned version must belong to that profile.
create or replace function ai.enforce_agent_profile_scope()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_org uuid;
  v_version_profile uuid;
begin
  v_org := new.organization_id;
  if new.agent_profile_id is null and new.agent_profile_version_id is not null then
    raise exception 'agent_profile_required_for_version' using errcode='23514';
  end if;
  if new.agent_profile_id is not null then
    if not exists(
      select 1 from ai.agent_profiles p
      where p.id=new.agent_profile_id and (p.organization_id is null or p.organization_id=v_org)
    ) then
      raise exception 'agent_profile_scope_mismatch' using errcode='23514';
    end if;
  end if;
  if new.agent_profile_version_id is not null then
    select v.agent_profile_id into v_version_profile from ai.agent_profile_versions v where v.id=new.agent_profile_version_id;
    if v_version_profile is null or v_version_profile<>new.agent_profile_id then
      raise exception 'agent_profile_version_mismatch' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function ai.enforce_agent_profile_scope() from public,anon,authenticated;
grant execute on function ai.enforce_agent_profile_scope() to service_role;
create trigger conversations_agent_profile_scope before insert or update of organization_id,agent_profile_id,agent_profile_version_id on app.conversations for each row execute function ai.enforce_agent_profile_scope();
create trigger agent_runs_agent_profile_scope before insert or update of organization_id,agent_profile_id,agent_profile_version_id on ai.agent_runs for each row execute function ai.enforce_agent_profile_scope();

-- Typed, deterministic policy evaluator. Arbitrary JSON is never executed as code.
-- Condition-bearing rules are stored/versioned but enforcement currently selects only
-- unconditional rules; future condition operators can be added explicitly and tested.
create or replace function policies.evaluate_action(
  p_organization_id uuid,
  p_project_id uuid,
  p_agent_run_id uuid,
  p_category text,
  p_resource text
)
returns table(allowed boolean,final_action text,requires_approval boolean,matched_rules jsonb)
language sql
stable
security definer
set search_path=''
as $$
with context as (
  select
    r.agent_profile_id,
    (
      select s.plan_id
      from billing.subscriptions s
      where s.organization_id=p_organization_id
        and s.status in ('trialing','active','past_due')
      order by coalesce(s.current_period_end,'infinity'::timestamptz) desc,s.created_at desc
      limit 1
    ) as plan_id
  from ai.agent_runs r
  where r.id=p_agent_run_id and r.organization_id=p_organization_id
), matched as (
  select
    pr.id as rule_id,
    ps.id as policy_set_id,
    ps.key as policy_key,
    ps.layer,
    ps.locked,
    pa.scope_type,
    pa.scope_id,
    pa.priority as assignment_priority,
    pr.priority as rule_priority,
    pr.action,
    pr.non_overridable,
    pr.config,
    case pa.scope_type
      when 'global' then 10
      when 'plan' then 20
      when 'organization' then 30
      when 'workspace' then 40
      when 'agent' then 50
      when 'run' then 60
      else 0
    end as scope_rank
  from policies.policy_assignments pa
  join policies.policy_versions pv on pv.id=pa.policy_version_id and pv.status='active'
  join policies.policy_sets ps on ps.id=pv.policy_set_id and ps.enabled
  join policies.policy_rules pr on pr.policy_version_id=pv.id
  cross join context c
  where pa.enabled
    and (pa.starts_at is null or pa.starts_at<=now())
    and (pa.ends_at is null or pa.ends_at>now())
    and pr.condition='{}'::jsonb
    and (
      pr.category='*'
      or pr.category=p_category
      or (right(pr.category,2)='.*' and p_category like left(pr.category,char_length(pr.category)-1)||'%')
    )
    and (
      pr.resource='*'
      or pr.resource=p_resource
      or (right(pr.resource,2)='.*' and p_resource like left(pr.resource,char_length(pr.resource)-1)||'%')
    )
    and (
      pa.scope_type='global'
      or (pa.scope_type='plan' and c.plan_id is not null and pa.scope_id=c.plan_id::text)
      or (pa.scope_type='organization' and pa.scope_id=p_organization_id::text)
      or (pa.scope_type='workspace' and p_project_id is not null and pa.scope_id=p_project_id::text)
      or (pa.scope_type='agent' and c.agent_profile_id is not null and pa.scope_id=c.agent_profile_id::text)
      or (pa.scope_type='run' and pa.scope_id=p_agent_run_id::text)
    )
), hard_deny as (
  select * from matched where non_overridable and action='deny'
  order by scope_rank desc,assignment_priority desc,rule_priority desc,rule_id
  limit 1
), chosen as (
  select * from matched
  order by scope_rank desc,assignment_priority desc,rule_priority desc,locked desc,rule_id
  limit 1
), effective as (
  select coalesce((select action from hard_deny),(select action from chosen),'allow') as action,
         coalesce((select config from hard_deny),(select config from chosen),'{}'::jsonb) as config
), evidence as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'rule_id',rule_id,
    'policy_set_id',policy_set_id,
    'policy_key',policy_key,
    'layer',layer,
    'scope_type',scope_type,
    'scope_id',scope_id,
    'action',action,
    'non_overridable',non_overridable,
    'assignment_priority',assignment_priority,
    'rule_priority',rule_priority
  ) order by scope_rank desc,assignment_priority desc,rule_priority desc),'[]'::jsonb) as rules
  from matched
)
select
  effective.action<>'deny' as allowed,
  effective.action as final_action,
  (effective.action='require_approval' or coalesce((effective.config->>'requires_approval')::boolean,false)) as requires_approval,
  evidence.rules as matched_rules
from effective cross join evidence;
$$;
revoke all on function policies.evaluate_action(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function policies.evaluate_action(uuid,uuid,uuid,text,text) to service_role;

-- Keep immutable platform enforcement below the policy layer. Existing incident,
-- kill-switch, run/engagement binding and authorization/scope checks still execute first.
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
  v_policy record;
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

  if not exists(
    select 1 from app.projects p
    where p.id=p_project_id and p.organization_id=p_organization_id
      and p.status='active' and p.deleted_at is null
  ) then
    return query select false,'project_not_active'::text,null::text,false; return;
  end if;

  if not exists(
    select 1 from ai.agent_runs r
    where r.id=p_agent_run_id
      and r.organization_id=p_organization_id
      and r.project_id=p_project_id
      and r.engagement_id=p_engagement_id
      and r.state not in ('COMPLETED','FAILED','CANCELLED')
  ) then
    return query select false,'agent_run_scope_binding_mismatch'::text,null::text,false; return;
  end if;

  select * into v_tool
  from ai.tool_definitions t
  where t.name=p_tool_name and t.version=p_tool_version and t.enabled=true and t.retired_at is null;
  if not found then
    return query select false,'tool_version_not_enabled'::text,null::text,false; return;
  end if;
  v_requires_approval := v_tool.requires_approval;

  if v_tool.needs_network and not v_state.external_network_enabled then
    return query select false,'external_network_disabled'::text,null::text,v_requires_approval; return;
  end if;

  if exists(
    select 1 from operations.kill_switches k
    where k.enabled and k.deactivated_at is null and (
      k.scope_type='global'
      or (k.scope_type='organization' and k.scope_id=p_organization_id::text)
      or (k.scope_type='project' and k.scope_id=p_project_id::text)
      or (k.scope_type='run' and k.scope_id=p_agent_run_id::text)
      or (k.scope_type='tool' and k.scope_id=p_tool_name)
      or k.scope_type='sandbox'
      or (v_tool.needs_network and k.scope_type='external_network')
    )
  ) then
    return query select false,'kill_switch_active'::text,null::text,v_requires_approval; return;
  end if;

  select * into v_scope
  from security.target_scope_decision(p_organization_id,p_engagement_id,p_target_type,p_target_value);
  if not coalesce(v_scope.allowed,false) then
    return query select false,coalesce(v_scope.reason,'scope_denied'),v_scope.normalized_target,v_requires_approval; return;
  end if;

  select * into v_policy
  from policies.evaluate_action(p_organization_id,p_project_id,p_agent_run_id,'tool',p_tool_name);
  if not coalesce(v_policy.allowed,true) then
    return query select false,'policy_denied'::text,v_scope.normalized_target,v_requires_approval; return;
  end if;
  if v_policy.final_action='sandbox_only' and v_tool.execution_environment<>'sandbox' then
    return query select false,'policy_requires_sandbox'::text,v_scope.normalized_target,v_requires_approval; return;
  end if;
  v_requires_approval := v_requires_approval or coalesce(v_policy.requires_approval,false);

  if v_requires_approval then
    select exists(
      select 1 from security.approval_requests a
      where a.organization_id=p_organization_id
        and a.project_id=p_project_id
        and a.engagement_id=p_engagement_id
        and a.agent_run_id=p_agent_run_id
        and a.status='approved'
        and a.operation_type=p_tool_name
        and (a.expires_at is null or a.expires_at>now())
    ) into v_approved;
    if not v_approved then
      return query select false,'approval_required'::text,v_scope.normalized_target,true; return;
    end if;
  end if;

  return query select true,('preflight_passed:'||coalesce(v_policy.final_action,'allow'))::text,v_scope.normalized_target,v_requires_approval;
end $$;
revoke all on function operations.tool_preflight(uuid,uuid,uuid,uuid,text,text,security.scope_type,text) from public,anon,authenticated;
grant execute on function operations.tool_preflight(uuid,uuid,uuid,uuid,text,text,security.scope_type,text) to service_role;

-- Internal control-plane tables are RLS-enabled and service-role only.
do $internal$
declare r record;
begin
  for r in select * from (values
    ('policies','policy_sets'),('policies','policy_versions'),('policies','policy_rules'),('policies','policy_assignments'),('policies','policy_exceptions'),('policies','policy_decisions'),('policies','policy_change_logs'),
    ('ai','model_entitlements'),('ai','learning_candidates'),('ai','agent_evaluations'),('ai','rollouts')
  ) as t(s,n)
  loop
    execute format('alter table %I.%I enable row level security',r.s,r.n);
  end loop;
end $internal$;

alter table ai.agent_profiles enable row level security;
alter table ai.agent_profile_versions enable row level security;
alter table ai.agent_tool_assignments enable row level security;
alter table ai.agent_model_preferences enable row level security;
alter table app.user_model_preferences enable row level security;

create policy agent_profiles_tenant_select on ai.agent_profiles for select to authenticated
using(organization_id is null or (select operations.is_org_member(organization_id)));
create policy agent_profile_versions_tenant_select on ai.agent_profile_versions for select to authenticated
using(exists(select 1 from ai.agent_profiles p where p.id=agent_profile_id and (p.organization_id is null or (select operations.is_org_member(p.organization_id)))));
create policy agent_tool_assignments_tenant_select on ai.agent_tool_assignments for select to authenticated
using(exists(select 1 from ai.agent_profile_versions v join ai.agent_profiles p on p.id=v.agent_profile_id where v.id=agent_profile_version_id and (p.organization_id is null or (select operations.is_org_member(p.organization_id)))));
create policy agent_model_preferences_tenant_select on ai.agent_model_preferences for select to authenticated
using(exists(select 1 from ai.agent_profile_versions v join ai.agent_profiles p on p.id=v.agent_profile_id where v.id=agent_profile_version_id and (p.organization_id is null or (select operations.is_org_member(p.organization_id)))));

create policy user_model_preferences_select_own on app.user_model_preferences for select to authenticated
using(user_id=(select auth.uid()) and (select operations.is_org_member(organization_id)));
create policy user_model_preferences_insert_own on app.user_model_preferences for insert to authenticated
with check(user_id=(select auth.uid()) and (select operations.is_org_member(organization_id)));
create policy user_model_preferences_update_own on app.user_model_preferences for update to authenticated
using(user_id=(select auth.uid()) and (select operations.is_org_member(organization_id)))
with check(user_id=(select auth.uid()) and (select operations.is_org_member(organization_id)));
create policy user_model_preferences_delete_own on app.user_model_preferences for delete to authenticated
using(user_id=(select auth.uid()) and (select operations.is_org_member(organization_id)));

grant select on ai.agent_profiles,ai.agent_profile_versions,ai.agent_tool_assignments,ai.agent_model_preferences to authenticated;
grant select,insert,update,delete on app.user_model_preferences to authenticated;

revoke all on all tables in schema policies from public,anon,authenticated;
revoke all on all sequences in schema policies from public,anon,authenticated;
revoke all on all functions in schema policies from public,anon,authenticated;
grant usage on schema policies to service_role;
grant all on all tables in schema policies to service_role;
grant all on all sequences in schema policies to service_role;
grant execute on all functions in schema policies to service_role;
grant all on ai.agent_profiles,ai.agent_profile_versions,ai.agent_tool_assignments,ai.agent_model_preferences,ai.model_entitlements,ai.learning_candidates,ai.agent_evaluations,ai.rollouts to service_role;
grant all on app.user_model_preferences to service_role;

-- Updated-at consistency.
create trigger touch_policy_sets before update on policies.policy_sets for each row execute function operations.touch_updated_at();
create trigger touch_policy_assignments before update on policies.policy_assignments for each row execute function operations.touch_updated_at();
create trigger touch_agent_profiles before update on ai.agent_profiles for each row execute function operations.touch_updated_at();
create trigger touch_model_entitlements before update on ai.model_entitlements for each row execute function operations.touch_updated_at();
create trigger touch_learning_candidates before update on ai.learning_candidates for each row execute function operations.touch_updated_at();
create trigger touch_rollouts before update on ai.rollouts for each row execute function operations.touch_updated_at();

-- Seed disabled tool capabilities. Definitions do not make execution available; the
-- existing platform system_state and enabled=false keep all execution fail-closed.
insert into ai.tool_definitions(name,version,category,input_schema,output_schema,input_schema_version,required_permissions,requires_project,requires_scope,requires_approval,execution_environment,timeout_seconds,max_output_bytes,cost_class,enabled,needs_network)
values
  ('browser','1.0.0','browser','{}','{}','1',array['tools.browser'],true,true,false,'sandbox',120,10485760,'medium',false,true),
  ('http-request','1.0.0','web','{}','{}','1',array['tools.http'],true,true,false,'sandbox',90,10485760,'low',false,true),
  ('dns-resolve','1.0.0','network','{}','{}','1',array['tools.dns'],true,true,false,'sandbox',60,1048576,'low',false,true),
  ('network-scan','1.0.0','network','{}','{}','1',array['tools.network_scan'],true,true,true,'sandbox',600,52428800,'high',false,true),
  ('shell','1.0.0','shell','{}','{}','1',array['tools.shell'],true,false,true,'sandbox',300,10485760,'high',false,false),
  ('file-execution','1.0.0','file_execution','{}','{}','1',array['tools.file_execution'],true,false,true,'sandbox',300,10485760,'high',false,false),
  ('repository-analysis','1.0.0','repository','{}','{}','1',array['tools.repository'],true,false,false,'sandbox',600,52428800,'medium',false,false),
  ('report-generator','1.0.0','reporting','{}','{}','1',array['tools.report'],true,false,false,'sandbox',300,52428800,'low',false,false)
on conflict(name,version) do update set
  category=excluded.category,
  required_permissions=excluded.required_permissions,
  requires_project=excluded.requires_project,
  requires_scope=excluded.requires_scope,
  requires_approval=excluded.requires_approval,
  execution_environment=excluded.execution_environment,
  timeout_seconds=excluded.timeout_seconds,
  max_output_bytes=excluded.max_output_bytes,
  cost_class=excluded.cost_class,
  needs_network=excluded.needs_network;

-- Built-in agent profiles are configuration only. They do not enable models or tools.
with profile_seed(slug,name,description,category,autonomy,network_access,primary_model) as (
  values
    ('general-security','General Security Agent','General security reasoning and project assistance.','general','medium','scope_only','vexonyx-general'),
    ('web-security','Web Security Agent','Web application assessment profile for authorized engagements.','web','high','scope_only','vexonyx-security'),
    ('recon','Recon Agent','Scoped reconnaissance and target inventory profile.','recon','medium','scope_only','vexonyx-security'),
    ('code-review','Code Review Agent','Repository and source-code security analysis profile.','code','medium','none','vexonyx-general'),
    ('api-security','API Security Agent','API-focused assessment and evidence collection profile.','api','high','scope_only','vexonyx-security'),
    ('cloud-security','Cloud Security Agent','Cloud configuration and attack-surface analysis profile.','cloud','medium','scope_only','vexonyx-security'),
    ('research','Security Research Agent','Controlled security research and analysis profile.','research','medium','internet','vexonyx-reasoning')
), inserted as (
  insert into ai.agent_profiles(slug,name,description,category,enabled,current_version)
  select slug,name,description,category,true,1 from profile_seed
  on conflict do nothing
  returning id,slug
)
insert into ai.agent_profile_versions(agent_profile_id,version,status,system_instructions,max_autonomy,network_access,planner_config,context_config,memory_config)
select p.id,1,'internal','Operate only through VEXONYX policy, authorization, scope, tool and sandbox boundaries.',s.autonomy,s.network_access,'{}','{}',jsonb_build_object('write_mode','candidate_only')
from ai.agent_profiles p join profile_seed s on s.slug=p.slug
where p.organization_id is null
on conflict(agent_profile_id,version) do nothing;

insert into ai.agent_model_preferences(agent_profile_version_id,model_alias,purpose,preference_order,enabled)
select v.id,
  case p.slug
    when 'general-security' then 'vexonyx-general'
    when 'code-review' then 'vexonyx-general'
    when 'research' then 'vexonyx-reasoning'
    else 'vexonyx-security'
  end,
  'primary',10,true
from ai.agent_profile_versions v join ai.agent_profiles p on p.id=v.agent_profile_id
where p.organization_id is null and v.version=1
on conflict do nothing;

insert into ai.agent_model_preferences(agent_profile_version_id,model_alias,purpose,preference_order,enabled)
select v.id,'vexonyx-reasoning','escalation',100,true
from ai.agent_profile_versions v join ai.agent_profiles p on p.id=v.agent_profile_id
where p.organization_id is null and v.version=1 and p.slug<>'research'
on conflict do nothing;

insert into ai.agent_tool_assignments(agent_profile_version_id,tool_definition_id,access_mode,config)
select v.id,t.id,
  case
    when t.name in ('network-scan','http-request','dns-resolve','browser') then 'scope_only'
    when t.name in ('shell','file-execution') then 'require_approval'
    else 'sandbox_only'
  end,
  '{}'::jsonb
from ai.agent_profile_versions v
join ai.agent_profiles p on p.id=v.agent_profile_id and p.organization_id is null and v.version=1
join ai.tool_definitions t on t.version='1.0.0'
on conflict do nothing;

-- Seed policy templates. Only the professional default is globally assigned; it can
-- restrict but never bypass immutable platform, authorization or scope enforcement.
insert into policies.policy_sets(key,name,description,layer,locked,enabled,current_version)
values
 ('vexonyx.platform-enforcement','VEXONYX Platform Enforcement','Protected platform boundaries such as tenant isolation, auditability, scope enforcement, secret isolation and sandbox separation remain below editable policies.','platform',true,true,1),
 ('pentesting-professional','Pentesting Professional','Default professional policy for authorized security engagements.','global',false,true,1),
 ('image-safe-mode','Image Safe Mode','Reusable content policy template for image generation when image capabilities are introduced.','global',false,true,1)
on conflict(key) do nothing;

insert into policies.policy_versions(policy_set_id,version,status,change_reason,activated_at)
select id,1,'active','Initial platform control-plane baseline',now() from policies.policy_sets where key in ('vexonyx.platform-enforcement','pentesting-professional','image-safe-mode')
on conflict(policy_set_id,version) do nothing;

insert into policies.policy_rules(policy_version_id,category,resource,action,severity,priority,non_overridable,config)
select v.id,x.category,x.resource,x.action,x.severity,x.priority,x.non_overridable,x.config
from policies.policy_versions v join policies.policy_sets s on s.id=v.policy_set_id
join (values
  ('vexonyx.platform-enforcement','platform','tenant_isolation','allow','critical',1000,true,'{}'::jsonb),
  ('vexonyx.platform-enforcement','platform','scope_enforcement','allow','critical',1000,true,'{}'::jsonb),
  ('vexonyx.platform-enforcement','platform','sandbox_isolation','allow','critical',1000,true,'{}'::jsonb),
  ('vexonyx.platform-enforcement','platform','secret_isolation','allow','critical',1000,true,'{}'::jsonb),
  ('pentesting-professional','tool','network-scan','allow_scoped','high',500,false,'{}'::jsonb),
  ('pentesting-professional','tool','http-request','allow_scoped','medium',400,false,'{}'::jsonb),
  ('pentesting-professional','tool','dns-resolve','allow_scoped','medium',400,false,'{}'::jsonb),
  ('pentesting-professional','tool','browser','allow_scoped','medium',400,false,'{}'::jsonb),
  ('pentesting-professional','tool','shell','sandbox_only','high',500,false,jsonb_build_object('requires_approval',true)),
  ('pentesting-professional','tool','file-execution','sandbox_only','high',500,false,jsonb_build_object('requires_approval',true)),
  ('image-safe-mode','content.image','adult_nudity','deny','high',500,false,'{}'::jsonb)
) as x(policy_key,category,resource,action,severity,priority,non_overridable,config) on x.policy_key=s.key
where v.version=1 and not exists(
  select 1 from policies.policy_rules r where r.policy_version_id=v.id and r.category=x.category and r.resource=x.resource
);

insert into policies.policy_assignments(policy_version_id,scope_type,scope_id,priority,enabled)
select v.id,'global',null,100,true
from policies.policy_versions v join policies.policy_sets s on s.id=v.policy_set_id
where s.key='pentesting-professional' and v.version=1
on conflict do nothing;

-- Expose the internal schema only to the server-side service role through PostgREST.
alter role authenticator set pgrst.db_schemas='public,app,launch,ai,security,artifacts,reports,usage,billing,operations,audit,integrations,marketing,policies';
notify pgrst,'reload config';
notify pgrst,'reload schema';