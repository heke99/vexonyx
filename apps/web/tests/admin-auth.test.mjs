import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("admin magic-link access resolves identity from private database configuration", () => {
  const action = read("../app/admin-login/actions.ts");
  assert.match(action, /vexonyx_is_superadmin_email/);
  assert.doesNotMatch(action, /const\s+ADMIN_EMAIL\s*=/);
  assert.doesNotMatch(action, /@div3rsa\.com/i);
  assert.doesNotMatch(action, /info@vexonyx\.com/i);
});

test("public signup remains closed while operator bootstrap uses a private registry", () => {
  const migration = read("../../../supabase/migrations/20260814200326_private_superadmin_identity_registry.sql");
  assert.match(migration, /security\.superadmin_identities/);
  assert.match(migration, /vexonyx_block_auth_user_creation_waitlist/);
  assert.match(migration, /vexonyx_promote_operator_superadmin/);
  assert.doesNotMatch(migration, /@div3rsa\.com/i);
});
