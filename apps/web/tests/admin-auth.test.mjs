import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const authMigration = "../../../supabase/migrations/20260814210224_admin_password_email_otp.sql";
const hardeningMigration = "../../../supabase/migrations/20260815110000_admin_rate_limit_and_index_cleanup.sql";

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
  assert.match(action, /createVerifiedAdminSession/);
});

test("admin OTP handling accepts the production-generated eight-digit code without hardcoding six digits", () => {
  const action = read("../app/admin-login/actions.ts");
  const page = read("../app/admin-login/page.tsx");
  assert.ok(action.includes("/^\\d{6,10}$/"));
  assert.match(action, /!validEmailOtp\(code\)/);
  assert.ok(page.includes('pattern="[0-9]{6,10}"'));
  assert.ok(page.includes("minLength={6}"));
  assert.ok(page.includes("maxLength={10}"));
  assert.doesNotMatch(page, /pattern="\[0-9\]\{6\}"/);
  assert.match("12345678", /^\d{6,10}$/);
});

test("every Superadmin view requires the separate verified email step-up session", () => {
  const guard = read("../lib/admin/guard.ts");
  const verifiedSession = read("../lib/admin/verified-session.ts");
  assert.match(guard, /hasVerifiedAdminSession/);
  assert.match(guard, /stepup_required/);
  assert.match(verifiedSession, /vx_admin_verified/);
  assert.match(verifiedSession, /httpOnly:\s*true/);
  assert.match(verifiedSession, /sameSite:\s*"strict"/);
  assert.match(verifiedSession, /timingSafeEqual/);
  assert.match(verifiedSession, /admin_verified_sessions/);
});

test("password recovery requires an email recovery OTP and resets all sessions", () => {
  const action = read("../app/admin-login/actions.ts");
  assert.match(action, /purpose:\s*"password_reset"/);
  assert.match(action, /type:\s*"recovery"/);
  assert.match(action, /revokeAllVerifiedAdminSessions/);
  assert.match(action, /scope:\s*"global"/);
  assert.match(action, /password\.length < 16|validPassword/);
});

test("legacy direct magic-link confirmation can no longer create an admin session", () => {
  const confirm = read("../app/admin-confirm/route.ts");
  assert.match(confirm, /legacy_link/);
  assert.doesNotMatch(confirm, /verifyOtp/);
  assert.doesNotMatch(confirm, /token_hash/);
});

test("password-only Supabase sessions do not receive Superadmin database bypasses", () => {
  const migration = read(authMigration);
  assert.match(migration, /revoke execute on function operations\.is_superadmin\(\) from authenticated/i);
  assert.match(migration, /create or replace function operations\.is_org_member/);
  assert.match(migration, /create or replace function operations\.has_org_write/);
  assert.match(migration, /create or replace function operations\.has_org_admin/);
  const hardenedHelpers = migration.slice(migration.indexOf("create or replace function operations.is_org_member"));
  assert.doesNotMatch(hardenedHelpers, /operations\.is_superadmin\(\)/);
  assert.match(migration, /profiles_select_own/);
  assert.match(migration, /m\.role = 'organization_owner'/);
});

test("public signup remains closed while auth challenges and verified sessions are service-role only", () => {
  const identityMigration = read("../../../supabase/migrations/20260814200326_private_superadmin_identity_registry.sql");
  const challengeMigration = read(authMigration);
  assert.match(identityMigration, /vexonyx_block_auth_user_creation_waitlist/);
  assert.match(challengeMigration, /security\.admin_auth_challenges/);
  assert.match(challengeMigration, /security\.admin_verified_sessions/);
  assert.match(challengeMigration, /enable row level security/);
  assert.match(challengeMigration, /revoke all.*authenticated/s);
  assert.match(challengeMigration, /grant select, insert, update, delete.*service_role/s);
  assert.doesNotMatch(challengeMigration, /@div3rsa\.com/i);
});

test("Superadmin logout and password changes revoke the application step-up proof", () => {
  const action = read("../app/admin/actions.ts");
  assert.match(action, /revokeCurrentVerifiedAdminSession/);
  assert.match(action, /revokeAllVerifiedAdminSessions/);
  assert.match(action, /scope:\s*"global"/);
});

test("Superadmin password and reset limits use an atomic service-role-only security bucket", () => {
  const action = read("../app/admin-login/actions.ts");
  const migration = read(hardeningMigration);
  assert.match(action, /consume_admin_auth_rate_limit/);
  assert.match(action, /clear_admin_auth_rate_limit/);
  assert.match(action, /"password_login"/);
  assert.match(action, /"password_reset"/);
  assert.match(migration, /security\.admin_auth_rate_limits/);
  assert.match(migration, /for update/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /revoke all on security\.admin_auth_rate_limits from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function security\.consume_admin_auth_rate_limit.*service_role/is);
});
