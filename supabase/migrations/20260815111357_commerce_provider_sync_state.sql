-- Forward-fix commerce publishing discovered by transactional production E2E.
-- Active checkout rows must explicitly record a successful Stripe synchronization.

create or replace function billing.create_plan_price_version(
  p_plan_id uuid,
  p_billing_interval text,
  p_currency text,
  p_unit_amount_minor bigint,
  p_provider text,
  p_provider_price_id text,
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
  v_sync_status text;
begin
  if p_billing_interval not in ('month','year') then
    raise exception 'invalid_billing_interval' using errcode = '22023';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid_currency' using errcode = '22023';
  end if;
  if p_unit_amount_minor < 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_active and (p_provider <> 'stripe' or p_provider_price_id is null or length(trim(p_provider_price_id)) = 0) then
    raise exception 'synced_stripe_price_required' using errcode = '22023';
  end if;

  perform 1 from billing.plans where id = p_plan_id for update;
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;

  if p_active then
    update billing.plan_prices
       set active = false,
           effective_to = coalesce(effective_to, v_now)
     where plan_id = p_plan_id
       and billing_interval = p_billing_interval
       and currency = p_currency
       and active;
  end if;

  v_sync_status := case when p_provider = 'stripe' and p_provider_price_id is not null then 'synced' else 'pending' end;

  insert into billing.plan_prices(
    plan_id,billing_interval,currency,unit_amount_minor,provider,provider_price_id,
    active,effective_from,effective_to,provider_sync_status,provider_sync_error,provider_synced_at
  ) values (
    p_plan_id,p_billing_interval,p_currency,p_unit_amount_minor,p_provider,p_provider_price_id,
    p_active,v_now,null,v_sync_status,null,case when v_sync_status='synced' then v_now else null end
  ) returning id into v_id;

  return v_id;
end
$$;

revoke all on function billing.create_plan_price_version(uuid,text,text,bigint,text,text,boolean) from public, anon, authenticated;
grant execute on function billing.create_plan_price_version(uuid,text,text,bigint,text,text,boolean) to service_role;
