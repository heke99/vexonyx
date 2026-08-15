import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("Superadmin publishes Stripe-backed catalog without client-controlled provider IDs", () => {
  const actions = read("../app/admin/commerce-actions.ts");
  const billing = read("../app/admin/billing/page.tsx");
  const credits = read("../app/admin/credits/page.tsx");
  assert.match(actions, /stripeRequest\("\/products"/);
  assert.match(actions, /stripeRequest\("\/prices"/);
  assert.match(actions, /provider_product_id/);
  assert.match(actions, /create_plan_price_version/);
  assert.doesNotMatch(billing, /name="provider_price_id"/);
  assert.doesNotMatch(credits, /name="provider_price_id"/);
});

test("subscription price publishing is single-active and service-role only", () => {
  const migration = read("../../../supabase/migrations/20260815110000_admin_rate_limit_and_index_cleanup.sql");
  assert.match(migration, /plan_prices_one_active_checkout_idx/);
  assert.match(migration, /where active/i);
  assert.match(migration, /create or replace function billing\.create_plan_price_version/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /revoke all on function billing\.create_plan_price_version.*authenticated/is);
  assert.match(migration, /grant execute on function billing\.create_plan_price_version.*service_role/is);
});

test("credit rates are versioned atomically and controlled by Superadmin", () => {
  const migration = read("../../../supabase/migrations/20260815111500_credit_rate_versioning.sql");
  const action = read("../app/admin/credit-rate-actions.ts");
  assert.match(migration, /credit_rates_one_active_idx/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /create_credit_rate_version/);
  assert.match(action, /create_credit_rate_version/);
  assert.match(action, /billing\.credit_rate_created/);
});

test("customer billing remains server-priced and fail-closed", () => {
  const page = read("../app/app/billing/page.tsx");
  const checkout = read("../app/api/v1/billing/checkout/route.ts");
  assert.match(page, /No subscription plans are on sale yet/);
  assert.match(page, /No credit packs are active/);
  assert.match(checkout, /provider_price_id/);
  assert.doesNotMatch(checkout, /unit_amount_minor\s*=\s*body/);
  assert.doesNotMatch(checkout, /price\s*=\s*body/);
});
