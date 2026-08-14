# VEXONYX Agent Operating Contract

VEXONYX is a long-lived production software project.

This file defines the mandatory operating contract for every AI coding agent working in this repository.

These rules apply regardless of whether the agent runs through Codex, Claude Code, Cursor, GitHub Copilot, Gemini, or another compatible coding harness.

The goal is not merely to produce code.

The goal is to build VEXONYX:

* correctly;
* securely;
* consistently;
* maintainably;
* efficiently;
* with strong tenant isolation;
* with reproducible database state;
* with verified behavior;
* with minimal architectural drift;
* with persistent project memory;
* without silently breaking previously working functionality.

---

# 1. Authority hierarchy

When information conflicts, use this authority order:

1. Current repository implementation.
2. Current database schema and verified runtime state.
3. Applied forward migrations.
4. Executed tests and verification evidence.
5. Versioned API contracts and schemas.
6. Current architecture decisions.
7. `.agent-memory`.
8. Documentation and plans.
9. Chat history.
10. Assumptions.

Never treat chat context as source of truth.

Never treat agent memory as stronger evidence than actual implementation.

Never assume something is implemented because another agent previously claimed it was implemented.

Verify it.

---

# 2. Mandatory session startup

Before every non-trivial task, perform the following sequence.

## 2.1 Read project memory

Read:

1. `.agent-memory/README.md`
2. `.agent-memory/current-state.md`
3. `.agent-memory/current-task.md`
4. `.agent-memory/checkpoint.json`
5. `.agent-memory/handover.md`
6. `.agent-memory/open-blockers.md`
7. the active section of `.agent-memory/work-plan.md`
8. relevant domain-memory files
9. `.agent-memory/decisions.md`
10. `.agent-memory/known-failures.md`
11. `.agent-memory/verification-matrix.md`

Do not restart completed work merely because conversation context is missing.

Continue from the recorded exact next action unless repository truth proves that action is stale.

## 2.2 Inspect Git state

Run or inspect:

```bash
git status
git branch --show-current
git log -n 10 --oneline
git diff
git diff --staged
```

When remote access exists, also determine whether the local branch is behind or ahead of its intended upstream.

Never overwrite unrelated user changes.

Never reset, stash, discard, delete, or rewrite user work unless explicitly instructed.

## 2.3 Inspect actual implementation

Before modifying a feature:

* locate all relevant code paths;
* locate database tables and migrations;
* locate schemas and generated types;
* locate API contracts;
* locate tests;
* locate background jobs;
* locate webhooks;
* locate UI consumers;
* locate authorization logic;
* locate observability/audit behavior.

Do not fix one isolated file when the behavior spans several layers.

---

# 3. Persistent agent memory

`.agent-memory/` is the canonical persistent progress system for AI-agent work in VEXONYX.

It must remain human-readable and Git-versioned.

## 3.1 Memory files

Maintain at minimum:

```text
.agent-memory/
├── README.md
├── current-state.md
├── current-task.md
├── checkpoint.json
├── work-plan.md
├── handover.md
├── open-blockers.md
├── decisions.md
├── known-failures.md
├── completed-work.md
├── verification-matrix.md
├── session-log.md
└── archive/
```

Additional domain-specific files may be added when useful.

Examples:

```text
.agent-memory/
├── canonical-architecture.md
├── database-and-migrations.md
├── authentication-and-rbac.md
├── api-contracts.md
├── ai-runtime.md
├── usage-and-billing.md
├── gpu-inference.md
├── security-model.md
└── canonical-flows.md
```

## 3.2 One active work item

Maintain exactly one canonical active work item in:

```text
.agent-memory/current-task.md
```

Do not create parallel current-task systems.

Subtasks may exist, but they must belong to the single active work item.

## 3.3 Mandatory checkpoint updates

After every meaningful atomic subtask:

1. inspect the diff;
2. execute targeted verification;
3. update `checkpoint.json`;
4. update `current-task.md`;
5. update blockers if necessary;
6. record the exact next action.

Do not leave memory until the end of a very long task.

## 3.4 Verification language

Use explicit statuses:

```text
NOT_STARTED
IN_PROGRESS
PARTIAL
BLOCKED
IMPLEMENTED_NOT_VERIFIED
VERIFIED
FAILED
SUPERSEDED
NOT_APPLICABLE
```

Do not use vague states such as:

```text
probably done
seems fixed
should work
almost complete
basically finished
```

## 3.5 Completed work

Only put work in:

```text
.agent-memory/completed-work.md
```

when the claimed behavior has actually been verified to the level required by the task.

Implementation alone is not completion.

## 3.6 Memory conflict handling

