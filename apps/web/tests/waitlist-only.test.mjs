import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("public authentication routes are waitlist-only", () => {
  const loginPage = read("../app/login/page.tsx");
  const signupPage = read("../app/signup/page.tsx");
  const loginAction = read("../app/login/actions.ts");
  const signupAction = read("../app/signup/actions.ts");
  const authConfirm = read("../app/auth/confirm/route.ts");
  const invitePage = read("../app/invite/[id]/page.tsx");
  for (const source of [loginPage, signupPage, loginAction, signupAction, authConfirm, invitePage]) {
    assert.match(source, /waitlist/i);
  }
  assert.doesNotMatch(loginAction, /signInWithPassword/);
  assert.doesNotMatch(signupAction, /auth\.signUp/);
});

test("marketing navigation exposes waitlist but not login", () => {
  const header = read("../components/marketing-header.tsx");
  assert.match(header, /Join waitlist/);
  assert.doesNotMatch(header, /href="\/login"/);
});

test("legal and email surfaces identify the operator", () => {
  const files = [
    read("../app/privacy/page.tsx"),
    read("../app/terms/page.tsx"),
    read("../app/cookies/page.tsx"),
    read("../app/contact/page.tsx"),
    read("../lib/email/templates.ts"),
  ];
  for (const source of files) {
    assert.match(source, /Diversa Solutions LLC/);
    assert.match(source, /info@vexonyx\.com/);
  }
});
