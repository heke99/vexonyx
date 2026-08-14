alter table ai.agent_runs
  add column if not exists total_tokens bigint not null default 0 check (total_tokens >= 0),
  add column if not exists total_tool_calls integer not null default 0 check (total_tool_calls >= 0),
  add column if not exists total_cost numeric(12,6) not null default 0 check (total_cost >= 0);

alter table ai.agent_run_steps
  add column if not exists action jsonb,
  add column if not exists usage jsonb not null default '{}'::jsonb,
  add column if not exists budget jsonb not null default '{}'::jsonb,
  add column if not exists completed_at timestamptz;

alter table ai.tool_definitions
  add column if not exists needs_network boolean not null default false;

alter table reports.report_versions
  add column if not exists content_hash text;