If memory contradicts current repository or database truth:

1. verify the real implementation;
2. treat repository/runtime truth as authoritative;
3. mark old memory `SUPERSEDED`;
4. record why it became stale;
5. update the current state.

Never silently retain false memory.

## 3.7 Never store sensitive data in memory

Never store:

* API keys;
* access tokens;
* refresh tokens;
* passwords;
* private keys;
* session cookies;
* `.env` contents;
* production customer data;
* full identity numbers;
* raw webhook secrets;
* database credentials;
* GPU provider credentials;
* private model-access tokens;
* complete terminal dumps containing sensitive values;
* hidden chain-of-thought.

Mask sensitive values when they must be referenced.

---

# 4. Installed project skills

The canonical installed-skill inventory is:

```text
skills-lock.json
```

Project-local skills live under:

```text
.agents/skills/
```

Do not assume a skill exists because it exists upstream.

Use only skills actually installed in this repository unless installation is part of the current task.

---

# 5. Canonical skill inventory

The repository is expected to contain the following 38 skills.

## 5.1 Orchestration and delivery

1. `using-superpowers`
2. `brainstorming`
3. `writing-plans`
4. `executing-plans`
5. `dispatching-parallel-agents`
6. `subagent-driven-development`
7. `using-git-worktrees`
8. `finishing-a-development-branch`
9. `writing-skills`

## 5.2 Repository understanding and quality

10. `acquire-codebase-knowledge`
11. `quality-playbook`
12. `code-review`
13. `find-bugs`
14. `differential-review`
15. `receiving-code-review`
16. `requesting-code-review`
17. `refactor`
18. `code-simplifier`
19. `verification-before-completion`

## 5.3 Debugging and testing

20. `systematic-debugging`
21. `test-driven-development`
22. `property-based-testing`
23. `fp-check`
24. `variant-analysis`

## 5.4 Security and static analysis

25. `code-security`
26. `security-threat-model`
27. `threat-model-analyst`
28. `semgrep`
29. `codeql`
30. `sarif-parsing`
31. `scan-secrets`
32. `install-hooks`
33. `sharp-edges`
34. `supply-chain-risk-auditor`

## 5.5 Platform, database and interface quality

35. `supabase`
36. `supabase-postgres-best-practices`
37. `spec-to-code-compliance`
38. `web-design-guidelines`

---

# 6. Mandatory skill routing

Before every non-trivial task, inspect the installed skills and create a short internal task-routing record.

Record:

* which skills apply;
* why they apply;
* which skills may activate later;
* which relevant-looking skills are intentionally skipped;
* why they are skipped.

Do not execute irrelevant skills merely to satisfy a count.

Do not ignore a relevant skill because manual work appears faster.

---

# 7. Default development workflow

For substantial implementation work, use this sequence.

```text
READ MEMORY
    ↓
INSPECT REPOSITORY TRUTH
    ↓
ROUTE SKILLS
    ↓
UNDERSTAND REQUIREMENTS
    ↓
DESIGN
    ↓
WRITE PLAN
    ↓
ISOLATE WORK
    ↓
WRITE TEST / REPRODUCTION
    ↓
IMPLEMENT
    ↓
TARGETED VERIFICATION
    ↓
SYSTEM VERIFICATION
    ↓
SECURITY / TENANT REVIEW
    ↓
CODE REVIEW
    ↓
UPDATE MEMORY
    ↓
COMMIT
    ↓
CONTINUE EXACT NEXT ACTION
```

---

# 8. Superpowers workflow

Use the `obra/superpowers` methodology where applicable.

## 8.1 `using-superpowers`

Use as the default coordination skill for non-trivial development work.

## 8.2 `brainstorming`

Use when:

* requirements are ambiguous;
* new product behavior is being designed;
* a new subsystem is being introduced;
* architectural alternatives must be evaluated.

Do not use it to reopen already-approved architecture without evidence of a problem.

## 8.3 `writing-plans`

Use for:

* multi-file changes;
* database + application changes;
* new product flows;
* migrations;
* API releases;
* architecture refactors;
* security remediation;
* performance remediation;
* multi-step production work.

Plans must reference concrete files, expected behavior and verification.

## 8.4 `using-git-worktrees`

Use when:

* isolation is required;
* another workstream is active;
* remediation must remain separate from audits;
* risky database/security changes should not contaminate unrelated work.

## 8.5 `test-driven-development`

For verified bugs and new deterministic business behavior:

1. write or locate a failing test/reproduction;
2. confirm the failure;
3. implement the smallest correct fix;
4. confirm the test passes;
5. refactor only after correctness.

## 8.6 `systematic-debugging`

