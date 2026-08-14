# Pre-GPU readiness gate

The pre-GPU gate exists to prevent model deployment from hiding missing product/security foundations.

Required before embeddings or generative GPU rollout:
- repository/CI and environment separation;
- PostgreSQL source of truth, migrations, RLS and organization integrity;
- marketing/hero/waitlist including email-verification path;
- authenticated application workspace with projects, engagements, scope, authorization, files, notes, findings, evidence, reports, team, usage and admin;
- mock AI interface plus provider-neutral inference/context/memory/queue/tool/usage contracts;
- persistent agent state/checkpoints, budgets, queue leases/fencing and emergency controls;
- quarantine-first file handling with bounded parsers and provenance;
- clean lint/typecheck/tests/build and clean migration replay.

Not part of this gate by design: real embeddings, GPU checkpoint downloads, active external tool execution, sandbox network execution, GLM escalation, model canaries/evals against real checkpoints, GPU load tests and GPU disaster-recovery drills. Those begin only after this gate is green and follow the rollout order in the master specification.