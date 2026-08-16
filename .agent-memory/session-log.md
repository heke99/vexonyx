# Session log

## 2026-08-14

- Inventoried the initial VEXONYX repository and active Supabase project.
- Applied normalized tenant/security/artifact/AI/reports/usage/operations/waitlist foundations.
- Built the first marketing/app/admin UI, mock-inference architecture, CI, ADRs and runbooks.

## 2026-08-16 — AI policy/agent control plane

- Read the approved VEXONYX master architecture and reconciled it against existing `ai.agent_runs`, checkpoints, engagements, scope checks, sandbox jobs and model registry instead of creating a parallel architecture.
- Created isolated branch `agent/ai-policy-control-plane-20260816` and PR #37.
- Added production migrations `20260816115605`, `20260816120040` and `20260816120604`.
- Added structured versioned Policy Engine, assignments/exceptions/decisions/audit, agent profiles/versions, tool/model preferences, model entitlements, user model preferences, memory trust metadata, learning candidates, agent evals and rollout metadata.
- Preserved immutable tool preflight checks and inserted policy evaluation after authorization/target scope; policy cannot bypass hard platform checks.
- Added a cross-tenant agent-profile database guard.
- Seeded 7 agent profiles and 8 tool definitions while keeping all tool definitions disabled.
- Added Pentesting Professional default policy and locked Platform Enforcement definition.
- Added safe model catalog RPC so only enabled + entitled aliases can be user-selected.
- Built Superadmin AI Control Center, Policy Center, no-execution Policy Simulator, Agent Profiles, Tools, Model Router and supporting Memory/Learning/Evaluation/Rollout/Engagement/Sandbox views.
- Added user agent selection plus VEXONYX Auto/Fast/Pro/Deep and gated specific-model selection.
- Hardened the AI API so profile and specific-model access are verified server-side and persisted per conversation/run/generation.
- Ran live pgtap-equivalent policy tests, Supabase security/performance advisors and final fail-closed state queries.
- Fixed every new missing-FK-index finding from the control plane. Left old unused-index notices unchanged pending workload evidence.
- Corrected migration filenames to exactly match Supabase production migration history, preventing duplicate replay.
- First app CI exposed two TypeScript issues in the Policy Simulator and model-mode label. Fixed both; subsequent app CI passed lint, typecheck, Node tests, parser safety smoke and production build.
- Clean migration replay passed database reset, database lint and pgTAP.
- Confirmed final pre-GPU live state before merge: 5 models/0 enabled, 8 tools/0 enabled, 7 enabled agent profiles, 3 policy sets, external tools OFF, sandbox scheduling OFF and external network OFF.