Never patch symptoms first.

Determine:

1. reproduction;
2. failure boundary;
3. root cause;
4. upstream/downstream impact;
5. targeted correction;
6. regression protection.

## 8.7 `requesting-code-review`

Use before declaring significant work complete.

Review:

* correctness;
* security;
* tenant isolation;
* failure handling;
* race conditions;
* performance;
* test quality;
* maintainability;
* architectural consistency.

## 8.8 `verification-before-completion`

This is mandatory before stating:

* fixed;
* finished;
* complete;
* production-ready;
* secure;
* deployed successfully;
* fully verified.

Claims require executed evidence.

---

# 9. VEXONYX product architecture principles

VEXONYX must be built as a modular, production-grade AI platform.

Do not allow feature work to create tightly coupled infrastructure.

Prefer clear boundaries between:

```text
Web / UI
Application API
Authentication / Authorization
Organizations / Workspaces
Projects
Agent Orchestration
AI Gateway
Model Routing
GPU Inference
Usage Metering
Billing
File / Artifact Storage
Audit / Observability
Background Jobs
Database
External Integrations
```

The browser must never directly control privileged infrastructure.

Privileged actions must go through trusted server-side boundaries.

---

# 10. Multi-tenant architecture

VEXONYX must be multi-tenant from the beginning.

Every tenant-owned resource must have an explicit and verifiable ownership chain.

Examples include:

* organizations;
* workspaces;
* projects;
* users;
* memberships;
* files;
* artifacts;
* conversations;
* runs;
* agent jobs;
* model usage;
* API keys;
* billing data;
* subscriptions;
* usage events;
* reports;
* audit logs;
* integrations;
* notifications.

Never infer ownership solely from a client-provided identifier.

Server-side authorization must prove the requesting actor can access the requested tenant/resource.

---

# 11. Tenant isolation is a critical invariant

Treat possible cross-tenant exposure as critical until disproven.

For every tenant-aware read or write verify:

```text
Authenticated actor
      ↓
Membership / role
      ↓
Organization / workspace
      ↓
Requested resource
      ↓
Canonical ownership
      ↓
Authorization decision
```

Do not rely on UI hiding.

Do not rely only on route middleware.

Do not rely only on application filtering when RLS can provide defense in depth.

---

# 12. Supabase and PostgreSQL rules

When Supabase is used, the database must remain standard PostgreSQL wherever practical.

Use the installed:

```text
supabase
supabase-postgres-best-practices
```

skills for database work.

## 12.1 Migration rules

Always use forward migrations.

Never edit a migration that has already been applied to a shared or production environment unless there is proven evidence that it has never been applied anywhere relevant.

Prefer:

```text
new forward migration
```

over historical mutation.

## 12.2 Migration safety

For every migration consider:

* locks;
* large-table rewrites;
* indexes;
* concurrent usage;
* backfills;
* defaults;
* nullability;
* foreign keys;
* unique constraints;
* existing dirty data;
* rollback strategy;
* forward-fix strategy.

## 12.3 RLS

Tenant-owned tables should normally use RLS.

Verify:

* RLS enabled;
* correct policies;
* no broad `using (true)` policy without strong justification;
* `anon` restrictions;
* authenticated restrictions;
* service-role boundary;
* platform-admin boundary;
* insert ownership;
* update ownership;
* delete ownership.

## 12.4 SECURITY DEFINER

Every `SECURITY DEFINER` function requires explicit review.

Check:

* necessity;
* owner;
* grants;
* executable roles;
* pinned `search_path`;
* SQL injection risk;
* tenant boundary;
* caller-controlled identifiers;
* return-data exposure.

## 12.5 Database portability

Do not introduce unnecessary proprietary dependencies that make migration away from Supabase difficult.

Prefer standard:

* PostgreSQL;
* SQL;
* UUIDs;
* JSONB where appropriate;
* standard indexes;
* standard constraints;
* standard logical data relationships.

The application should remain reasonably portable to another managed PostgreSQL provider.

---

# 13. Authentication and authorization

Authentication proves identity.

Authorization proves access.

Never confuse them.

Every privileged server action must verify authorization independently.

Use explicit role and permission models.

Recommended hierarchy may include concepts such as:

```text
platform_admin
organization_owner
organization_admin
member
viewer
```

Actual roles must follow the canonical project model.

Do not create a second competing role system.

---

# 14. Superadmin

Platform-wide administration must remain separate from tenant administration.

Superadmin functionality may include:

* tenant management;
* usage controls;
* model controls;
* feature flags;
* billing administration;
* infrastructure status;
* abuse controls;
* global announcements;
* system configuration.

