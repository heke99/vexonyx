-- VEXONYX Stripe catalog provider synchronization.
-- Local billing configuration remains authoritative for entitlements and visibility.

alter table billing.plans
  add column if not exists provider text not null default 'stripe',
  add column if not exists provider_product_id text,
  add column if not exists provider_sync_status text not null default 'pending',
  add column if not exists provider_sync_error text,
  add column if not exists provider_synced_at timestamptz;

alter table billing.plan_prices
  add column if not exists provider_sync_status text not null default 'pending',
  add column if not exists provider_sync_error text,
  add column if not exists provider_synced_at timestamptz;

alter table billing.credit_products
  add column if not exists provider_product_id text,
  add column if not exists provider_sync_status text not null default 'pending',
  add column if not exists provider_sync_error text,
  add column if not exists provider_synced_at timestamptz;

alter table billing.plans
  add constraint plans_provider_sync_status_check
  check (provider_sync_status in ('pending','synced','error','disabled'));

alter table billing.plan_prices
  add constraint plan_prices_provider_sync_status_check
  check (provider_sync_status in ('pending','synced','error','disabled')),
  add constraint plan_prices_checkout_ready_check
  check (not active or (provider='stripe' and provider_price_id is not null and provider_sync_status='synced'));

alter table billing.credit_products
  add constraint credit_products_provider_sync_status_check
  check (provider_sync_status in ('pending','synced','error','disabled')),
  add constraint credit_products_checkout_ready_check
  check (not active or (provider='stripe' and provider_product_id is not null and provider_price_id is not null and provider_sync_status='synced'));

create unique index if not exists plans_provider_product_uidx on billing.plans(provider,provider_product_id) where provider_product_id is not null;
create index if not exists plans_provider_sync_idx on billing.plans(provider_sync_status,updated_at desc);
create index if not exists plan_prices_provider_sync_idx on billing.plan_prices(provider_sync_status,plan_id,effective_from desc);
create unique index if not exists credit_products_provider_product_uidx on billing.credit_products(provider,provider_product_id) where provider_product_id is not null;
create index if not exists credit_products_provider_sync_idx on billing.credit_products(provider_sync_status,updated_at desc);

create or replace function billing.enforce_public_plan_checkout_readiness()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.is_public then
    if new.status <> 'active' then raise exception 'public_plan_must_be_active' using errcode='23514'; end if;
    if new.provider <> 'stripe' or new.provider_product_id is null or new.provider_sync_status <> 'synced' then
      raise exception 'public_plan_provider_not_synced' using errcode='23514';
    end if;
    if not exists (
      select 1 from billing.plan_prices pp
      where pp.plan_id=new.id and pp.active=true and pp.provider='stripe'
        and pp.provider_price_id is not null and pp.provider_sync_status='synced'
        and pp.effective_from<=now() and (pp.effective_to is null or pp.effective_to>now())
    ) then raise exception 'public_plan_requires_checkout_ready_price' using errcode='23514'; end if;
  end if;
  return new;
end
$$;

revoke all on function billing.enforce_public_plan_checkout_readiness() from public,anon,authenticated;
drop trigger if exists trg_public_plan_checkout_readiness on billing.plans;
create trigger trg_public_plan_checkout_readiness
before insert or update of status,is_public,provider,provider_product_id,provider_sync_status on billing.plans
for each row execute function billing.enforce_public_plan_checkout_readiness();

create or replace function billing.enforce_public_plan_keeps_price()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_plan_id uuid;
  v_price_id uuid;
  v_new_ready boolean;
begin
  if tg_op='DELETE' then
    v_plan_id := old.plan_id;
    v_price_id := old.id;
    v_new_ready := false;
  else
    v_plan_id := new.plan_id;
    v_price_id := new.id;
    v_new_ready := new.active=true and new.provider='stripe' and new.provider_price_id is not null
      and new.provider_sync_status='synced' and new.effective_from<=now()
      and (new.effective_to is null or new.effective_to>now());
  end if;

  if exists (select 1 from billing.plans p where p.id=v_plan_id and p.status='active' and p.is_public=true)
     and not v_new_ready
     and not exists (
       select 1 from billing.plan_prices pp
       where pp.plan_id=v_plan_id
         and pp.id<>v_price_id
         and pp.active=true
         and pp.provider='stripe'
         and pp.provider_price_id is not null
         and pp.provider_sync_status='synced'
         and pp.effective_from<=now()
         and (pp.effective_to is null or pp.effective_to>now())
     ) then
    raise exception 'public_plan_cannot_lose_last_checkout_ready_price' using errcode='23514';
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end
$$;

revoke all on function billing.enforce_public_plan_keeps_price() from public,anon,authenticated;
drop trigger if exists trg_public_plan_keeps_price_update on billing.plan_prices;
create trigger trg_public_plan_keeps_price_update
before update of active,provider,provider_price_id,provider_sync_status,effective_from,effective_to or delete on billing.plan_prices
for each row execute function billing.enforce_public_plan_keeps_price();

drop policy if exists plans_authenticated_select on billing.plans;
create policy plans_authenticated_select on billing.plans for select to authenticated
using (status='active' and is_public=true and provider='stripe' and provider_product_id is not null and provider_sync_status='synced');

drop policy if exists plan_prices_authenticated_select on billing.plan_prices;
create policy plan_prices_authenticated_select on billing.plan_prices for select to authenticated
using (
  active=true and provider='stripe' and provider_price_id is not null and provider_sync_status='synced'
  and effective_from<=now() and (effective_to is null or effective_to>now())
  and exists (
    select 1 from billing.plans p where p.id=plan_prices.plan_id and p.status='active' and p.is_public=true
      and p.provider='stripe' and p.provider_product_id is not null and p.provider_sync_status='synced'
  )
);

drop policy if exists credit_products_authenticated_select on billing.credit_products;
create policy credit_products_authenticated_select on billing.credit_products for select to authenticated
using (active=true and provider='stripe' and provider_product_id is not null and provider_price_id is not null and provider_sync_status='synced');
