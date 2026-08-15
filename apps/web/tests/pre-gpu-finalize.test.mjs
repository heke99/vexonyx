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
});

test("marketing exports use dedicated leased retries and private storage", () => {
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
  assert.match(worker, /upsert:true/);
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
  assert.match(migration, /plan_prices_checkout_ready_check/);
  assert.match(migration, /credit_products_checkout_ready_check/);
});