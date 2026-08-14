# Current state — 2026-08-14

VEXONYX foundation is implemented on branch `agent/vexonyx-foundation-v3` and the VEXONYX Supabase project has forward migrations through `server_control_plane_api_boundary`.

Implemented: marketing UI, waitlist RPC, Supabase auth foundation, organizations/projects app shell, tenant RLS, private artifact bucket, security entities, AI registry/state/checkpoints, usage/billing readiness, operations kill-switch model, superadmin incident mode, mock inference contract, CI foundation, model supply-chain placeholders.

Not yet implemented/production-enabled: real embeddings/GPU inference, tool gateway execution, sandbox controller execution/network enforcement, full file processing worker, report export workers, email provider, full evaluation/load/restore suites.
