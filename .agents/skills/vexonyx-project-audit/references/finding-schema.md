# VEXONYX audit finding schema

Every reported issue must distinguish a hypothesis from a verified finding.

## Required finding record

```yaml
id: VX-<DOMAIN>-NNN
title: concise title
status: CANDIDATE | VERIFIED | REJECTED_FALSE_POSITIVE | BLOCKED
severity: CRITICAL | HIGH | MEDIUM | LOW | INFO
confidence: 0-100
category: CWE/OWASP/domain category

component: canonical subsystem
entry_point: route/function/job/workflow/table
locations:
  - path: path/to/file
    line: 123

asset_at_risk:
  - tenant data
  - credentials
  - billing integrity

attacker_prerequisites:
  - unauthenticated remote user

trust_boundary: browser -> server API

attack_or_failure_path:
  - attacker-controlled value enters X
  - validation/control Y is missing or bypassed
  - privileged operation Z is reachable

existing_controls:
  - control and evidence

impact: concrete VEXONYX impact
likelihood: LOW | MEDIUM | HIGH

evidence:
  repository:
    - exact code/config evidence
  scanner:
    - tool/version/finding id, if applicable
  test:
    - executed reproduction/regression result, if applicable
  runtime:
    - verified runtime evidence, if applicable

false_positive_check:
  method: fp-check | independent review | executed test
  result: explanation

remediation:
  - smallest root-cause fix
  - defense-in-depth fix if useful

regression_test:
  - test that must fail before the fix and pass after it

verification_after_fix:
  - targeted test
  - relevant scanner
  - system/tenant regression
```

## Severity rules

**Critical** normally requires a realistic path to one or more of:

- pre-auth RCE
- authentication bypass with privileged access
- cross-tenant data/control access at material scale
- production secret/private-key theft
- sandbox escape into privileged infrastructure
- arbitrary privileged tool execution
- billing/ledger corruption with material impact

**High** normally covers exploitable but more constrained privilege escalation, sensitive data access, SSRF into sensitive services, durable integrity compromise, serious webhook/replay flaws, or significant tenant boundary failures.

Do not inflate severity because a scanner labels a rule Critical. Severity is based on the reachable VEXONYX path and actual controls.

## Rejected findings

Keep rejected Critical/High candidates in the report under `Rejected false positives` with a short reason. This prevents later agents from rediscovering and repeatedly escalating the same non-issue.

## Evidence language

Use:

- `observed` for direct repository/runtime facts
- `verified` only after independent validation or executed evidence
- `inferred` when a conclusion follows from several facts
- `unknown` when evidence is missing

Avoid `probably`, `looks safe`, `should work`, or `secure` without a stated verification boundary.