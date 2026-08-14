# ADR 0002 — Supabase portability

Status: accepted.

Business logic depends on Postgres/Auth/Storage interfaces rather than embedding provider-specific assumptions across UI components. Schema migrations remain standard SQL so a future independent PostgreSQL cutover can be validated and rehearsed.
