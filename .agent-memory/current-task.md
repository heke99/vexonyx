# Current task

Build and verify the VEXONYX pre-GPU AI policy, agent, tool and model control-plane structure defined in the approved master specification.

Status: IMPLEMENTED / FINAL DELIVERY VERIFICATION

Implemented on `agent/ai-policy-control-plane-20260816`, PR #37:

- versioned structured Policy Engine and assignment hierarchy;
- immutable platform enforcement kept below Superadmin-editable policies;
- Superadmin AI Control Center, Policy Center, Policy Simulator, Agent Profiles, Tools and Model Router;
- versioned agent profiles with model/tool preferences and rollback-ready versions;
- user agent selection plus VEXONYX Auto/Fast/Pro/Deep and gated specific-model selection;
- server-side model entitlement and agent-profile validation;
- memory trust/sensitivity/instruction-authority metadata;
- controlled learning candidates, evals and canary/rollback metadata;
- engagement network/technique metadata;
- policy-aware tool preflight layered after authorization/scope and other immutable checks;
- pgtap coverage and foreign-key index coverage.

Production Supabase migration head for this work is `20260816120604_ai_policy_control_plane_fk_indexes` after `20260816115605_ai_policy_agent_control_plane` and `20260816120040_ai_model_catalog_and_internal_deny`.

Verification completed before final merge:

- migrations applied successfully to live VEXONYX Supabase;
- live state confirms 0 enabled models, 0 enabled tools, external tools OFF, sandbox scheduling OFF and external network OFF;
- Supabase performance advisor has no new unindexed FK findings from this work;
- Supabase security advisor has no new AI/policy warnings from this work;
- clean CI migration replay passed db reset, database lint and pgTAP;
- corrected app head passed lint, typecheck, Node tests, isolated parser smoke tests and production build.

Exact remaining delivery action: obtain green CI on the memory/checkpoint commit, merge PR #37 to `main`, then verify the resulting Vercel production deployment and runtime health. Do not turn on GPU/model inference, external tools, sandbox scheduling or external network during deployment verification.