import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("SEO exposes canonical public discovery files and keeps private surfaces out", () => {
  const robots = read("../app/robots.ts");
  const sitemap = read("../app/sitemap.ts");
  const layout = read("../app/layout.tsx");

  assert.match(robots, /sitemap\.xml/);
  for (const blocked of ["/admin/", "/app/", "/api/", "/auth/", "/ready"]) {
    assert.ok(robots.includes(`\"${blocked}\"`), `robots must block ${blocked}`);
  }
  for (const publicPath of ["/product", "/agents", "/use-cases", "/security", "/pricing", "/waitlist"]) {
    assert.ok(sitemap.includes(`path: \"${publicPath}\"`), `sitemap must include ${publicPath}`);
  }
  assert.doesNotMatch(sitemap, /path:\s*"\/app/);
  assert.match(layout, /NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION/);
  assert.match(layout, /max-image-preview/);
});

test("brand icon is used in the website chrome and private layouts are noindex", () => {
  const brand = read("../components/brand.tsx");
  const workspace = read("../app/app/layout.tsx");
  const admin = read("../app/admin/layout.tsx");

  assert.match(brand, /\/icon\.png/);
  assert.match(workspace, /index:\s*false/);
  assert.match(admin, /index:\s*false/);
});

test("primary marketing pages have unique canonical metadata", () => {
  const seo = read("../lib/seo.ts");
  const home = read("../app/page.tsx");
  const product = read("../app/product/page.tsx");
  const agents = read("../app/agents/page.tsx");
  const useCases = read("../app/use-cases/page.tsx");

  assert.match(seo, /alternates:\s*\{ canonical \}/);
  assert.match(home, /createPageMetadata/);
  assert.match(product, /AI Pentesting Platform/);
  assert.match(agents, /AI Security Agents/);
  assert.match(useCases, /AI Cybersecurity Use Cases/);
});
