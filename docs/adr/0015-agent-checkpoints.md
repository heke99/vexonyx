# ADR 0015 — Agent checkpoints and replay safety

Status: accepted.

Meaningful run steps persist state, versions, observations, usage and budget. External side effects require idempotency keys. Worker leases will use fencing generations so a resumed worker cannot silently duplicate a prior side effect.
