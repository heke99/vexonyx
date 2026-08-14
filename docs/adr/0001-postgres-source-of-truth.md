# ADR 0001 — PostgreSQL is durable source of truth

Status: accepted.

Agent state, tenant entities, authorization, findings, usage and audit history persist in PostgreSQL. Cache and queue implementations may accelerate work but cannot become the authoritative durable record.