Do not expose platform-global data to ordinary tenant administrators.

Every superadmin action must be auditable.

---

# 15. User consistency

Every operation must preserve the canonical user and tenant context.

A user action must not accidentally:

* mutate another organization;
* log usage against another user;
* create files under another tenant;
* charge another workspace;
* use another tenant's API key;
* attach an agent run to the wrong project;
* inherit another user's privileges.

Test same-user and cross-user cases.

Test same-tenant and cross-tenant cases.

---

# 16. Usage metering

Usage must be attributable.

At minimum usage records should be capable of identifying:

* organization;
* workspace where relevant;
* project;
* user;
* agent/run;
* model/provider;
* request;
* token usage where available;
* GPU/inference duration where relevant;
* billable units;
* timestamp;
* status;
* failure state.

Usage data must not rely solely on client reporting.

Billing-critical usage must be server-generated or independently verified.

---

# 17. AI gateway architecture

Do not allow application code to talk to individual model providers in ad-hoc ways throughout the codebase.

Use a centralized AI/model gateway abstraction.

It should handle where relevant:

* provider selection;
* model selection;
* routing;
* retry;
* fallback;
* timeout;
* cancellation;
* streaming;
* usage accounting;
* request IDs;
* audit metadata;
* provider errors;
* rate limiting;
* concurrency;
* cost metadata.

Model-specific behavior belongs behind explicit adapters.

---

# 18. GPU inference boundary

GPU infrastructure must remain separate from the browser.

Preferred flow:

```text
Browser
   ↓
VEXONYX Application API
   ↓
Authorization
   ↓
Usage / quota checks
   ↓
Inference gateway
   ↓
GPU provider / compute
   ↓
Model
```

Never expose raw GPU control credentials to clients.

Never let the browser choose arbitrary privileged infrastructure parameters without server validation.

---

# 19. Background jobs

Long-running agent tasks should not depend on one fragile synchronous HTTP request.

Use durable jobs/workflows where appropriate.

Jobs should support:

* stable IDs;
* status;
* retries;
* attempt count;
* timeout;
* cancellation;
* idempotency;
* error classification;
* ownership;
* timestamps;
* audit events.

Avoid unbounded retries.

Differentiate:

```text
retryable failure
permanent failure
configuration failure
authorization failure
provider outage
quota failure
user cancellation
```

---

# 20. Idempotency

All retryable write operations must be evaluated for idempotency.

Examples:

* agent-run creation;
* file processing;
* billing events;
* webhook delivery;
* project creation;
* API operations;
* GPU jobs;
* asynchronous tasks.

A network retry must not create duplicate billable or destructive work.

Idempotency keys must be scoped correctly.

Never scope globally if the same key can legitimately exist under different tenants.

---

# 21. File and artifact handling

Uploads must be securely tenant-bound.

Validate:

* ownership;
* filename;
* path;
* content type;
* size;
* storage bucket;
* tenant path;
* project relationship;
* access policy;
* signed URL behavior;
* delete authorization.

Do not trust paths supplied by the client.

Generate canonical server-owned storage paths.

---

# 22. API design

Public and internal APIs must use explicit contracts.

For versioned APIs:

* maintain runtime validation;
* maintain OpenAPI or equivalent schema;
* maintain generated types when used;
* keep implementation and specification synchronized.

Use:

```text
spec-to-code-compliance
```

when API behavior is changed.

Do not hardcode tenant-specific examples in generic API documentation.

Examples should use placeholders such as:

```text
user@example.com
ORG-EXAMPLE
PROJECT-EXAMPLE
```

unless fixture-specific documentation explicitly requires real fixture identifiers.

---

# 23. Input validation

All untrusted external input must be validated.

This includes:

* URL params;
* query params;
* JSON bodies;
* headers;
* webhooks;
* form submissions;
* file metadata;
* AI/tool outputs;
* background-job payloads.

Use allowlists when possible.

Never pass raw untrusted values into:

* SQL;
* shell;
* filesystem paths;
* URLs;
* privileged model/tool actions.

---

# 24. External integrations

Every external integration must have:

* explicit adapter/boundary;
* timeout;
* controlled retry;
* error mapping;
* observability;
* correlation/request IDs;
* secret isolation;
* rate-limit handling;
* idempotency where relevant.

Do not spread provider-specific behavior across unrelated business logic.

---

# 25. Offensive-security product boundary

VEXONYX may support authorized security testing and defensive security workflows.

Product architecture must retain explicit ownership and authorization boundaries for customer-controlled assets.

Where functionality acts against external systems, the implementation should support recording relevant scope/context such as:

* organization;
* project;
* target definition;
* authorization/scope metadata;
* run;
* actor;
* timestamp;
* audit trail.

