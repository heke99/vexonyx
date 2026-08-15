# Current state — 2026-08-15

VEXONYX is in the pre-GPU production phase. The customer platform, Superadmin, tenant/RLS foundation, projects/files/reports/findings/agents shell, billing/credits/usage architecture, isolated parsing, background workers, report rendering, operational canaries and waitlist flow are implemented. Production runs on Vercel with Supabase as the current PostgreSQL platform. GPU inference, real model deployments and external offensive-tool execution remain intentionally fail-closed.

## Commerce

The approved V1 commercial catalog has been created in the connected live Stripe account and synchronized into the production Supabase billing catalog without hardcoding provider IDs into replay migrations.

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

The production database stores plans, prices, monthly credit entitlements and credit products as provider-synced catalog state. Checkout remains fail-closed unless the Vercel runtime has the required Stripe secret and webhook configuration. Automatic Stripe Tax collection is not enabled by this work; tax registrations and product tax treatment must be verified first.

## Personal usage

Production migration `20260815142905_user_usage_monthly` adds per-user monthly usage aggregates. The table is RLS-protected so authenticated reads require both the current `auth.uid()` and organization membership. A trigger aggregates new `usage.usage_events`, and historical user-attributed usage is backfilled. Customer `/app/usage` is being updated in PR #28 to show the signed-in user's own usage and monthly credit consumption, while the workspace credit balance remains pooled.

## Billing integrity

Customer Billing reads only active, public, provider-synced offers and now shows the included monthly credits for each plan. Credit-pack webhook grants are being hardened to resolve credits, amount and currency from the authoritative server-side `billing.credit_products` catalog before crediting the ledger. Subscription monthly credits continue to be granted from `billing.plan_entitlements` on successful paid invoices with idempotency protection.

## AI/model state

Five aliases exist: `vexonyx-small`, `vexonyx-general`, `vexonyx-security`, `vexonyx-reasoning` and `vexonyx-embedding`. Routing rules use Small for metadata, General for normal chat/code/reporting, Security for security workflows/finding validation, and Reasoning as escalation. Model aliases remain disabled and there are no model versions or model deployments in production. The planned physical GPU rollout uses 4× H200, but no GPU deployment should be marked live until model pinning, benchmark, routing, load, canary and rollback gates pass.

## Verification

PR #28 functional changes passed lint, typecheck, Node tests, isolated-parser smoke tests, production build and clean Supabase migration replay/db lint/pgTAP in CI run 614. Memory checkpoint commits follow that successful functional run and require one final CI pass before merge.
