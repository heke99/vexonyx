---
name: vexonyx-project-audit
description: Run a repository-wide, evidence-driven VEXONYX production/security audit across architecture, auth, multi-tenancy, Supabase/RLS, APIs, workers, queues, AI/agent boundaries, files/parsers, billing/usage, CI/CD, supply chain, tests, performance and deployment. Trigger when asked to audit, review, scan, harden, production-check, find weaknesses, find inconsistencies, or inspect the whole VEXONYX project. This is an orchestrator: route to installed specialist skills and deterministic scanners instead of replacing them.
---

# VEXONYX Project Audit

Audit the system as a connected production platform, not as a pile of files. Repository/runtime evidence is stronger than plans, memory, documentation, or previous agent claims.

## Core rules

1. Read `AGENTS.md` and the relevant `.agent-memory/` state first.
2. Inspect repository truth before forming findings.
3. Build a component and trust-boundary map before vulnerability hunting.
4. Follow complete flows across UI, API, authorization, database, workers, external providers, logging, usage and tests.
5. Use installed specialist skills whenever applicable.
6. Use deterministic scanner/test output as evidence, not as unquestioned truth.
7. Run `fp-check` or equivalent manual validation on every blocking scanner/agent finding.
8. Never mark a finding VERIFIED without a concrete code path, executed test/scanner result, reproducible invariant violation, or runtime evidence.
9. Never silently fix unrelated code while auditing. Separate discovery from remediation unless the user explicitly asks to fix findings.
10. Treat possible cross-tenant access, auth bypass, secret exposure, sandbox escape, pre-auth RCE and billing integrity failure as critical until disproven.

## Phase 1 — Establish scope and architecture

Inspect at minimum when present:

- `apps/`
- `packages/`
- `services/`
- `supabase/`
- `infra/`
- `evals/`
- `docs/`
- `.github/`
- `.agent-memory/`
- root manifests, lockfiles and environment examples

Route to:

- `acquire-codebase-knowledge`
- `security-threat-model`
- `threat-model-analyst`
- `spec-to-code-compliance` when a versioned spec/API contract exists

Build a map containing:

- public entry points
- authenticated entry points
- privileged/admin entry points
- trust boundaries
- tenant ownership chains
- data stores
- queues/workers
- external providers
- file/parser boundaries
- model/tool/sandbox boundaries
- billing/usage boundaries
- deploy/CI boundaries

For each important flow, trace:

`entrypoint -> validation -> authentication -> authorization -> canonical ownership -> database/RPC -> worker/provider -> audit/usage -> response`

Record missing or ambiguous edges as open questions, not assumptions.

## Phase 2 — Automated evidence

Inspect the latest `Security` workflow and existing CI results. When local execution is available, run the repository-defined pinned scanners rather than ad-hoc unversioned installs.

Expected deterministic layers:

- Semgrep high-confidence repository rules
- GitHub CodeQL for JavaScript/TypeScript
- OSV-Scanner for dependency vulnerabilities
- Trivy filesystem scan for HIGH/CRITICAL vulnerabilities, secrets and misconfiguration
- OpenSSF Scorecard for repository/supply-chain posture
- normal lint/typecheck/tests/build
- Supabase migration replay, DB lint and pgTAP

Scanner output is a lead. Verify reachability, exposure, affected version, compensating controls and actual VEXONYX impact before assigning severity.

## Phase 3 — Specialist audit passes

Use the installed skills in targeted passes rather than one giant generic review.

### Security and code

Route to:

- `code-security`
- `semgrep`
- `codeql`
- `sarif-parsing`
- `scan-secrets`
- `sharp-edges`
- `supply-chain-risk-auditor`
- `variant-analysis`
- `differential-review` for risky recent changes
- `find-bugs`

Check at minimum:

- injection: SQL, command, template, header and log injection
- XSS and unsafe HTML rendering
- SSRF and URL allowlisting
- path traversal and unsafe archives
- webhook signature/replay handling
- insecure deserialization/parsing
- race conditions and non-idempotent retries
- secrets in code, logs, URLs, job payloads and artifacts
- weak crypto or insecure token construction
- missing rate limits / abuse controls
- error/data leakage
- dependency and action supply-chain risk

### Authentication, authorization and multi-tenancy

Trace every privileged read/write through the canonical ownership model.

Verify:

- identity is established server-side
- authorization is independent of authentication
- client-supplied IDs never prove ownership
- platform admin is separated from tenant admin
- role checks are canonical and not duplicated inconsistently
- same-user / other-user cases
- same-tenant / cross-tenant cases
- suspended/paused/deleted tenant behavior
- invitation/session/token lifecycle
- no hidden auth bypass or test/demo bypass can reach production unintentionally

