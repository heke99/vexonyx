import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("Superadmin password login resolves identity from private database configuration", () => {
  const action = read("../app/admin-login/actions.ts");
  assert.match(action, /vexonyx_is_superadmin_email/);
  assert.match(action, /signInWithPassword/);
  assert.match(action, /persistSession:\s*false/);
  assert.doesNotMatch(action, /const\s+ADMIN_EMAIL\s*=/);
  assert.doesNotMatch(action, /@div3rsa\.com/i);
  assert.doesNotMatch(action, /info@vexonyx\.com/i);
});

test("successful password verification requires a browser-bound email OTP challenge", () => {
  const action = read("../app/admin-login/actions.ts");
  assert.match(action, /admin_auth_challenges/);
  assert.match(action, /browser_secret_hash/);
  assert.match(action, /httpOnly:\s*true/);
  assert.match(action, /sameSite:\s*"strict"/);
  assert.match(action, /email_otp/);
  assert.match(action, /sendAdminVerificationCode/);
  assert.match(action, /verifyOtp\(\{ email, token: code, type: "email" \}\)/);
  assert.match(action, /!data\.session/);
});

test("password recovery requires an email recovery OTP and resets all sessions", () => {
  const action = read("../app/admin-login/actions.ts");
  assert.match(action, /purpose:\s*"password_reset"/);
  assert.match(action, /type:\s*"recovery"/);
  assert.match(action, /scope:\s*"global"/);
  assert.match(action, /password\.length < 16|validPassword/);
});

test("legacy direct magic-link confirmation can no longer create an admin session", () => {
  const confirm = read("../app/admin-confirm/route.ts");
  assert.match(confirm, /legacy_link/);
  assert.doesNotMatch(confirm, /verifyOtp/);
  assert.doesNotMatch(confirm, /token_hash/);
});

test("public signup remains closed while auth challenges are service-role only", () => {
  const identityMigration = read("../../../supabase/migrations/20260814200326_private_superadmin_identity_registry.sql");
  const challengeMigration = read("../../../supabase/migrations/20260814204800_admin_password_email_otp.sql");
  assert.match(identityMigration, /vexonyx_block_auth_user_creation_waitlist/);
  assert.match(challengeMigration, /security\.admin_auth_challenges/);
  assert.match(challengeMigration, /enable row level security/);
  assert.match(challengeMigration, /revoke all.*authenticated/s);
  assert.match(challengeMigration, /grant select, insert, update, delete.*service_role/s);
  assert.doesNotMatch(challengeMigration, /@div3rsa\.com/i);
});
