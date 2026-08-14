# ADR 0007 — Sandbox boundary

**Status:** accepted

External security tools execute in isolated ephemeral environments, never on Vercel and never on the inference host. Sandboxes receive no production credentials, Docker socket or privileged mode. CPU, RAM, disk, runtime and network are bounded. Base images are versioned and digest-pinned before production. Sandboxes are destroyed after jobs and their artifacts are ingested through controlled storage paths.