Do not silently remove authorization, ownership or auditing controls merely because an underlying model is capable of unrestricted generation.

Model capability and platform authorization are separate concerns.

---

# 26. Security review workflow

For security-sensitive work use relevant skills:

```text
security-threat-model
threat-model-analyst
code-security
semgrep
codeql
sarif-parsing
sharp-edges
scan-secrets
supply-chain-risk-auditor
```

Classify findings as:

```text
CONFIRMED
LIKELY
FALSE_POSITIVE
BLOCKED
UNVERIFIED
```

Do not report a static-analysis finding as confirmed without validating the actual data/control flow.

Use `fp-check` for material findings.

---

# 27. Secret handling

Never commit secrets.

Before publishing significant changes involving infrastructure/configuration, inspect for:

* API keys;
* service-role keys;
* cloud credentials;
* database passwords;
* JWT secrets;
* webhook secrets;
* private certificates;
* private keys;
* provider tokens.

Use environment variables or platform secret stores.

Do not put secrets in:

* client bundles;
* Git history;
* docs;
* tests;
* screenshots;
* agent memory;
* logs.

---

# 28. Dependency and supply-chain security

Use:

```text
supply-chain-risk-auditor
```

for dependency-sensitive work.

Evaluate:

* package legitimacy;
* package age;
* maintainership;
* known vulnerabilities;
* transitive dependency exposure;
* installation scripts;
* typosquatting;
* unnecessary dependencies;
* lockfile integrity.

Do not add a package when a small standard-library implementation is safer and simpler.

---

# 29. Performance

Performance is a product requirement.

Review both client-side and server-side performance.

## Client

Check:

* bundle size;
* unnecessary client components;
* repeated requests;
* waterfalls;
* hydration;
* image loading;
* caching;
* unnecessary renders;
* large dependency imports;
* blocking scripts.

## API/server

Check:

* N+1 queries;
* repeated database round-trips;
* unnecessary serialization;
* long synchronous work;
* missing caching;
* duplicate provider calls;
* large payloads;
* unbounded loops.

## Database

Check:

* slow queries;
* missing indexes;
* incorrect indexes;
* sequential scans on hot paths;
* inefficient RLS policies;
* excessive joins;
* repeated RPC calls;
* connection behavior;
* pagination.

Do not optimize blindly.

Measure first.

---

# 30. Caching

Caching must never violate:

* tenant isolation;
* authorization;
* freshness requirements;
* user-specific output.

Cache keys must include all relevant identity/context dimensions.

Never cache tenant-specific data under a global key.

---

# 31. Rate limiting and quotas

Externally accessible and expensive operations should be evaluated for rate limiting.

Especially:

* authentication;
* account creation;
* password reset;
* AI generation;
* agent runs;
* file upload;
* inference jobs;
* search;
* expensive API operations;
* webhook entry points.

Quotas must be tenant/user-aware where appropriate.

---

# 32. Error handling

Errors must not leak sensitive internals.

External errors should be stable and understandable.

Internally retain sufficient debugging context through:

* error class;
* request ID;
* run ID;
* tenant ID where safe;
* operation;
* provider;
* timestamp.

Do not expose:

* stack traces;
* database credentials;
* SQL internals;
* raw provider secrets;
* filesystem paths;
* private infrastructure metadata.

---

# 33. Observability

Important flows must be observable.

Prefer structured logs.

Where appropriate retain:

* request ID;
* correlation ID;
* organization ID;
* user ID;
* project ID;
* agent run ID;
* provider/model;
* duration;
* status;
* normalized error category.

Avoid logging sensitive prompt/file contents unless explicitly required and appropriately protected.

---

# 34. Audit trail

Security-sensitive and commercial actions should be auditable.

Examples:

* membership changes;
* role changes;
* API key changes;
* billing changes;
* model configuration;
* superadmin actions;
* destructive actions;
* agent executions;
* project deletion;
* credential changes;
* authorization changes.

Audit records should be append-oriented wherever practical.

---

# 35. Destructive operations

Destructive actions must require strong ownership checks.

Examples:

* deleting projects;
* deleting organizations;
* removing members;
* deleting artifacts;
* deleting runs;
* rotating keys;
* removing integrations.

Avoid cascading destruction unless the intended data lifecycle is explicit.

Prefer soft-delete/archive where business requirements justify retention.

---

# 36. Concurrency and race conditions

Review race conditions for:

* usage counters;
* subscriptions;
* organization membership;
* idempotency;
* project creation;
* agent state transitions;
* job claiming;
* quota enforcement;
* billing;
* unique resource names.

