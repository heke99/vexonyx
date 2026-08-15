import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../app/ready/route.ts", import.meta.url), "utf8");

test("readiness exposes only boolean Commerce configuration state", () => {
  assert.match(source, /stripeConfigured\(\)/);
  assert.match(source, /commerceConfig/);
  assert.doesNotMatch(source, /STRIPE_SECRET_KEY/);
  assert.doesNotMatch(source, /STRIPE_WEBHOOK_SECRET/);
  assert.match(source, /cache-control/);
});
