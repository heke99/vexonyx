import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), "utf8");

test("Superadmin Commerce creates Stripe products and prices instead of accepting manual provider IDs", () => {
  const actions = read("../app/admin/commerce-actions.ts");
  const billingPage = read("../app/admin/billing/page.tsx");
  const creditsPage = read("../app/admin/credits/page.tsx");
  assert.match(actions, /createStripeCatalogProduct/);
  assert.match(actions, /createStripeCatalogPrice/);
  assert.match(actions, /provider_sync_status:\s*"pending"/);
  assert.match(actions, /provider_sync_status:\s*"synced"/);
  assert.doesNotMatch(billingPage, /name="provider_price_id"/);
  assert.doesNotMatch(creditsPage, /name="provider_price_id"/);
  assert.match(billingPage, /Create draft & sync Stripe/);
  assert.match(creditsPage, /Create pack & sync Stripe/);
});

test("Stripe catalog creation uses stable idempotency and immutable provider prices", () => {
  const stripe = read("../lib/billing/stripe.ts");
  assert.match(stripe, /catalog-product-create:\$\{input\.resourceId\}/);
  assert.match(stripe, /catalog-price-create:\$\{input\.resourceId\}/);
  assert.match(stripe, /recurring\[interval\]/);
  assert.match(stripe, /setStripePriceActive/);
  assert.doesNotMatch(stripe, /unit_amount.*\/prices\/\$\{/);
});

test("checkout requires local publication and provider sync on every customer offer", () => {
  const checkout = read("../app/api/v1/billing/checkout/route.ts");
  const customerBilling = read("../app/app/billing/page.tsx");
  assert.match(checkout, /stripeConfigured\(\)/);
  assert.match(checkout, /eq\("provider_sync_status", "synced"\)/);
  assert.match(checkout, /eq\("plans\.status", "active"\)/);
  assert.match(checkout, /eq\("plans\.is_public", true\)/);
  assert.match(customerBilling, /eq\("provider_sync_status", "synced"\)/);
  assert.match(customerBilling, /eq\("plans\.provider_sync_status", "synced"\)/);
});

test("database migration prevents public or checkout-active unsynced catalog rows", () => {
  const migration = read("../../../supabase/migrations/20260815105000_stripe_catalog_provider_sync.sql");
  assert.match(migration, /plan_prices_checkout_ready_check/);
  assert.match(migration, /credit_products_checkout_ready_check/);
  assert.match(migration, /public_plan_provider_not_synced/);
  assert.match(migration, /public_plan_requires_checkout_ready_price/);
  assert.match(migration, /public_plan_cannot_lose_last_checkout_ready_price/);
  assert.match(migration, /plans_authenticated_select/);
  assert.match(migration, /provider_sync_status='synced'/);
});
