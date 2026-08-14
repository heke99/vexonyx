# Decisions

- PostgreSQL is durable source of truth; queue/cache are replaceable.
- Supabase managed `storage` schema is not modified. Custom file metadata uses `artifacts.*`; binaries use Supabase Storage.
- Authorization and engagement scope are admin-controlled and cannot be model-authorized.
- Authenticated clients can read AI/file-processing state but cannot fabricate trusted AI/tool/quarantine records.
- Control-plane operations/audit schemas are PostgREST reachable only for server/service-role access; anon/authenticated have no schema grants.
- External tools, sandbox scheduling and network execution default disabled.
- Real models remain unverified/off until revisions/licenses/runtime artifacts and evals are pinned.
