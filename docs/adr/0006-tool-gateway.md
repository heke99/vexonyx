# ADR 0006 — Tool gateway

**Status:** accepted

Tools are versioned contracts behind one enforcement gateway. Before execution the gateway resolves organization/project/engagement, validates schema and permissions, rechecks current authorization, normalizes target scope and exclusions, evaluates approvals and budgets, and only then allocates isolated execution. Tool output is untrusted input and is normalized before model use. A model request is never itself authorization.