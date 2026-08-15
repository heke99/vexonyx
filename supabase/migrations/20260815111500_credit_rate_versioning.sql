-- Credit pricing is versioned just like subscription pricing.
-- A metric/unit pair has at most one active rate and publishing swaps versions atomically.

create unique index if not exists credit_rates_one_active_idx
  on billing.credit_rates(metric, unit)
  where active;

create or replace function billing.create_credit_rate_version(
  p_metric text,
  p_unit text,
  p_credits_per_unit numeric,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_id uuid;
begin
  if p_metric is null or p_metric !~ '^[a-z0-9][a-z0-9_.:-]{1,79}$' then
    raise exception 'invalid_credit_metric' using errcode = '22023';
  end if;
  if p_unit is null or p_unit !~ '^[a-z0-9][a-z0-9_.:-]{1,79}$' then
    raise exception 'invalid_credit_unit' using errcode = '22023';
  end if;
  if p_credits_per_unit <= 0 or p_credits_per_unit > 1000000000 then
    raise exception 'invalid_credit_rate' using errcode = '22023';
  end if;

  if p_active then
    perform pg_advisory_xact_lock(hashtextextended(p_metric || ':' || p_unit, 0));
    update billing.credit_rates
       set active = false,
           effective_to = coalesce(effective_to, v_now)
     where metric = p_metric
       and unit = p_unit
       and active;
  end if;

  insert into billing.credit_rates(metric, unit, credits_per_unit, active, effective_from, effective_to)
  values(p_metric, p_unit, p_credits_per_unit, p_active, v_now, null)
  returning id into v_id;

  return v_id;
end
$$;

revoke all on function billing.create_credit_rate_version(text,text,numeric,boolean) from public, anon, authenticated;
grant execute on function billing.create_credit_rate_version(text,text,numeric,boolean) to service_role;
