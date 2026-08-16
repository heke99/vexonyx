import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("public signup stays waitlist-only while existing customers can sign in", () => {
  const loginPage = read("../app/login/page.tsx");
  const signupPage = read("../app/signup/page.tsx");
  const loginAction = read("../app/login/actions.ts");
  const signupAction = read("../app/signup/actions.ts");
  const proxy = read("../proxy.ts");
  assert.match(signupPage, /waitlist/i);
  assert.match(signupAction, /waitlist/i);
  assert.doesNotMatch(signupAction, /auth\.signUp/);
  assert.match(loginPage, /Existing beta customers|CUSTOMER ACCESS/i);
  assert.match(loginAction, /signInWithPassword/);
  assert.match(proxy, /path === "\/signup"/);
  assert.match(proxy, /url\.pathname = "\/waitlist"/);
  assert.match(proxy, /path\.startsWith\("\/app"\).*claims/s);
});

test("team invitation access is explicit rather than public signup", () => {
  const route = read("../app/api/v1/team/invitations/route.ts");
  const inviteAction = read("../app/invite/[id]/actions.ts");
  const invitePage = read("../app/invite/[id]/page.tsx");
  assert.match(route, /create_organization_invitation/);
  assert.match(route, /sendOrganizationInvitation/);
  assert.match(inviteAction, /accept_organization_invitation/);
  assert.match(invitePage, /exact email address|invited email address/i);
  assert.doesNotMatch(inviteAction, /auth\.signUp/);
});

test("marketing navigation exposes waitlist but not login", () => {
  const header = read("../components/marketing-header.tsx");
  assert.match(header, /Join waitlist/);
  assert.doesNotMatch(header, /href="\/login"/);
});

test("legal and email surfaces identify the operator", () => {
  const files = [read("../app/privacy/page.tsx"),read("../app/terms/page.tsx"),read("../app/cookies/page.tsx"),read("../app/contact/page.tsx"),read("../lib/email/templates.ts")];
  for (const source of files) { assert.match(source, /Diversa Solutions LLC/); assert.match(source, /info@vexonyx\.com/); }
});
