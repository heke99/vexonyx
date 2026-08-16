create or replace function billing.update_organization_quotas(
  p_organization_id uuid,
  p_monthly_budget numeric,
  p_agent_budget numeric,
  p_generation_budget numeric,
  p_sandbox_budget numeric,
  p_hard_cap_enabled boolean
)
returns billing.quotas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row billing.quotas%rowtype;
begin
  if v_user is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if not exists (
    select 1 from app.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = v_user
      and m.role in ('organization_owner','organization_admin')
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if (p_monthly_budget is not null and (p_monthly_budget < 0 or p_monthly_budget > 100000000))
    or (p_agent_budget is not null and (p_agent_budget < 0 or p_agent_budget > 100000000))
    or (p_generation_budget is not null and (p_generation_budget < 0 or p_generation_budget > 100000000))
    or (p_sandbox_budget is not null and (p_sandbox_budget < 0 or p_sandbox_budget > 100000000)) then
    raise exception 'invalid_budget' using errcode = '22023';
  end if;

  insert into billing.quotas(organization_id,monthly_budget,agent_budget,generation_budget,sandbox_budget,hard_cap_enabled,updated_at)
  values(p_organization_id,p_monthly_budget,p_agent_budget,p_generation_budget,p_sandbox_budget,coalesce(p_hard_cap_enabled,false),now())
  on conflict (organization_id) do update set
    monthly_budget=excluded.monthly_budget,
    agent_budget=excluded.agent_budget,
    generation_budget=excluded.generation_budget,
    sandbox_budget=excluded.sandbox_budget,
    hard_cap_enabled=excluded.hard_cap_enabled,
    updated_at=now()
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function billing.update_organization_quotas(uuid,numeric,numeric,numeric,numeric,boolean) from public, anon;
grant execute on function billing.update_organization_quotas(uuid,numeric,numeric,numeric,numeric,boolean) to authenticated, service_role;
