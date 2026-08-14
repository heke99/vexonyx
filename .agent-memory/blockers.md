# Blockers / external prerequisites

Release blockers remaining at this checkpoint:
- Vercel preview auto-deploy stopped surfacing new branch deployments after the earlier preview-comments incompatibility. Repo configuration now disables Preview Feedback (`VERCEL_PREVIEW_FEEDBACK_ENABLED=0`), pins the Next.js workspace/output, uses locked npm dependencies, and includes public Supabase runtime configuration. Verify on the next production/preview deployment before calling Vercel green.
- Server-only `SUPABASE_SECRET_KEY` is intentionally not committed. Superadmin privileged writes require a server-secret configured outside git before those mutations can be enabled in production.

Later-phase infrastructure, not blockers for the current foundation release:
- GPU provider plus exact model revisions/licenses/quantization/runtime images.
- Sandbox execution infrastructure and controlled egress enforcement.
- Full file-processing/report/email workers.
- Model/tool/load/backup-restore/DR eval suites tied to those later services.