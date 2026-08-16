# Decisions

- PostgreSQL is the durable source of truth; queue/cache/worker infrastructure is replaceable.
- Supabase managed `storage` schema is not modified. Custom file metadata uses `artifacts.*`; binaries use Supabase Storage.
- Authorization and engagement scope are admin-controlled and cannot be model-authorized.
- Authenticated clients can read permitted AI/file-processing state but cannot fabricate trusted AI/tool/quarantine/control-plane records.
- Control-plane operations/audit/policy tables are server/service-role controlled unless an explicit narrow RLS contract exists.
- External tools, sandbox scheduling, external network and real model execution default disabled and are independent gates.
- Real models remain unverified/off until exact revision, license, runtime artifact, eval evidence and healthy deployment are pinned.
- Models are product aliases behind a router. The client never selects or calls an inference endpoint directly.
- Agents are versioned configuration profiles, not hardcoded separate products. Profile versions pin instructions, autonomy, sandbox/network posture, model preferences and tool assignments.
- Effective capability is the intersection of platform enforcement, user permission, model entitlement, agent capability, tool capability, editable policy, engagement authorization/scope and runtime state.
- Editable policy hierarchy is global → plan → organization → workspace → agent → run. Lower scopes may refine editable policy but cannot bypass platform incident mode, kill switches, tenant isolation, authorization, target scope, secret isolation or sandbox boundaries.
- `policies.evaluate_action` is deterministic structured data. Arbitrary JSON conditions are stored/versioned but never interpreted as executable code. New condition operators must be explicitly implemented and tested.
- Tool policy is evaluated only after immutable tool preflight checks. Policy cannot turn an out-of-scope or unauthorized target into an allowed one.
- Specific model selection is shown only when the model is enabled and the current organization or active plan has an explicit entitlement.
- External files, web pages, repositories and retrieved memory are content, not higher-priority instructions. Memory records carry trust, sensitivity and instruction-authority metadata.
- Production agents do not rewrite their own prompts, policies, routes or weights directly. Learning produces candidates that require evaluation and shadow/canary promotion with rollback.
- Seeded security tools are definitions only. They remain disabled until worker/sandbox/network infrastructure is independently ready and verified.
- Supabase unused-index notices are not grounds for speculative index deletion in a low-traffic system; remove indexes only with workload evidence.