-- Customer-facing billing catalog is least-privilege: only published active products are readable.

drop policy if exists plans_authenticated_select on billing.plans;
create policy plans_authenticated_select on billing.plans
for select to authenticated
using (status = 'active' and is_public = true);

drop policy if exists plan_prices_authenticated_select on billing.plan_prices;
create policy plan_prices_authenticated_select on billing.plan_prices
for select to authenticated
using (
  active = true
  and effective_from <= now()
  and (effective_to is null or effective_to > now())
  and exists (
    select 1 from billing.plans p
    where p.id = plan_id and p.status = 'active' and p.is_public = true
  )
);

drop policy if exists plan_entitlements_authenticated_select on billing.plan_entitlements;
create policy plan_entitlements_authenticated_select on billing.plan_entitlements
for select to authenticated
using (
  exists (
    select 1 from billing.plans p
    where p.id = plan_id and p.status = 'active' and p.is_public = true
  )
);

-- billing.subscriptions already has a unique constraint on organization_id from the original schema.
drop index if exists billing.subscriptions_org_uidx;
