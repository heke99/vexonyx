# Isolated parser production runtime

VEXONYX treats uploaded customer files as untrusted input. Risky document and archive parsing must never run inside the normal Next.js request process.

## Runtime contract

- File-processing jobs inspect size, hash, executable magic and safe text before any parser queueing.
- PDF, DOCX, archives and unknown non-executable formats are queued in `artifacts.parser_jobs`.
- Parser jobs use fenced leases (`lease_owner`, `lease_generation`, `lease_expires_at`) and at most five attempts.
- Production parsing runs in a fresh Vercel Sandbox microVM using Python 3.13, 1 vCPU and 2 GiB memory.
- Sandbox networking is `deny-all`; no ports are published and sessions are non-persistent.
- Command duration is bounded by the lower of the job CPU and wall-clock limits. With one vCPU, wall time is also an upper bound on consumed CPU seconds.
- The trusted control plane uploads only the pinned parser source and the single private input object. The sandbox does not fetch code or data over the network.
- Output is a bounded JSON file. The trusted control plane validates the status, output type and byte size before writing sanitized chunks.
- Sandbox teardown runs in `finally`, including parser failures.
- File status, sanitized chunks and parser-job terminal state are committed atomically through `artifacts.complete_parser_job`.
- Worker routes require `WORKER_SHARED_SECRET` or Vercel `CRON_SECRET`; missing credentials fail closed.

## Identity

Production Sandbox calls use project-scoped Vercel OIDC (`VERCEL_OIDC_TOKEN`). No long-lived Vercel access token is required in the application. A separate `VERCEL_SANDBOX_TOKEN` fallback exists only for explicitly configured non-production/local testing.

## Fail-closed behavior

If Sandbox identity, project identity, lease fencing, private-object download, Sandbox API, output validation or database completion fails, the parser job is retried. After the fifth failed attempt it moves to `dead_letter` and the file becomes `failed`. The system must not fall back to parsing the same risky file inside the web process.

## Release verification

Before enabling beta uploads, verify all of the following on the production deployment:

1. clean migration replay and pgTAP are green;
2. bundled Python parser compiles and runs in CI;
3. unauthenticated worker requests return 401;
4. a synthetic PDF or DOCX reaches `ready` through a real Vercel Sandbox;
5. parser-job metadata records `deny_all`, Python runtime, source SHA-256 and Sandbox session identity;
6. no temporary synthetic organization/file/parser rows remain after the smoke test.
