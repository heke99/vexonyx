# Current task

Integrate the approved VEXONYX brand mark across the web product and complete the first production SEO/discovery hardening pass.

Status: IN_PROGRESS

Implemented on `agent/brand-seo-20260816`:

- exact VEXONYX square brand mark prepared from the approved logo for browser/search/app surfaces;
- Apple touch icon for branded saved-site/mobile surfaces;
- canonical `https://vexonyx.com` SEO helper and unique canonical metadata for primary marketing pages;
- richer Open Graph/Twitter metadata and generated social preview image;
- `robots.txt`, `sitemap.xml` and web manifest metadata routes;
- Organization + WebSite JSON-LD on the homepage;
- noindex/noarchive metadata for authenticated workspace and Superadmin surfaces;
- permanent `www.vexonyx.com` to apex canonical redirect;
- stronger crawlable footer internal links;
- official website backlink from the public GitHub README;
- optional Google/Bing ownership-verification environment variables;
- SEO regression tests.

Verification checkpoint:

- lint: VERIFIED on first PR #35 CI attempt;
- typecheck: VERIFIED on first PR #35 CI attempt;
- Node tests: VERIFIED, including the SEO regression suite;
- isolated parser smoke: VERIFIED;
- first production build: FAILED only because Next/Turbopack rejected the generated multi-size ICO decoder format;
- corrective action: remove the ICO and use the exact approved square mark as Next App Router `icon.png` instead. This keeps a standard square PNG favicon/search icon while avoiding the decoder incompatibility.

The previous tax/checkout work recorded here was completed and subsequently superseded by merged main-branch work through PR #34 before this task began.

Exact next action: push the PNG icon correction, rerun PR #35 CI, verify the Vercel preview, merge only if green, then verify production `/icon.png`, `/apple-icon.png`, `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`, canonical redirect and homepage metadata.

External follow-up after production verification: add the production domain to Google Search Console/Bing Webmaster Tools, store their public verification tokens in Vercel if required, submit `https://vexonyx.com/sitemap.xml`, and pursue only relevant earned/editorial backlinks rather than link-scheme or bulk-link tactics.
