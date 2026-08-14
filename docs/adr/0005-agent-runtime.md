# ADR 0005 — Agent runtime

**Status:** accepted

An agent run is persistent application state, not an in-memory model loop. `ai.agent_runs`, steps and checkpoints hold the authoritative lifecycle. Limits cover steps, duration, tokens, tool calls and cost. Meaningful steps are checkpointed with exact model/prompt/tool versions. Resume must be idempotent and must never repeat an external side effect merely because a worker restarted.