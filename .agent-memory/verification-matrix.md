# Verification matrix

| Area | State | Evidence |
|---|---|---|
| Supabase migrations | synced | remote + repo through `20260814133101_queue_claim_runtime_fix` |
| RLS / tenant isolation | verified | all domain tables RLS-enabled; rollback tests isolate Org A/B and deny viewer/member writes where required |
| Tenant referential integrity | verified | composite FK test returns cross-tenant rejection |
| Engagement activation boundary | verified | member cannot edit active engagement or promote draft to active |
| Queue fencing | verified | wrong owner/generation cannot renew/finish; current lease can renew/finish |
| Tool preflight binding | verified | mismatched engagement/run fails closed before tool lookup |
| Security advisor | reviewed | remaining no-policy INFO items are intentional service/control-plane deny-all tables |
| Performance advisor | remediated | composite FK coverage and duplicate permissive policy findings removed; only expected unused-index/Auth info remains on empty DB |
| Waitlist | verified | normalization + idempotency produce one entry |
| GitHub app build | verified | install, lint, typecheck, JS tests and Next.js production build green |
| Clean DB replay | verified | local Supabase start/reset, `db lint --level error`, pgTAP runtime/RLS suite and status green |
| Dependency reproducibility | verified | root `package-lock.json`; final workflow uses `npm ci`; Supabase CLI pinned at 2.101.0 |
| Vercel build | build green / deploy gate pending | Next.js build completes to `/vercel/output`; preview comment patch issue mitigated by disabling Preview Feedback; requires final READY deployment + smoke |
| GPU inference | disabled | model registry remains unverified/disabled until supply-chain pinning/evals |
| Tool execution | disabled | preflight exists but external tools/sandbox/network remain off by default |
| Load/restore tests | later phase | required before broader production/beta acceptance of GPU/tool infrastructure |