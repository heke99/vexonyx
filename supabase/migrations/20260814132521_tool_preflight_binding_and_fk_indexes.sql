-- Tighten active-engagement mutation rules, bind tool execution to the exact project/engagement,
-- add lease renewal for long-running workers, and cover composite tenant foreign keys.

drop policy if exists engagements_activate_admin on security.engagements;
drop policy if exists engagements_update_member on security.engagements;
drop policy if exists engagements_update_scoped on security.engagements;
create policy engagements_update_scoped on security.engagements
for update to authenticated
using (
  operations.has_org_write(organization_id)
  and (status <> 'active' or operations.has_org_admin(organization_id))
)
with check (
  operations.has_org_write(organization_id)
  and (status <> 'active' or operations.has_org_admin(organization_id))
);

do $$
declare
  r record;
  v_columns text;
  v_index_name text;
begin
  for r in
    select c.oid, c.conname, n.nspname as schema_name, t.relname as table_name, c.conkey
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where c.contype='f'
      and n.nspname in ('app','security','artifacts','ai','reports','usage','billing','operations','launch')
      and array_length(c.conkey,1) > 1
  loop
    select string_agg(quote_ident(a.attname), ', ' order by u.ord)
      into v_columns
    from unnest(r.conkey) with ordinality as u(attnum,ord)
    join pg_attribute a on a.attrelid=(select conrelid from pg_constraint where oid=r.oid)
      and a.attnum=u.attnum;

    v_index_name := substr(r.conname,1,55) || '_idx';
    execute format('create index if not exists %I on %I.%I (%s)',
      v_index_name, r.schema_name, r.table_name, v_columns);
  end loop;
end $$;

create or replace function operations.renew_job_lease(
  p_job_id uuid,
  p_worker_id text,
  p_lease_generation bigint,
  p_lease_seconds integer default 60
)
returns boolean
language plpgsql security definer set search_path='' as $$
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
end $$;

revoke all on function operations.renew_job_lease(uuid,text,bigint,integer) from public,anon,authenticated;
grant execute on function operations.renew_job_lease(uuid,text,bigint,integer) to service_role;

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

  return query select true,'preflight_passed'::text,v_scope.normalized_target,v_requires_approval;
end $$;

revoke all on function operations.tool_preflight(uuid,uuid,uuid,uuid,text,text,security.scope_type,text) from public,anon,authenticated;
grant execute on function operations.tool_preflight(uuid,uuid,uuid,uuid,text,text,security.scope_type,text) to service_role;

notify pgrst,'reload schema';
