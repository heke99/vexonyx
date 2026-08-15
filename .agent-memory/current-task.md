# Current task

Finalize the VEXONYX V1 commerce and personal-usage launch layer.

Current work is PR #28 on branch `agent/commerce-catalog-user-usage-20260815`:

- the approved live Stripe subscription and credit-pack catalog has been created operationally;
- the matching Supabase billing catalog is active, public and provider-synced;
- per-user monthly usage aggregation with self-only RLS is applied in production and versioned as migration `20260815142905_user_usage_monthly`;
- customer Billing shows monthly included credits;
- credit-pack webhook grants are validated against the authoritative server-side catalog;
- app CI and clean migration replay passed on the functional change set.

Exact next action: run final CI after this memory checkpoint, merge PR #28 only if green, verify the production Vercel deployment and `/ready`, and confirm the live Stripe/Supabase catalog remains consistent.

Do not enable GPU inference, external tool execution, automatic Stripe Tax collection, or tax registrations as part of this task. GPU/model execution remains fail-closed until the separate GPU rollout and benchmarks are performed. Stripe Tax collection must follow verified tax registrations and product tax classification.
