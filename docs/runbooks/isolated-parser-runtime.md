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

## Worker scheduling and request authentication

Production worker scheduling is owned by Supabase Cron rather than Vercel Cron. This avoids depending on a manually configured `CRON_SECRET` while keeping every worker endpoint authenticated.

- `pg_cron` schedules file processing, isolated parsing, report rendering and admin exports.
- `pg_net` sends the HTTPS worker request asynchronously.
- A random 256-bit bearer token is generated independently per environment.
- The raw token is stored only in Supabase Vault as `vexonyx_worker_scheduler_token`.
- `security.worker_credentials` stores only the SHA-256 digest.
- Vercel routes ask the service-role-only `security.verify_worker_token` RPC to validate a supplied bearer token.
- `security.invoke_worker` is not executable by PostgREST roles and reads the raw token from Vault only inside Postgres.
- The scheduler configuration defaults to disabled. Production is enabled only after the matching application deployment is READY.
- Vercel Cron definitions are intentionally absent, so a missing Vercel environment secret cannot generate unauthenticated retries.
- Existing `WORKER_SHARED_SECRET`/`CRON_SECRET` support remains as an optional emergency/manual path when explicitly configured.

## Sandbox identity

Production Sandbox API calls use project-scoped Vercel OIDC (`VERCEL_OIDC_TOKEN`). No long-lived Vercel access token is required in the application. A separate `VERCEL_SANDBOX_TOKEN` fallback exists only for explicitly configured non-production/local testing.

## Fail-closed behavior

If scheduler authentication, Sandbox identity, project identity, lease fencing, private-object download, Sandbox API, output validation or database completion fails, the parser job is retried. After the fifth failed attempt it moves to `dead_letter` and the file becomes `failed`. The system must not fall back to parsing the same risky file inside the web process.

## Release verification

Before enabling beta uploads, verify all of the following on the production deployment:

1. clean migration replay and pgTAP are green;
2. bundled Python parser compiles and runs in CI;
3. unauthenticated worker requests return 401;
4. Supabase Cron has exactly the four named worker schedules and the production scheduler is enabled only after deploy;
5. a synthetic PDF reaches `ready` through a real Vercel Sandbox canary;
6. canary metadata records `deny_all`, Python runtime, source SHA-256 and Sandbox session identity;
7. no temporary synthetic organization/file/parser rows remain after smoke tests.
