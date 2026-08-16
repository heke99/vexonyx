-- Safe user-facing model catalog plus explicit deny policies for internal AI/control-plane tables.

create or replace function ai.available_models_for_user(p_organization_id uuid)
returns table(alias text,role text,description text)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_plan_id uuid;
begin
  if v_user is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not operations.is_org_member(p_organization_id) then raise exception 'forbidden' using errcode='42501'; end if;

  select s.plan_id into v_plan_id
  from billing.subscriptions s
  where s.organization_id=p_organization_id and s.status in ('trialing','active','past_due')
  order by coalesce(s.current_period_end,'infinity'::timestamptz) desc,s.created_at desc
  limit 1;

  return query
  select m.alias,m.role,m.description
  from ai.models m
  where m.enabled
    and (
      exists(select 1 from ai.model_entitlements e where e.enabled and e.scope_type='organization' and e.scope_id=p_organization_id::text and e.model_alias=m.alias)
      or (v_plan_id is not null and exists(select 1 from ai.model_entitlements e where e.enabled and e.scope_type='plan' and e.scope_id=v_plan_id::text and e.model_alias=m.alias))
    )
  order by m.role,m.alias;
end $$;
revoke all on function ai.available_models_for_user(uuid) from public,anon;
grant execute on function ai.available_models_for_user(uuid) to authenticated,service_role;

-- RLS-with-no-policy is intentionally deny-all, but explicit deny policies make the
-- contract visible to database security tooling and future maintainers.
do $deny$
declare r record;
begin
  for r in select * from (values
    ('ai','models'),('ai','model_versions'),('ai','model_deployments'),('ai','routing_rules'),('ai','prompt_versions'),('ai','model_capabilities'),('ai','model_evaluations'),('ai','tool_definitions'),('ai','model_entitlements'),('ai','learning_candidates'),('ai','agent_evaluations'),('ai','rollouts'),
    ('policies','policy_sets'),('policies','policy_versions'),('policies','policy_rules'),('policies','policy_assignments'),('policies','policy_exceptions'),('policies','policy_decisions'),('policies','policy_change_logs')
  ) as t(s,n)
  loop
    execute format('create policy internal_deny_client on %I.%I for all to anon,authenticated using (false) with check (false)',r.s,r.n);
  end loop;
end $deny$;

notify pgrst,'reload schema';