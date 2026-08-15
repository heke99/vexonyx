import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const webhook = fs.readFileSync(new URL("../app/api/v1/billing/webhook/route.ts", import.meta.url), "utf8");

test("monthly plan credits require an authoritative Stripe subscription invoice", () => {
  assert.match(webhook, /function invoiceSubscriptionId/);
  assert.match(webhook, /parent\.subscription_details/);
  assert.match(webhook, /parent\.type \|\| ""\) !== "subscription_details"/);
  assert.match(webhook, /billingReason === "subscription_create" \|\| billingReason === "subscription_cycle"/);
  assert.match(webhook, /resolvePaidInvoicePlan/);
  assert.match(webhook, /invoice_subscription_mismatch/);
  assert.match(webhook, /invoice_subscription_org_mismatch/);
  assert.match(webhook, /invoice_subscription_customer_mismatch/);
  assert.match(webhook, /invoice_subscription_plan_mismatch/);
  assert.match(webhook, /provider_subscription_id: resolved\.providerSubscriptionId/);
});

test("manual invoice failures cannot mark a subscription past due", () => {
  assert.match(webhook, /const providerSubscriptionId = invoiceSubscriptionId\(object\)/);
  assert.match(webhook, /if \(providerSubscriptionId\)/);
  assert.match(webhook, /\.eq\("provider_subscription_id", providerSubscriptionId\)/);
});

test("paid manual or update invoices cannot grant monthly credits", () => {
  assert.match(webhook, /if \(!isMonthlyGrantInvoice\(invoice\)\) return null/);
  assert.doesNotMatch(webhook, /providerSubscriptionId=String\(object\.subscription/);
});
