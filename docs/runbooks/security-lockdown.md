# Security lockdown runbook

1. Superadmin changes incident mode to `security_lockdown`.
2. Control plane disables external tools, sandbox scheduling and external network execution.
3. Workers stop claiming new external jobs and drain/cancel according to execution policy.
4. Tenant project/evidence read paths remain available where safe.
5. Preserve audit evidence and investigate root cause.
6. Re-enable execution only after authorization, queue and worker state are reconciled.
