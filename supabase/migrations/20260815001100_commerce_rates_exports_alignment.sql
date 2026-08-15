-- Commerce alignment: provider events may arrive before org lookup, credit semantics are explicit, admin exports are private.

alter table billing.events alter column organization_id drop not null;
create index if not exists billing_events_external_idx on billing.events(external_id) where external_id is not null;

create table if not exists billing.credit_rates(
  id uuid primary key default gen_random_uuid(),
  metric text not null,
  unit text not null,
  credits_per_unit numeric(24,8) not null check(credits_per_unit > 0),
  active boolean not null default false,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(metric,unit,effective_from)
);
create index if not exists credit_rates_lookup_idx on billing.credit_rates(metric,unit,active,effective_from desc);
alter table billing.credit_rates enable row level security;
create policy credit_rates_authenticated_select on billing.credit_rates for select to authenticated using(active);
grant select on billing.credit_rates to authenticated;
grant all on billing.credit_rates to service_role;

create or replace function billing.sync_plan_entitlements(p_organization_id uuid,p_plan_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  if not exists(select 1 from app.organizations o where o.id=p_organization_id) then raise exception 'organization_not_found' using errcode='P0001'; end if;
  if p_plan_id is not null and not exists(select 1 from billing.plans p where p.id=p_plan_id) then raise exception 'plan_not_found' using errcode='P0001'; end if;
  delete from billing.entitlements where organization_id=p_organization_id and source='plan';
  if p_plan_id is not null then
    insert into billing.entitlements(organization_id,key,value,source,starts_at,created_at,updated_at)
    select p_organization_id,pe.entitlement_key,pe.entitlement_value,'plan',now(),now(),now()
    from billing.plan_entitlements pe where pe.plan_id=p_plan_id;
  end if;
  get diagnostics v_count=row_count;
  return v_count;
end $$;
revoke all on function billing.sync_plan_entitlements(uuid,uuid) from public,anon,authenticated;
grant execute on function billing.sync_plan_entitlements(uuid,uuid) to service_role;

create or replace function billing.calculate_credit_cost(p_metric text,p_unit text,p_quantity numeric)
returns bigint language sql stable security definer set search_path='' as $$
  select greatest(0,ceil(coalesce((select r.credits_per_unit from billing.credit_rates r where r.metric=p_metric and r.unit=p_unit and r.active and r.effective_from<=now() and (r.effective_to is null or r.effective_to>now()) order by r.effective_from desc limit 1),0)*greatest(p_quantity,0)))::bigint
$$;
revoke all on function billing.calculate_credit_cost(text,text,numeric) from public,anon,authenticated;
grant execute on function billing.calculate_credit_cost(text,text,numeric) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('admin-exports','admin-exports',false,52428800,array['text/csv'])
on conflict(id) do update set public=false,file_size_limit=52428800,allowed_mime_types=array['text/csv'];
-- No authenticated storage policies are created: only service-role workers can write and Superadmin server routes issue short-lived signed URLs.
