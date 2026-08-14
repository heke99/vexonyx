# Blockers / external prerequisites

- Vercel project/environment variables must be created before production deployment can be considered complete.
- Server-only `SUPABASE_SECRET_KEY` is not available through the current Supabase connector; superadmin control-plane writes remain intentionally disabled without it.
- GPU provider, model revisions/licenses/quantization/runtime images are not yet verified/provisioned.
- Sandbox execution infrastructure and controlled network egress provider are not yet provisioned.
- Backup restore, load tests and model/tool evals require their respective later-phase infrastructure.
