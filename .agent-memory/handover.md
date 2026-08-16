# Handover

The VEXONYX pre-GPU AI control-plane implementation is PR #37 from `agent/ai-policy-control-plane-20260816` into `main`.

Do not recreate the existing Agent Runtime, model registry, security engagements, authorization/scope checks, sandbox jobs, operations kill switches or billing/usage foundation. This work extends those systems with the approved Policy/Agent/Tool/Learning structure.

Production Supabase already contains migrations:

- `20260816115605_ai_policy_agent_control_plane`
- `20260816120040_ai_model_catalog_and_internal_deny`
- `20260816120604_ai_policy_control_plane_fk_indexes`

The product now has a versioned Policy Engine, agent profiles, tool capability assignments, model preferences/entitlements, user routing modes, memory trust metadata, controlled-learning candidates, evaluations and rollout metadata. Superadmin has AI Control Center, Policy Center/Simulator, Agent Profiles, Tools and Model Router. Users can choose an agent and VEXONYX Auto/Fast/Pro/Deep; a specific alias appears only when it is enabled and explicitly entitled.

Critical security invariant: editable policy is not the outer security boundary. `operations.tool_preflight` still checks incident/system state, kill switches, project/run/engagement binding, authorization/target scope, network state, tool state and approval. Policy evaluation is layered after these hard checks and cannot expand an unauthorized or out-of-scope operation. Cross-tenant agent-profile references are rejected at the database boundary.

Critical pre-GPU invariant: do not enable private model inference, external tools, sandbox scheduling or external network just because UI/control tables now exist. Live verification before merge showed 0 enabled models and 0 enabled tool definitions, with external tools, sandbox scheduling and external network all OFF.

Learning is candidate-only. Production runs must never directly rewrite global memory, prompts, routing, policies or model weights. Promotion requires evaluated evidence and then shadow/canary/rollback control.

CI evidence before the memory checkpoint: migration replay passed clean reset/lint/pgTAP; app lint/typecheck/tests/parser smoke/production build passed after two targeted TypeScript fixes. Re-run CI on this checkpoint commit before merge.

Supabase Advisor has no new AI/policy missing-FK-index warnings. Two existing security warnings remain outside this work: `pg_net` installed in public and leaked-password protection disabled. Older service-only RLS-with-no-policy INFO notices also remain; do not broaden client access merely to silence INFO messages.

Exact delivery action: obtain green CI for this checkpoint commit, merge PR #37, then verify the new Vercel production deployment (`vexonyx`, Div3rsa team), `/ready`/public reachability and production runtime errors. If deployment verification is green, the next engineering milestone is provider/GPU readiness behind the already-built model/router interface—not another product/control-plane rewrite.