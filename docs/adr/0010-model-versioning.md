# ADR 0010 — Model versioning

**Status:** accepted

A production model is an immutable versioned artifact, not a floating repository alias. Source repository, pinned revision, quantization, context window, runtime, license and configuration are recorded. Quantizations are distinct versions. Promotion follows downloaded → validated → evaluated → internal → canary → partial → production, with the previous good version retained for rollback.