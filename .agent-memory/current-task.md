# Current task

Integrate the approved VEXONYX brand mark across the web product and complete the first production SEO/discovery hardening pass.

Status: VERIFIED

Implemented and verified in production on 2026-08-16:

- approved VEXONYX square brand mark is live as the browser/search/app icon at `/icon.png`;
- Apple touch icon is live at `/apple-icon.png`;
- primary marketing pages have unique titles, descriptions and canonical metadata;
- canonical public origin is `https://www.vexonyx.com`, matching Vercel's permanent apex → www redirect;
- Open Graph/Twitter metadata and generated 1200×630 social preview are live;
- `/robots.txt`, `/sitemap.xml` and `/manifest.webmanifest` are live and return 200;
- Organization + WebSite JSON-LD is present on the homepage;
- authenticated workspace and Superadmin surfaces are explicitly noindex/noarchive;
- crawlable footer internal links cover product, use cases, security, pricing, legal and contact;
- the public GitHub README links back to the canonical VEXONYX website;
- optional Google/Bing site-verification environment variables are supported;
- SEO regression tests cover public discovery, private noindex, canonical metadata and redirect-loop prevention.

Verification evidence:

- PR #35: lint, typecheck, Node tests, isolated-parser smoke tests, production build and clean Supabase migration replay/db lint/pgTAP passed after replacing the incompatible generated ICO with the approved PNG icon;
- PR #36: all CI jobs passed and fixed the production canonical-host redirect conflict discovered during live verification;
- production Vercel deployment `dpl_BXsgLzhu2nsYvCpR1Ny9oQ85uBQo` reached READY on main commit `ea5ecf7ef4cb51491241d9ea39609693bfa61572`;
- live apex `https://vexonyx.com/` returns a permanent redirect to `https://www.vexonyx.com/`;
- live `https://www.vexonyx.com/` returns 200 with the expected canonical URL, icon metadata, robots directives, Open Graph/Twitter metadata and JSON-LD;
- live robots, sitemap, manifest and icon endpoints return 200.

External follow-up only: verify the production domain in Google Search Console and Bing Webmaster Tools using the account-owned verification tokens, submit `https://www.vexonyx.com/sitemap.xml`, and build relevant earned/editorial backlinks. Do not use bulk, fake, paid-link-scheme or automated spam backlinks.
