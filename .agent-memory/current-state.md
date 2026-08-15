# Current state — 2026-08-15

VEXONYX is in the pre-GPU production phase. The customer platform, Superadmin, tenant/RLS foundation, projects/files/reports/findings/agents shell, billing/credits/usage architecture, isolated parsing, background workers, report rendering, operational canaries and waitlist flow are implemented. Production runs on Vercel with Supabase as the current PostgreSQL platform. GPU inference, real model deployments and external offensive-tool execution remain intentionally fail-closed.

## Commerce catalog

The approved V1 commercial catalog is live in the connected Stripe account and synchronized into the production Supabase billing catalog.

Subscriptions:

- Starter: $15/month, 385 credits/month
- Pro: $29/month, 750 credits/month
- Operator: $115/month, 3,025 credits/month
- Max: $200/month, 5,320 credits/month

One-time credit packs:

- $10: 235 credits
- $25: 606 credits
- $50: 1,237 credits
- $100: 2,500 credits

Prices are tax-exclusive. Customer Billing states that applicable sales tax/VAT/GST may be added and payment history can display provider-derived subtotal, tax and total separately.

## Tax readiness

Stripe Tax infrastructure is configured with Diversa Solutions LLC's verified head office at 30 North Gould Street, Sheridan, Wyoming 82801, US. The Stripe Tax default behavior is `exclusive`. Stripe currently reports zero active tax registrations, so collection remains disabled.

Production migrations `20260815182411_tax_ready_commerce` and `20260815182858_tax_candidate_defaults` add tax-aware catalog fields, service-role-only `billing.tax_settings`, billing-customer tax identity, subscription tax state and immutable transaction snapshots for subtotal/tax/total/jurisdiction.

The canonical Stripe candidate recorded for VEXONYX is `txcd_10105002` (Artificial Intelligence as a Service, cloud-based, business use). It is deliberately only a candidate: active subscription plans remain `pending_confirmation` with `tax_code = null`. Prepaid credit packs remain `prepaid_usage_review` with `tax_code = null` until their tax point/treatment is explicitly confirmed.

Checkout collects customer tax IDs and updates Stripe customer name/address. `automatic_tax` is only added when VEXONYX collection is enabled, the selected catalog item has a confirmed tax code, and a fresh provider call still shows at least one active Stripe Tax registration. If the provider registration disappears, Checkout fails closed and clears the local collection flag.

Billing webhooks persist Stripe-derived subtotal, tax, total, tax status/location and billing/tax identity. Credit packs continue to resolve credits and pre-tax catalog amount from the authoritative server-side catalog. Superadmin `/admin/tax` provides provider refresh, human tax-code confirmation and a fail-closed collection toggle. There is no code path that automatically creates a Stripe Tax registration.

## Personal usage

Production migrations `20260815170114_user_usage_monthly` and `20260815171231_user_credit_monthly` provide per-user monthly resource usage and credit-consumption aggregates. Migration `20260815183221_usage_rls_initplan_optimization` keeps the same self-only + organization membership boundary while changing `auth.uid()` evaluation to an init-plan-friendly form for better scale.

## External launch gates

Vercel production still requires `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` before checkout can be considered live. Stripe currently has no webhook endpoint; do not create one unless its generated signing secret can be stored in Vercel immediately. Tax collection must remain off until legal/accounting confirmation of the catalog classification and an actual jurisdiction registration exist.

## AI/model state

Five aliases exist: `vexonyx-small`, `vexonyx-general`, `vexonyx-security`, `vexonyx-reasoning` and `vexonyx-embedding`. Routing rules use Small for metadata, General for normal chat/code/reporting, Security for security workflows/finding validation, and Reasoning as escalation. Model aliases remain disabled and there are no model versions or model deployments in production. The planned physical GPU rollout uses 4× H200, but no GPU deployment should be marked live until model pinning, benchmark, routing, load, canary and rollback gates pass.

## Verification

Tax-ready Commerce is PR #29 on `agent/tax-ready-commerce-20260815`. Lint and typecheck passed on the first CI attempt; a regression-test regex was corrected before final verification. The exact final head must pass Node tests, isolated-parser smoke tests, production build and clean Supabase migration replay/db lint/pgTAP before merge.
