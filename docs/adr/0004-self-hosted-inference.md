# ADR 0004 — Self-hosted inference

**Status:** accepted

Generative inference and embeddings are reached only through the VEXONYX inference interface. Browsers never call GPU endpoints directly and Vercel never hosts GPU workloads. GPU endpoints must be authenticated and non-public where practical. The application contract is provider-neutral (`generate`, `stream`, `health`, `embed`). Mock inference remains the default development path until the pre-GPU gate is complete.