Use database constraints and atomic operations rather than relying solely on application checks.

---

# 37. Tests

Tests must protect business invariants, not implementation trivia.

Maintain appropriate coverage for:

* authentication;
* authorization;
* tenant isolation;
* RLS;
* API contracts;
* billing;
* usage;
* job state;
* retries;
* idempotency;
* file ownership;
* model routing;
* critical user flows.

For tenant-sensitive behavior, use at least two tenant fixtures where practical.

Verify negative cases.

---

# 38. Property-based testing

Use:

```text
property-based-testing
```

for areas such as:

* parsers;
* authorization invariants;
* idempotency;
* serializers;
* state machines;
* pricing;
* usage calculations;
* canonical identifiers.

Generated tests are especially valuable when the input space is large.

---

# 39. UI and UX

Use:

```text
web-design-guidelines
```

for user-facing interface work.

The UI should be:

* fast;
* responsive;
* accessible;
* consistent;
* clear;
* predictable.

Do not expose internal implementation terms to users unnecessarily.

Avoid confusing developer terminology in customer-facing screens.

Provide clear loading, empty, success and error states.

---

# 40. Client/server boundaries

Prefer server-side execution for:

* secrets;
* privileged database access;
* billing;
* tenant authorization;
* provider credentials;
* model routing;
* infrastructure actions.

Do not move sensitive logic to client components merely for convenience.

---

# 41. Large files

Any source file exceeding approximately 2,000 lines must be evaluated.

Do not split files mechanically.

Split only at safe domain boundaries.

Possible boundaries include:

* domain services;
* schemas;
* adapters;
* UI sections;
* helpers;
* API handlers;
* state machines;
* orchestration modules.

Before splitting:

1. identify responsibilities;
2. identify coupling;
3. identify tests;
4. establish behavior baseline;
5. refactor incrementally;
6. verify behavior after each extraction.

Do not perform broad large-file refactors while simultaneously changing business behavior unless necessary.

---

# 42. Refactoring

Use:

```text
refactor
```

only after correctness is understood.

Use:

```text
code-simplifier
```

after behavior is verified.

Do not simplify code by deleting:

* validation;
* RLS;
* error handling;
* authorization;
* audit behavior;
* idempotency;
* retries;
* tests;

unless it is proven redundant and replacement protection exists.

---

# 43. Differential review

When working on:

* a PR;
* a branch;
* a release;
* a migration series;
* a large remediation;

use:

```text
differential-review
```

Compare intended behavior against actual changed behavior.

Do not review only changed lines when unchanged callers/callees determine correctness.

---

# 44. Variant analysis

After confirming a bug, use:

```text
variant-analysis
```

to search for the same root-cause pattern elsewhere.

Examples:

* one missing tenant filter;
* one unsafe storage path;
* one uncanonicalized timestamp;
* one broken permission helper;
* one inconsistent enum;
* one provider call lacking timeout.

Do not assume the first discovered instance is unique.

---

# 45. False-positive checking

Before classifying a security or correctness finding as confirmed, use direct evidence.

Use:

```text
fp-check
```

when relevant.

Evidence may include:

* executable reproduction;
* code path proof;
* database query;
* unit test;
* integration test;
* static-analysis trace;
* runtime behavior.

---

# 46. Production claims

Never claim production readiness based only on local tests.

Distinguish:

```text
LOCAL_VERIFIED
CI_VERIFIED
STAGING_VERIFIED
DEPLOYED
PRODUCTION_VERIFIED
```

A Vercel preview build does not prove production runtime parity.

A successful migration file does not prove it is applied.

A database migration applied in development does not prove production parity.

A passing unit test does not prove external integration correctness.

---

# 47. Environment separation

Clearly distinguish:

* local;
* development;
* preview;
* staging;
* production.

Never use development state as evidence of production state without explicit verification.

Never send real external actions during tests unless the environment and task explicitly require them.

---

# 48. Git discipline

Never:

* force-push without explicit reason and authorization;
* rewrite shared history casually;
* delete user branches;
* stash unrelated user changes;
* reset unrelated work;
* mix unrelated fixes into one remediation.

Prefer small, focused commits.

Commit messages should explain intent.

Examples:

```text
fix(auth): enforce organization ownership on project delete
fix(db): scope usage aggregation by organization
refactor(agent): split run orchestration from provider adapter
test(security): cover cross-tenant artifact access
chore(agent): update persistent project memory
```

---

# 49. Branch isolation

Separate:

* audits;
* remediation;
* architecture refactors;
* feature work;
* security fixes;
* migration fixes.

An audit branch should not silently become the remediation branch.

Security-sensitive remediation should be independently reviewable.

