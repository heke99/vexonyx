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

Production migrations `20260815170114_user_usage_monthly` and `20260815171231_user_credit_monthly` provide per-user monthly resource usage and credit-consumption aggregates. Both tables are RLS-protected so authenticated reads require the current `auth.uid()` and organization membership. Triggers aggregate new usage events and negative usage credit-ledger entries, and historical user-attributed records are backfilled. Customer `/app/usage` reads the aggregates rather than scanning raw monthly ledgers, while the workspace credit balance remains pooled.

## Billing integrity

Customer Billing reads only active, public, provider-synced offers and shows the included monthly credits for each plan. Credit-pack webhook grants resolve credits, amount and currency from the authoritative server-side `billing.credit_products` catalog before crediting the ledger. Subscription monthly credits continue to be granted from `billing.plan_entitlements` on successful paid invoices with idempotency protection.

## AI/model state

Five aliases exist: `vexonyx-small`, `vexonyx-general`, `vexonyx-security`, `vexonyx-reasoning` and `vexonyx-embedding`. Routing rules use Small for metadata, General for normal chat/code/reporting, Security for security workflows/finding validation, and Reasoning as escalation. Model aliases remain disabled and there are no model versions or model deployments in production. The planned physical GPU rollout uses 4× H200, but no GPU deployment should be marked live until model pinning, benchmark, routing, load, canary and rollback gates pass.

## Verification

The functional PR #28 change set passed lint, typecheck, Node tests, isolated-parser smoke tests, production build and clean Supabase migration replay/db lint/pgTAP before the final production-migration alignment. The exact production-aligned head must pass one final CI run before merge.
