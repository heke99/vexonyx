# Current task

Integrate the approved VEXONYX brand mark across the web product and complete the first production SEO/discovery hardening pass.

Status: IMPLEMENTED_NOT_VERIFIED

Implemented on `agent/brand-seo-20260816`:

- exact VEXONYX favicon derived from the approved logo and used by website chrome;
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

The previous tax/checkout work recorded here was completed and subsequently superseded by merged main-branch work through PR #34 before this task began.

Exact next action: commit the complete SEO/brand tree, open a PR, pass lint/typecheck/tests/build and Vercel preview verification, then merge only if green and verify production `/favicon.ico`, `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`, canonical redirect and homepage metadata.

External follow-up after production verification: add the production domain to Google Search Console/Bing Webmaster Tools, store their public verification tokens in Vercel if required, submit `https://vexonyx.com/sitemap.xml`, and pursue only relevant earned/editorial backlinks rather than link-scheme or bulk-link tactics.