### Supabase/PostgreSQL

Route to:

- `supabase`
- `supabase-postgres-best-practices`

Verify:

- RLS enabled where required
- policy coverage for SELECT/INSERT/UPDATE/DELETE
- no accidental broad policies
- anon/authenticated grants match intended boundaries
- every `SECURITY DEFINER` has pinned `search_path`, minimal grants and explicit tenant checks
- service-role use is server-only
- migration replay is clean
- constraints protect invariants under concurrency
- indexes support hot ownership/status lookups
- migrations are forward-only and production-safe

### AI, agents and model runtime

Review separately from ordinary web AppSec.

Check:

- direct and indirect prompt injection
- untrusted tool output treated as instructions
- memory/RAG poisoning
- cross-user or cross-tenant context leakage
- policy/approval bypass
- model routing entitlement bypass
- tool capability escalation
- checkpoint integrity and replay
- runaway autonomous loops/retries
- sandbox escape assumptions
- sandbox network egress and metadata-service access
- SSRF/DNS rebinding through tools
- secrets entering model context
- hostile file/web content entering context
- model artifact/version pinning
- canary/rollback/evaluation gates
- auditability of agent/tool decisions

### Files, parsers and artifacts

Verify:

- upload ticket authorization and object ownership
- MIME/extension/content disagreement handling
- size/count/decompression limits
- ZIP/tar path traversal
- parser isolation
- time/memory/CPU limits
- dangerous active content
- download authorization
- deleted/quarantined artifact behavior
- derived chunks/embeddings inherit canonical tenant ownership

### Billing and usage

Verify:

- billable usage is server-generated or independently verified
- idempotency for provider webhooks and ledger writes
- no client-controlled price/credit/usage authority
- integer/decimal money handling, never binary float for ledger values
- organization/user/project/run attribution is consistent
- retries cannot double-charge or double-credit
- subscription/entitlement state cannot drift from provider state silently

### Workers, queues and external integrations

Verify:

- authenticated internal worker calls
- lease ownership/generation checks
- idempotency keys
- bounded retry/backoff
- dead-letter handling
- poison message behavior
- payload secret minimization/scrubbing
- external request timeout/cancellation
- webhook verification
- audit trail and correlation IDs

### CI/CD and supply chain

Verify:

- third-party GitHub Actions are pinned to immutable full commit SHAs
- workflow permissions use least privilege
- untrusted PR/issue content cannot flow into privileged shell/agent execution
- no `pull_request_target` misuse
- secrets are not available to untrusted fork code
- dependency lockfiles are committed
- security scanners are version pinned
- deploy secrets are environment-scoped
- production deploy is tied to reviewed commits and has rollback evidence

## Phase 4 — Correctness, consistency and performance

Route to:

- `code-review`
- `quality-playbook`
- `code-simplifier` only after correctness is established
- `property-based-testing` for invariant-heavy logic
- `systematic-debugging` for reproduced failures

Look for:

- duplicated domain rules
- UI/API/database state-machine disagreement
- stale fields/statuses
- N+1 queries
- unbounded list queries
- unnecessary client round trips/reloads
- missing caching where safe
- race-prone read-then-write flows
- missing unique/check/foreign-key invariants
- dead or unreachable privileged code
- inconsistent error/status semantics

## Phase 5 — Test the invariants

Do not judge coverage only by percentage. Confirm tests exist for critical business/security invariants.

Required classes where applicable:

- happy path
- invalid input
- unauthenticated
- unauthorized role
- other user
- other tenant
- paused/suspended tenant
- duplicate/retry/idempotency
- concurrency/race
- provider timeout/failure
- rollback/recovery
- malicious file/input
- security regression

Use `test-driven-development` for confirmed defects and `verification-before-completion` before claiming remediation is complete.

## Phase 6 — Validate findings

For every candidate Critical/High finding:

1. identify exact entry point and affected asset;
2. trace the full reachable code/data path;
3. identify attacker prerequisites;
4. identify existing controls;
5. determine whether the condition is exploitable/reachable in production;
6. use `fp-check` or equivalent independent validation;
7. assign severity only after validation.

Do not create exploit code against third-party systems. Repository-local reproductions and defensive regression tests are preferred.

## Output contract

Use the finding structure in `references/finding-schema.md`.

The audit report must contain:

1. Executive summary
2. Scope and evidence inspected
3. Architecture/trust-boundary map
4. Verified Critical findings
5. Verified High findings
6. Medium/Low findings
7. Rejected false positives
8. Missing verification / open questions
9. Test and observability gaps
10. Prioritized remediation order
11. Verification matrix

A clean scanner run is not enough to call the platform secure. A clean audit means the important boundaries and invariants were actually inspected and tested.