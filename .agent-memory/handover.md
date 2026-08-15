# Handover

Current branch: `agent/tax-ready-commerce-20260815`, PR #29.

Do not recreate the V1 Stripe catalog. The live subscriptions and credit packs already exist and the production Supabase catalog is provider-synced. Stripe Tax is active as infrastructure with the verified Diversa Solutions LLC head office in Sheridan, Wyoming and default tax behavior `exclusive`.

Stripe currently reports zero active tax registrations. Therefore `billing.tax_settings.automatic_collection_enabled` must remain false. No code path creates registrations automatically. A Stripe registration should only be recorded after the business has actually registered with the relevant tax authority.

The canonical Stripe candidate for VEXONYX subscriptions is `txcd_10105002` (AIaaS, cloud-based, business use), but the live products intentionally do not have a confirmed Product tax code yet. Plans remain `pending_confirmation`. Credit packs remain `prepaid_usage_review` because the tax point/treatment of restricted prepaid usage requires separate confirmation.

Production database migration head is `20260815183221_usage_rls_initplan_optimization`, after `20260815182411_tax_ready_commerce` and `20260815182858_tax_candidate_defaults`. Checkout collects tax IDs and customer name/address. Automatic tax is added only after a confirmed tax code, an enabled local collection flag and a fresh live Stripe registration check. Webhooks persist authoritative subtotal/tax/total/location/tax identity snapshots. Superadmin controls live at `/admin/tax` and are fail-closed.

Exact next action: obtain a fully green PR #29 run including app build and clean Supabase migration replay/db lint/pgTAP, merge only then, and verify the resulting Vercel production deployment plus `/ready`.

Do not claim checkout is live: Vercel still needs `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, and Stripe currently has no webhook endpoint. Do not create the endpoint unless its generated signing secret can be stored in Vercel immediately. GPU/model/tool execution remains intentionally disabled pending the separate 4× H200 rollout.
