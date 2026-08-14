# ADR 0003 — Multi-model routing

**Status:** accepted

VEXONYX addresses models through stable internal roles and aliases rather than provider-specific endpoints. Routing starts deterministic: small internal tasks, general work, security workflows and heavy escalation each have explicit primary/fallback/escalation behavior. Every decision records router version, task type, chosen model and reason. Model output never changes permissions, authorization or scope. This keeps quality/cost measurable and lets model versions change without rewriting product workflows.