import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("Superadmin login and reset use atomic service-role-only rate limits", () => {
  const actions = read("../app/admin-login/actions.ts");
  const migration = read("../../../supabase/migrations/20260815105819_admin_rate_limit_and_index_cleanup.sql");
  assert.match(actions, /consume_admin_auth_rate_limit/);
  assert.match(actions, /clear_admin_auth_rate_limit/);
  assert.match(actions, /"password_login"/);
  assert.match(actions, /"password_reset"/);
  assert.match(migration, /security\.admin_auth_rate_limits/);
  assert.match(migration, /for update/i);
  assert.match(migration, /set\s+search_path\s*=\s*''/i);
  assert.match(migration, /revoke\s+all\s+on\s+security\.admin_auth_rate_limits\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i);
  assert.match(migration, /service_role/is);
});

test("credit values are versioned and customer-visible from one catalog", () => {
  const action = read("../app/admin/credit-rate-actions.ts");
  const adminPage = read("../app/admin/credits/page.tsx");
  const customerPage = read("../app/app/billing/page.tsx");
  const migration = read("../../../supabase/migrations/20260815110024_credit_rate_versioning.sql");
  assert.match(action, /create_credit_rate_version/);
  assert.match(migration, /credit_rates_one_active_idx/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(adminPage, /Credit value/);
  assert.match(adminPage, /Usage-rate history/);
  assert.match(customerPage, /How credits are used/);
  assert.match(customerPage, /plan_entitlements/);
  assert.match(customerPage, /credits \/ month/);
});

test("each user gets self-scoped monthly resource and credit usage", () => {
  const usagePage = read("../app/app/usage/page.tsx");
  const usageMigration = read("../../../supabase/migrations/20260815170114_user_usage_monthly.sql");
  const creditMigration = read("../../../supabase/migrations/20260815171231_user_credit_monthly.sql");
  assert.match(usagePage, /usage_user_monthly/);
  assert.match(usagePage, /credit_user_monthly/);
  assert.match(usagePage, /\.eq\("user_id", ws\.userId\)/);
  assert.match(usagePage, /Credits used this month/);
  assert.doesNotMatch(usagePage, /from\("credit_ledger"\)/);
  assert.match(usageMigration, /usage\.usage_user_monthly/);
  assert.match(usageMigration, /user_id = auth\.uid\(\)/);
  assert.match(usageMigration, /operations\.is_org_member\(organization_id\)/);
  assert.match(usageMigration, /aggregate_user_usage_event/);
  assert.match(usageMigration, /set search_path = ''/i);
  assert.match(creditMigration, /usage\.credit_user_monthly/);
  assert.match(creditMigration, /user_id = auth\.uid\(\)/);
  assert.match(creditMigration, /operations\.is_org_member\(organization_id\)/);
  assert.match(creditMigration, /aggregate_user_credit_usage/);
  assert.match(creditMigration, /new\.entry_type = 'usage'/);
  assert.match(creditMigration, /set search_path = ''/i);
});

test("billing webhooks use authoritative catalog data and tolerate Stripe event reordering", () => {
  const webhook = read("../app/api/v1/billing/webhook/route.ts");
  assert.match(webhook, /credit_products/);
  assert.match(webhook, /metadata\.catalog_id/);
  assert.match(webhook, /credit_product_amount_mismatch/);
  assert.match(webhook, /credit_product_currency_mismatch/);
  assert.match(webhook, /p_amount:purchasedCredits/);
  assert.doesNotMatch(webhook, /const credits=Number\(metadata\.credits/);
  assert.match(webhook, /loadStripeSubscriptionPlan/);
  assert.match(webhook, /if\(!planId&&providerSubscriptionId\)/);
  assert.match(webhook, /invoice-credit:/);
});

test("tax-ready commerce records tax state without pretending collection is active", () => {
  const migration = read("../../../supabase/migrations/20260815182411_tax_ready_commerce.sql");
  const defaults = read("../../../supabase/migrations/20260815182858_tax_candidate_defaults.sql");
  const checkout = read("../app/api/v1/billing/checkout/route.ts");
  const webhook = read("../app/api/v1/billing/webhook/route.ts");
  const taxActions = read("../app/admin/tax-actions.ts");
  const taxPage = read("../app/admin/tax/page.tsx");
  const stripe = read("../lib/billing/stripe.ts");
  const ready = read("../app/ready/route.ts");

  assert.match(migration, /billing\.tax_settings/);
  assert.match(migration, /automatic_collection_enabled boolean not null default false/);
  assert.match(migration, /revoke all on billing\.tax_settings from public, anon, authenticated/);
  assert.match(migration, /tax_status text not null default 'not_calculated'/);
  assert.match(migration, /subtotal_minor bigint/);
  assert.match(migration, /tax_minor bigint/);
  assert.match(migration, /total_minor bigint/);
  assert.match(defaults, /txcd_10105002/);

  assert.match(checkout, /tax_id_collection\[enabled\]/);
  assert.match(checkout, /customer_update\[address\]/);
  assert.match(checkout, /customer_update\[name\]/);
  assert.match(checkout, /listActiveStripeTaxRegistrations/);
  assert.match(checkout, /taxClassificationStatus !== "confirmed"/);
  assert.match(checkout, /if \(automaticTaxEnabled\) params\.set\("automatic_tax\[enabled\]", "true"\)/);

  assert.match(webhook, /taxSnapshot/);
  assert.match(webhook, /syncBillingCustomer/);
  assert.match(webhook, /subtotal_minor:tax\.subtotal/);
  assert.match(webhook, /tax_minor:tax\.tax/);
  assert.match(webhook, /total_minor:tax\.total/);
  assert.match(webhook, /automatic_tax_enabled/);

  assert.match(taxActions, /retrieveStripeTaxCode/);
  assert.match(taxActions, /No active Stripe Tax registration exists/);
  assert.match(taxActions, /tax_classification_status !== "confirmed"/);
  assert.doesNotMatch(taxActions, /tax\/registrations.*POST/i);
  assert.match(taxPage, /No automatic registrations/);
  assert.match(taxPage, /prepaid, restricted VEXONYX usage/);

  assert.match(stripe, /params\.set\("tax_behavior", input\.taxBehavior \|\| "exclusive"\)/);
  assert.match(stripe, /retrieveStripeTaxCode/);
  assert.match(stripe, /listActiveStripeTaxRegistrations/);
  assert.match(ready, /taxInfrastructureConfig/);
  assert.match(ready, /taxCollectionConfig/);
});

test("marketing exports use dedicated leased retries, private storage and a self-cleaning canary", () => {
  const action = read("../app/admin/audience-actions.ts");
  const worker = read("../app/api/internal/workers/marketing-exports/route.ts");
  const migration = read("../../../supabase/migrations/20260815110823_marketing_export_queue.sql");
  assert.match(action, /queue_name:\s*"marketing"/);
  assert.match(action, /max_attempts:\s*5/);
  assert.match(worker, /p_queue_name:\s*"marketing"/);
  assert.match(worker, /start_job/);
  assert.match(worker, /finish_job/);
  assert.match(worker, /lease_generation/);
  assert.match(worker, /admin-exports/);
  assert.match(worker, /upsert:\s*true/);
  assert.match(worker, /runtime\.marketing_export_canary/);
  assert.match(worker, /storageRoundTrip/);
  assert.match(worker, /cleanupVerified/);
  assert.match(worker, /_canary\/marketing/);
  assert.match(worker, /\.download\(/);
  assert.match(worker, /\.remove\(/);
  assert.match(migration, /'marketing'/);
});

test("worker leases recover and stale workers remain fenced", () => {
  const migration = read("../../../supabase/migrations/20260815110634_worker_lease_recovery.sql");
  assert.match(migration, /operations\.requeue_expired_leases/);
  assert.match(migration, /artifacts\.requeue_expired_parser_leases/);
  assert.match(migration, /lease_lost/);
  assert.match(migration, /vexonyx-lease-recovery/);
});

test("report renderer continuously canaries real PDF and DOCX via private storage", () => {
  const worker = read("../app/api/internal/workers/render-reports/route.ts");
  assert.match(worker, /renderPdf/);
  assert.match(worker, /renderDocx/);
  assert.match(worker, /runtime\.report_renderer_canary/);
  assert.match(worker, /storageRoundTrip/);
  assert.match(worker, /cleanupVerified/);
  assert.match(worker, /project-artifacts/);
  assert.match(worker, /validPdf/);
  assert.match(worker, /validDocx/);
});

test("provider-synced offers remain fail-closed in customer commerce", () => {
  const customerPage = read("../app/app/billing/page.tsx");
  const migration = read("../../../supabase/migrations/20260815110715_stripe_catalog_provider_sync.sql");
  assert.match(customerPage, /provider_sync_status/);
  assert.match(customerPage, /No subscription plans are on sale yet/);
  assert.match(customerPage, /No credit packs are active/);
  assert.match(customerPage, /plus applicable tax/);
  assert.match(migration, /plan_prices_checkout_ready_check/);
  assert.match(migration, /credit_products_checkout_ready_check/);
});
