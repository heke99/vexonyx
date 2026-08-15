import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const checkout = fs.readFileSync(new URL("../app/api/v1/billing/checkout/route.ts", import.meta.url), "utf8");
const cancel = fs.readFileSync(new URL("../app/api/v1/billing/cancel/route.ts", import.meta.url), "utf8");
const billingActions = fs.readFileSync(new URL("../components/billing-actions.tsx", import.meta.url), "utf8");
const terms = fs.readFileSync(new URL("../app/terms/page.tsx", import.meta.url), "utf8");
const refunds = fs.readFileSync(new URL("../app/refunds/page.tsx", import.meta.url), "utf8");
const cookies = fs.readFileSync(new URL("../app/cookies/page.tsx", import.meta.url), "utf8");

test("checkout fails closed without explicit legal acceptance", () => {
  assert.match(checkout, /function legalAcceptanceValid/);
  assert.match(checkout, /legal_acceptance_required/);
  assert.match(checkout, /legal\?\.terms/);
  assert.match(checkout, /legal\.refund_policy/);
  assert.match(checkout, /legal\.acceptable_use/);
  assert.match(checkout, /legal\.immediate_performance/);
  assert.match(checkout, /legal\.professional_use/);
  assert.match(checkout, /kind === "subscription" && !legal\.auto_renewal/);
});

test("server stores versioned checkout acceptance and binds it to Stripe", () => {
  assert.match(checkout, /POLICY_VERSION = "2026-08-15"/);
  assert.match(checkout, /from\("legal_acceptances"\)\.insert/);
  assert.match(checkout, /policy_snapshot: snapshot/);
  assert.match(checkout, /metadata\[legal_acceptance_id\]/);
  assert.match(checkout, /subscription_data\[metadata\]\[legal_acceptance_id\]/);
  assert.match(checkout, /provider_checkout_session_id: sessionId/);
});

test("checkout UI presents purchase terms before redirect", () => {
  assert.match(billingActions, /Terms/);
  assert.match(billingActions, /Refund & Cancellation Policy/);
  assert.match(billingActions, /Acceptable Use Policy/);
  assert.match(billingActions, /request immediate access/i);
  assert.match(billingActions, /renews automatically each month/i);
  assert.match(billingActions, /Agree & continue/);
});

test("subscription cancellation is online, admin-scoped and stops future renewal", () => {
  assert.match(cancel, /organization_owner/);
  assert.match(cancel, /organization_admin/);
  assert.match(cancel, /billing_admin_required/);
  assert.match(cancel, /cancel_at_period_end: "true"/);
  assert.match(cancel, /provider_cancellation_not_confirmed/);
  assert.match(cancel, /cancellation_source: "self_service"/);
});

test("terms and refund policy preserve mandatory rights while using no-refund default", () => {
  assert.match(terms, /automatically renew/i);
  assert.match(terms, /mandatory consumer rights/i);
  assert.match(refunds, /No-refund rule/);
  assert.match(refunds, /mandatory law requires/i);
  assert.match(refunds, /European consumer rights/);
});

test("cookie policy does not invent optional tracking", () => {
  assert.match(cookies, /does not currently intentionally deploy non-essential analytics cookies/i);
  assert.match(cookies, /does not currently use advertising cookies/i);
  assert.match(cookies, /before the technology is activated/i);
});
