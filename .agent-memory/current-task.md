# Current task

Finalize VEXONYX tax-ready Commerce in PR #29 on branch `agent/tax-ready-commerce-20260815`.

Implemented operationally and in code/database:

- Stripe Tax head office is the verified Diversa Solutions LLC address in Sheridan, Wyoming;
- Stripe Tax default price behavior is exclusive;
- Stripe currently has zero active tax registrations, so collection remains intentionally off;
- subscriptions use `txcd_10105002` only as the verified Stripe AIaaS business-use candidate and remain `pending_confirmation` until human/legal confirmation;
- prepaid credit packs remain `prepaid_usage_review` until their tax point/classification is explicitly confirmed;
- production Supabase is migration-synced through `20260815183221_usage_rls_initplan_optimization`;
- Checkout collects tax IDs plus customer name/address, but only enables `automatic_tax` when local collection is enabled, the catalog item has a confirmed tax code, and Stripe still reports at least one active registration;
- billing webhooks persist subtotal, tax, total, jurisdiction and customer tax identity from Stripe;
- Superadmin `/admin/tax` exposes provider refresh, classification confirmation and a fail-closed tax-collection gate;
- no code path automatically creates Stripe Tax registrations.

Exact next action: pass final PR #29 app CI and clean Supabase migration replay/db lint/pgTAP, merge only if green, then verify the production Vercel deployment and `/ready`.

External launch gates remain: Vercel production still needs the Stripe secret and webhook signing secret before checkout can be considered live. Do not create a Stripe webhook endpoint unless its signing secret can be stored in Vercel immediately. Do not create tax registrations or confirm tax classifications without the required human/legal decision. GPU/model/tool execution remains fail-closed until the separate 4× H200 rollout gates pass.
