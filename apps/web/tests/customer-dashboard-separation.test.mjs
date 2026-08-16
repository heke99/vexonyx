import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), "utf8");

test("authenticated app uses the customer shell instead of the admin shell", () => {
  const layout = read("../app/app/layout.tsx");
  assert.match(layout, /CustomerAppShell/);
  assert.doesNotMatch(layout, /admin-shell|admin-sidebar|requireSuperadmin/);
});

test("superadmin user preview renders outside the admin route tree", () => {
  const legacy = read("../app/admin/users/[userId]/preview/page.tsx");
  const preview = read("../app/preview/users/[userId]/page.tsx");
  const actions = read("../app/admin/user-preview-actions.ts");
  assert.match(legacy, /redirect\(`\/preview\/users\/\$\{userId\}`\)/);
  assert.match(preview, /CustomerAppShell/);
  assert.match(preview, /WorkspaceDashboard/);
  assert.doesNotMatch(preview, /admin-shell|admin-sidebar|admin-topbar/);
  assert.match(actions, /ADMIN_PREVIEW_COOKIE_PATH/);
  assert.match(actions, /redirect\(`\/preview\/users\/\$\{targetUserId\}`\)/);
});

test("customer dashboard is product-oriented and not a superadmin command center", () => {
  const dashboard = read("../components/workspace-dashboard.tsx");
  assert.match(dashboard, /What do you want VEXONYX to work on\?/);
  assert.match(dashboard, /Start a chat/);
  assert.match(dashboard, /New assessment/);
  assert.match(dashboard, /Analyze files/);
  assert.doesNotMatch(dashboard, /Command center|SUPERADMIN|Runtime status|Product workspace ready/);
});

test("preview routes stay on the privileged admin host", () => {
  const proxy = read("../proxy.ts");
  assert.match(proxy, /path\.startsWith\("\/preview"\)/);
  assert.match(proxy, /"\/preview\/:path\*"/);
});
