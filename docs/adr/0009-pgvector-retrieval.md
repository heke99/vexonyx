# ADR 0009 — pgvector retrieval

**Status:** accepted

Project retrieval begins in PostgreSQL with full-text search plus pgvector. Vector rows carry organization/project/file provenance and queries are filtered server-side before similarity ranking. Global retrieval followed by browser filtering is prohibited. Embedding model version and content hash are stored with each chunk so re-embedding and invalidation remain reproducible.