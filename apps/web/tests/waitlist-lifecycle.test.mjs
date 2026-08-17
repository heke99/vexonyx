import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const exists = (path) => fs.existsSync(new URL(path, import.meta.url));

test("public waitlist responses do not enumerate existing addresses", () => {
  const route = read("../app/api/v1/waitlist/route.ts");
  const form = read("../components/waitlist-form.tsx");
  assert.match(route, /check_waitlist_rate_limit/);
  assert.match(route, /prepare_waitlist_verification_email/);
  assert.match(route, /Never reveal whether the address was new/);
  assert.doesNotMatch(route, /referralCode/);
  assert.doesNotMatch(route, /verified:\s*true/);
  assert.match(form, /name="website"/);
  assert.doesNotMatch(form, /payload\.verified|payload\.referralCode|verificationDelivery/);
});

test("waitlist email uses durable retry delivery", () => {
  const worker = read("../app/api/internal/workers/waitlist-email/route.ts");
  const provider = read("../lib/email/provider.ts");
  const verify = read("../app/api/v1/waitlist/verify/route.ts");
  assert.match(worker, /p_queue_name:\s*"email"/);
  assert.match(worker, /waitlist_email_deliveries/);
  assert.match(worker, /status:\s*"dead_letter"/);
  assert.match(worker, /payload:\s*\{\}/);
  assert.doesNotMatch(worker, /access_invitation|sendWaitlistAccessInvitation/);
  assert.match(provider, /messageId/);
  assert.match(verify, /enqueue_waitlist_confirmation/);
});

test("product remains waitlist-only with no account activation surface", () => {
  const signupPage = read("../app/signup/page.tsx");
  const signupAction = read("../app/signup/actions.ts");
  const proxy = read("../proxy.ts");
  assert.match(signupPage, /waitlist/i);
  assert.match(signupAction, /waitlist/i);
  assert.doesNotMatch(signupAction, /auth\.signUp|createUser/);
  assert.match(proxy, /path === "\/signup"/);
  assert.match(proxy, /url\.pathname = "\/waitlist"/);
  assert.equal(exists("../app/waitlist/access/page.tsx"), false);
  assert.equal(exists("../app/waitlist/access/actions.ts"), false);
  assert.equal(exists("../components/waitlist-access-form.tsx"), false);
});
