# Handover

Current branch: `agent/commerce-catalog-user-usage-20260815`, PR #28.

Do not recreate the V1 Stripe catalog: the approved live subscription and top-up products already exist and the production Supabase catalog is provider-synced. Provider IDs are operational environment state and must not be hardcoded into generic replay migrations.

The production DB migration head is `20260815171231_user_credit_monthly`, following `20260815170114_user_usage_monthly`. Together they provide self-scoped per-user monthly resource usage and credit-consumption aggregation. The customer Usage page must remain personal to the signed-in user; shared workspace credit balance may be shown separately. Billing plan cards show included monthly credits. Credit-pack webhooks must derive the grant from the authoritative server catalog and reject amount/currency mismatch.

The functional PR #28 change set passed full app CI and clean migration replay/db lint/pgTAP before final production-migration alignment. Exact next action is final CI on the exact production-aligned head, merge only if green, then verify Vercel production and live catalog state.

Do not claim checkout is live unless Vercel's Stripe runtime configuration and webhook secret are verified. Do not enable automatic Stripe Tax collection until registrations and product classification are verified. Do not activate GPU/model/tool execution; the five model aliases remain intentionally disabled and the separate 4× H200 rollout requires model pinning, benchmarks, canaries and rollback verification.
