# VEXONYX

VEXONYX is a production-first, multi-tenant, AI-native security workspace for professional and authorized security work.

## Current implementation

- Next.js 16 web application with premium marketing site and synthetic product proof.
- Supabase SSR authentication and tenant-aware application workspace.
- PostgreSQL schemas for organizations, projects, engagements, authorization, scope, files, findings/evidence, reports, usage/billing, AI state, waitlist, operations and audit.
- RLS on every VEXONYX application table; scope/authorization mutations are admin-controlled.
- Private `project-artifacts` storage bucket with organization-bound object policies.
- Waitlist RPC with normalization, idempotency, referral records and database-side rate limiting.
- Mock inference streaming contract; no browser→GPU and no active tool execution.
- Model aliases, routing rules, version/deployment tables, agent checkpoints, tool-run provenance and kill-switch control-plane model.
- Superadmin incident-mode page designed to require the server-only Supabase secret key.

## Explicitly not production-enabled yet

Real GPU inference, embedding worker, active tool gateway, sandbox scheduler/network egress and customer-facing report export workers remain disabled until their later release phases and evaluation/security gates pass. Model manifest entries are intentionally `unverified` until exact repository revisions, licenses, quantization and runtime artifacts are pinned.

## Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required public configuration: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Trusted superadmin/server control-plane actions additionally require `SUPABASE_SECRET_KEY`; never expose it to the browser.

## Repository structure

- `apps/web` — marketing + tenant application + superadmin UI.
- `packages/ai-core` — provider-neutral inference/queue/storage contracts.
- `services/ai-gateway` — future trusted orchestration service.
- `services/sandbox-controller` — future isolated execution scheduler.
- `workers` — file/embedding and later async workers.
- `supabase/migrations` — versioned database source of truth.
- `infra/models` — supply-chain manifest and pinned download flow.
- `docs/adr`, `docs/runbooks` — architecture and operations decisions.
- `evals` — required AI/security evaluation catalog.

## Safety boundary

Models and retrieved data never authorize targets. Authorization, scope, permissions, budgets and kill-switch state remain trusted control-plane data. Active external execution must fail closed unless current authorization and scope checks pass.
