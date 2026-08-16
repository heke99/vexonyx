# Current state — 2026-08-16

VEXONYX is in the pre-GPU production phase. Vercel hosts the web product and Supabase is the current PostgreSQL platform. The customer platform, Superadmin, tenant/RLS foundation, projects/files/reports/findings, billing/credits/usage, isolated parsing, background jobs, operational canaries, waitlist, legal/SEO and the first AI control-plane layer are implemented.

## AI control plane

The pre-GPU architecture now separates model infrastructure from the product. The database and web app have versioned control-plane contracts for models, agent profiles, tools, policies, memory metadata, evaluations, controlled-learning candidates and rollouts.

Production Supabase migrations:

- `20260816115605_ai_policy_agent_control_plane`
- `20260816120040_ai_model_catalog_and_internal_deny`
- `20260816120604_ai_policy_control_plane_fk_indexes`

Implemented:

- `policies.*` versioned policy sets, versions, rules, assignments, exceptions, decisions and change logs;
- deterministic policy hierarchy across global, plan, organization, workspace, agent and run scopes;
- immutable platform/tool preflight remains below editable policy controls;
- versioned `ai.agent_profiles`, profile versions, tool assignments and model preferences;
- plan/organization model entitlements and self-owned user model preference;
- conversation/run model selection modes: Auto, Fast, Pro, Deep and specific eligible alias;
- memory trust, sensitivity, instruction-authority and expiry metadata;
- controlled-learning candidates, agent evaluations and rollout/canary metadata;
- engagement network posture, allowed-technique and out-of-scope metadata;
- safe user model catalog RPC that returns only enabled + entitled aliases;
- cross-tenant agent-profile database guard;
- policy-aware `operations.tool_preflight` while preserving incident, kill-switch, project, run/engagement, authorization, target-scope, approval and sandbox gates;
- covering indexes for every new foreign key identified by Supabase Advisor.

Seeded configuration:

- 5 internal model aliases remain registered but disabled;
- 7 versioned platform agent profiles are available as configuration;
- 8 tool capability definitions exist, all disabled;
- `Pentesting Professional` is the default global editable policy;
- `VEXONYX Platform Enforcement` is locked and documents platform boundaries that remain technically enforced below the policy layer;
- `Image Safe Mode` is a reusable template and is not globally assigned.

Current production fail-closed state is intentionally unchanged:

- `agents_enabled = true` for orchestration/previews;
- `external_tools_enabled = false`;
- `sandbox_scheduling_enabled = false`;
- `external_network_enabled = false`;
- enabled model aliases = 0;
- enabled tool definitions = 0.

The user workspace now exposes versioned agent selection and VEXONYX Auto/Fast/Pro/Deep selection. Specific model aliases only appear when both model readiness and plan/organization entitlement allow them. The AI API verifies the profile and specific model server-side; it does not trust client JSON.

Superadmin now has AI Control Center, Policy Center, no-execution Policy Simulator, Agent Profiles, Tools, Model Router, Memory, Learning, Evaluations, Canary/Rollback, Deployments, Engagements and Sandboxes surfaces. Model enablement requires a validated version and healthy deployment. Tool enablement does not bypass platform, sandbox, network, scope or approval gates.

The Learning layer is candidate-based only. Production runs do not directly rewrite prompts, policies, routes or model weights. Improvements must move through evidence/evaluation and shadow/canary/rollback metadata before promotion.

## Commerce and tax

The V1 Stripe catalog and Supabase billing catalog remain in place: Starter, Pro, Operator and Max subscriptions plus prepaid credit packs. Tax behavior is exclusive. Tax collection remains fail-closed until a confirmed product tax code and an actual Stripe Tax registration exist. Vercel still requires the production Stripe secret/webhook configuration before checkout can be considered fully live.

## Security and advisors

New AI/policy tables have RLS and explicit client-deny boundaries where appropriate. The new control-plane foreign keys are indexed. Supabase Advisor currently reports no new AI/policy unindexed-foreign-key findings. Remaining security warnings are pre-existing: `pg_net` is installed in `public`, and leaked-password protection is disabled. Existing service-only RLS-with-no-policy informational notices remain on older internal tables.

## Verification status

PR #37 (`agent/ai-policy-control-plane-20260816`) is the implementation vehicle. Live Supabase migrations were applied and migration filenames were aligned exactly to production history. A clean CI migration replay has passed `db reset`, database lint and pgTAP for this migration set. App CI after the TypeScript corrections has passed lint, typecheck, Node tests, isolated-parser safety smoke tests and production build. Final merge/deployment verification is the remaining delivery step; do not enable GPU inference, external tools, sandbox scheduling or external network as part of that step.