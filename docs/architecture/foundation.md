# VEXONYX foundation

VEXONYX is a security operating environment, not a model wrapper. PostgreSQL is durable state; queue/cache providers are replaceable. Browser clients only reach VEXONYX web/API and never GPU or tool runners directly. AI inference and active tool execution are separate trust boundaries.

## Current phase

Foundation through mock inference is implemented. Real GPU inference, tool gateway execution and sandbox scheduling remain deliberately disabled until model supply-chain verification, evals, network policy, approval gates and recovery tests pass.

## Supabase storage deviation

Supabase owns its managed `storage` schema. Custom file metadata therefore lives in `artifacts.*`; binaries use a private `project-artifacts` bucket. This preserves the specification's logical boundary without mutating Supabase-managed schema internals.
