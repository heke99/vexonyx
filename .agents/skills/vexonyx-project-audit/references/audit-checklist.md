# VEXONYX full-project audit coverage

Use this as a coverage matrix, not as a substitute for tracing real flows.

## Platform boundaries

- [ ] Public marketing/waitlist surfaces
- [ ] Authentication/session lifecycle
- [ ] Organization/workspace membership
- [ ] Superadmin separation
- [ ] Projects/conversations/messages
- [ ] Files/artifacts/parser pipeline
- [ ] Agent orchestration/tool execution
- [ ] Model gateway/routing/entitlements
- [ ] Memory/RAG/context isolation
- [ ] Sandboxes/network egress
- [ ] Findings/reports/evidence
- [ ] Usage/credits/billing/subscriptions
- [ ] API clients/keys/integrations/webhooks
- [ ] Workers/queues/leases/retries
- [ ] Audit/logging/observability
- [ ] Supabase schema/RLS/functions
- [ ] GitHub Actions/build/deploy/supply chain

## Security invariants

- [ ] Anonymous callers cannot reach privileged operations
- [ ] Authentication does not imply authorization
- [ ] Every tenant-owned resource has a provable ownership chain
- [ ] Other-user and cross-tenant access is denied at server/database boundaries
- [ ] Service-role credentials never reach the browser
- [ ] `SECURITY DEFINER` functions use safe `search_path` and minimal grants
- [ ] Privileged actions are auditable
- [ ] External URLs are constrained against SSRF where relevant
- [ ] File handling is bounded and traversal-safe
- [ ] Webhooks are authenticated and replay-safe
- [ ] Retryable operations are idempotent
- [ ] Secrets are not persisted in logs/job payloads/artifacts unnecessarily
- [ ] Security-sensitive random tokens use cryptographic randomness
- [ ] Rate limits/abuse controls exist on public high-cost/high-risk surfaces

## Agent/AI invariants

- [ ] Untrusted content cannot redefine system/policy/tool authority
- [ ] Tool output is data unless explicitly trusted
- [ ] Memory writes are tenant/user scoped and poisoning-aware
- [ ] Model entitlements are enforced server-side
- [ ] Agent tools cannot exceed engagement/project authorization
- [ ] High-risk tool actions require configured approval/policy gates
- [ ] Sandboxes have bounded CPU/memory/time/storage
- [ ] Sandbox egress is explicit and logged
- [ ] Metadata/private network access is blocked unless explicitly required
- [ ] Agent checkpoints cannot be replayed across tenant/user/run boundaries
- [ ] Model/prompt/tool versions are attributable for each run
- [ ] Canary/eval/rollback gates exist for promoted model/agent changes

## Database invariants

- [ ] Forward migration replay is green
- [ ] DB lint is green at error level
- [ ] pgTAP security/tenant tests are green
- [ ] RLS coverage matches tenant ownership
- [ ] Unique/check/FK constraints protect concurrency-critical invariants
- [ ] Hot queries have supporting indexes
- [ ] Broad grants are justified and documented
- [ ] Deleted/paused/suspended state is enforced consistently

## CI/supply-chain invariants

- [ ] Third-party Actions pinned by full SHA
- [ ] Workflow permissions are least privilege
- [ ] No dangerous `pull_request_target` execution of untrusted code
- [ ] Fork PRs cannot read production secrets
- [ ] Semgrep runs with repository rules
- [ ] CodeQL scans JavaScript/TypeScript
- [ ] OSV scans dependency lockfiles
- [ ] Trivy scans vulnerabilities/secrets/misconfiguration
- [ ] OpenSSF Scorecard runs on main/schedule
- [ ] Security results are retained in SARIF/Code Scanning when permissions allow
- [ ] Tool versions are pinned and updateable intentionally

## Testing invariants

For security/business-critical flows check:

- [ ] happy path
- [ ] invalid input
- [ ] unauthenticated
- [ ] wrong role
- [ ] other user
- [ ] other tenant
- [ ] paused/suspended tenant
- [ ] duplicate/retry
- [ ] concurrent requests
- [ ] provider timeout/failure
- [ ] rollback/recovery
- [ ] malicious file/input
- [ ] regression test for every verified Critical/High fix