---

# 50. Audit workflow

For repository-wide audits use this sequence.

## Phase 0 — Establish execution context

Record:

* branch;
* HEAD;
* upstream state;
* dirty files;
* target environment;
* available tools;
* blocked verification.

## Phase 1 — Acquire codebase knowledge

Use:

```text
acquire-codebase-knowledge
quality-playbook
```

Map:

* architecture;
* major flows;
* schema;
* APIs;
* jobs;
* integrations;
* authentication;
* billing;
* usage;
* AI infrastructure;
* UI;
* deployment.

## Phase 2 — Database and tenancy

Use:

```text
supabase
supabase-postgres-best-practices
```

Review:

* tables;
* RLS;
* grants;
* functions;
* migrations;
* ownership;
* indexes;
* constraints;
* concurrency.

## Phase 3 — Security

Use:

```text
security-threat-model
threat-model-analyst
code-security
scan-secrets
semgrep
codeql
sharp-edges
supply-chain-risk-auditor
```

## Phase 4 — Contract and behavior

Use:

```text
spec-to-code-compliance
code-review
find-bugs
variant-analysis
fp-check
property-based-testing
```

## Phase 5 — Performance and UX

Review:

* browser performance;
* APIs;
* database performance;
* caching;
* large files;
* client/server boundaries;
* accessibility;
* interaction consistency.

## Phase 6 — Findings register

Every material finding should include:

* ID;
* severity;
* status;
* evidence;
* affected files;
* affected database objects;
* root cause;
* business impact;
* security impact;
* reproduction;
* recommended fix;
* verification requirement.

## Phase 7 — Remediation plan

Split fixes into safe independently reviewable units.

Do not modify production code during an audit unless remediation was explicitly requested.

---

# 51. Remediation workflow

For each verified issue:

```text
Finding
   ↓
Reproduce
   ↓
Confirm root cause
   ↓
Variant search
   ↓
Write regression test
   ↓
Implement smallest safe fix
   ↓
Targeted verification
   ↓
Broader verification
   ↓
Security/tenant review
   ↓
Code review
   ↓
Update finding state
```

Do not weaken validation merely to make a failing test pass.

---

# 52. Verification matrix

Maintain evidence in:

```text
.agent-memory/verification-matrix.md
```

Record:

* command/check;
* date;
* environment;
* branch/commit;
* outcome;
* relevant notes.

Example:

```text
| Check | Environment | Commit | Result | Notes |
|---|---|---|---|---|
| npm run typecheck | local | abc123 | PASS | |
| npm run lint | local | abc123 | PASS | |
| npm test | local | abc123 | PASS | 182 tests |
| npm run build | local | abc123 | PASS | |
| RLS two-tenant regression | staging | abc123 | PASS | org A denied org B |
```

Do not fabricate verification.

---

# 53. Completion gates

Before declaring a substantial implementation complete, evaluate all relevant gates.

At minimum:

* [ ] Requirements satisfied.
* [ ] Actual implementation inspected.
* [ ] Targeted tests pass.
* [ ] Typecheck passes.
* [ ] Lint passes.
* [ ] Relevant full tests pass.
* [ ] Production build passes.
* [ ] Database migrations validated.
* [ ] Tenant isolation verified where relevant.
* [ ] Authorization negative cases verified.
* [ ] API contract synchronized where relevant.
* [ ] Security review completed where relevant.
* [ ] Performance regressions considered.
* [ ] Diff reviewed.
* [ ] No secrets added.
* [ ] `.agent-memory` updated.
* [ ] Exact next action recorded.
* [ ] Remaining blockers explicitly documented.

A skipped gate must be recorded as `BLOCKED` or `NOT_APPLICABLE` with a reason.

Never turn a skipped check into a PASS.

---

# 54. User-facing destructive features

When implementing user capabilities such as project deletion, file deletion or organization changes:

verify:

* correct owner;
* correct tenant;
* correct permission;
* downstream data behavior;
* background jobs;
* storage objects;
* billing implications;
* audit entry;
* user feedback;
* retry/idempotency behavior.

---

# 55. Notes and project metadata

User-added notes, descriptions, tags and metadata must be:

* tenant-scoped;
* ownership-checked;
* sanitized/validated;
* included in appropriate audit/change behavior.

Never treat arbitrary metadata as trusted executable input.

---

# 56. Data deletion and retention

Deletion behavior must be explicit.

For each entity determine:

* soft delete;
* hard delete;
* archive;
* retention;
* dependent records;
* storage files;
* audit requirements.

Do not let cascade behavior determine business policy accidentally.

---

# 57. AI-generated actions

AI-generated tool requests and structured outputs are untrusted inputs.

