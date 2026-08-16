# Work plan

1. Foundation + tenant security — implemented and continuously regression-tested.
2. Marketing + waitlist + legal + SEO — implemented and production verified.
3. Workspace domain — projects, files, conversations, findings, reports and commerce foundation implemented; continue product-depth/E2E expansion as features mature.
4. Pre-GPU AI control plane — implemented: model registry, user routing modes, versioned agent profiles, Policy Engine, tool capability registry, memory trust metadata, learning candidates, evals, canary/rollback metadata and Superadmin controls.
5. Retrieval/knowledge — continue quarantine-safe ingestion, chunking, embeddings and tenant-bound retrieval; external content must stay untrusted and instruction-isolated.
6. Model readiness — verify exact source/license/revision/runtime artifacts for small/general/security/reasoning models, benchmark them and register validated versions/deployments. Do not expose specific aliases until enabled + entitled.
7. Sandbox/tool execution — build/verify worker scheduler, ephemeral isolation, scoped egress, short-lived secrets and teardown. Only then enable individual tool definitions and platform gates in controlled canaries.
8. GPU provider integration — add a provider adapter/scheduler/inference runtime behind the existing Model Registry/Router. Product code must not call a GPU endpoint directly.
9. Controlled learning — connect telemetry/outcomes to candidate generation, eval suites, shadow/canary promotion and rollback. Direct production self-modification stays prohibited.
10. Load, DR/restore, security review and full E2E — required before broad beta/production enablement of private inference or autonomous external execution.