Validate:

* schema;
* actor permissions;
* tenant;
* resource ownership;
* action allowlist;
* limits;
* target.

The model must never become an authorization layer.

---

# 58. Agent self-improvement

VEXONYX may learn from outcomes, but production behavior must not mutate uncontrollably.

Prefer improvement through:

* evaluation datasets;
* scored runs;
* feedback;
* reusable prompts;
* memory;
* retrieval;
* routing rules;
* supervised configuration changes.

Do not let an agent silently rewrite production prompts, policies, tools, permissions or database schema based solely on its own judgment.

Self-improvement mechanisms must be observable, versioned and reversible.

---

# 59. Consistency before novelty

Before creating a new:

* table;
* service;
* helper;
* permission;
* state;
* API route;
* storage bucket;
* queue;
* model adapter;

search for an existing canonical implementation.

Extend the canonical path when possible.

Do not introduce parallel systems for the same responsibility.

---

# 60. Naming and canonical concepts

Prefer one canonical name for every business concept.

Avoid synonyms across:

* database;
* TypeScript;
* APIs;
* UI;
* docs.

When legacy names exist, document the mapping instead of creating more ambiguity.

---

# 61. No hidden hardcoding

Avoid hardcoding:

* tenant IDs;
* user IDs;
* organization IDs;
* email addresses;
* domains;
* provider IDs;
* model names;
* pricing;
* limits;
* region IDs;
* production URLs;

unless the value is genuinely immutable by design.

Prefer configuration and canonical database state.

---

# 62. Configuration

Configuration must have:

* schema/validation;
* defaults only where safe;
* environment separation;
* documented ownership.

Fail closed for security-sensitive missing configuration.

Do not silently fall back to development behavior in production.

---

# 63. Feature flags

Feature flags should be:

* typed;
* scoped;
* observable;
* auditable for sensitive features;
* default-safe.

Avoid permanent dead flags.

---

# 64. Billing correctness

Billing behavior is high-impact.

Verify:

* correct tenant;
* correct customer;
* correct subscription;
* correct usage;
* correct period;
* correct currency;
* duplicate handling;
* retry behavior;
* webhook idempotency.

Never silently approximate billing-critical values.

---

# 65. Data integrity

Use database constraints when the invariant can be enforced there.

Prefer:

* foreign keys;
* unique constraints;
* checks;
* not-null;
* transactional operations;

over assumptions in application code.

Application validation and database constraints should complement each other.

---

# 66. Work that cannot be verified

If a required verification cannot be run:

1. state exactly why;
2. classify it `BLOCKED`;
3. do all safe local work possible;
4. record what still needs verification;
5. never call the work fully complete.

---

# 67. External documentation

Do not guess external platform behavior.

For rapidly changing providers, frameworks, APIs or infrastructure, inspect current official documentation when tools allow it.

Do not implement against outdated remembered APIs when current docs are available.

---

# 68. Agent handover

Before ending work, update:

```text
.agent-memory/current-state.md
.agent-memory/current-task.md
.agent-memory/checkpoint.json
.agent-memory/handover.md
.agent-memory/open-blockers.md
.agent-memory/completed-work.md
.agent-memory/verification-matrix.md
.agent-memory/session-log.md
```

The handover must contain:

* what changed;
* why;
* current branch;
* current commit;
* verification completed;
* verification blocked;
* open risks;
* exact next action.

A new agent must be able to continue without reconstructing the entire session from chat.

---

# 69. Required checkpoint structure

`checkpoint.json` should remain machine-readable.

Recommended shape:

```json
{
  "version": 1,
  "project": "VEXONYX",
  "status": "IN_PROGRESS",
  "active_work_item": null,
  "active_subtask": null,
  "branch": null,
  "base_sha": null,
  "head_sha": null,
  "files_changed": [],
  "migrations": [],
  "tests_run": [],
  "tests_passed": [],
  "tests_failed": [],
  "tests_skipped": [],
  "db_verified": false,
  "tenant_isolation_verified": false,
  "api_contract_verified": false,
  "security_verified": false,
  "remaining_blockers": [],
  "exact_next_action": null,
  "last_verified_at": null
}
```

Never store secrets in checkpoint metadata.

---

# 70. Final operating rule

The agent's job is not to make the repository appear finished.

The agent's job is to leave VEXONYX in a demonstrably better and more correct state.

Use evidence over assumptions.

Use canonical paths over parallel implementations.

Use database constraints over fragile convention.

Use authorization over trust.

Use tests over confidence.

Use persistent memory over chat reconstruction.

Use small verified changes over large unverified rewrites.

Never claim completion without proof.
