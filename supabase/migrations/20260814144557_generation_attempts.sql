-- Complete the generation request/attempt model required before real inference is enabled.

alter table ai.generation_requests
  add constraint generation_requests_id_org_unique unique (id, organization_id);

create table ai.generation_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  generation_request_id uuid not null,
  attempt_number integer not null check (attempt_number > 0),
  model_version_id uuid references ai.model_versions(id) on delete set null,
  model_deployment_id uuid references ai.model_deployments(id) on delete set null,
  status text not null check (status in ('queued','running','succeeded','failed','cancelled')),
  provider_request_ref text,
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  ttft_ms bigint check (ttft_ms is null or ttft_ms >= 0),
  generation_ms bigint check (generation_ms is null or generation_ms >= 0),
  cost numeric(24,8) not null default 0 check (cost >= 0),
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint generation_attempts_request_org_fk
    foreign key (generation_request_id, organization_id)
    references ai.generation_requests(id, organization_id)
    on delete cascade,
  constraint generation_attempts_request_attempt_unique
    unique (generation_request_id, attempt_number),
  constraint generation_attempts_completion_consistency check (
    (status in ('succeeded','failed','cancelled') and completed_at is not null)
    or (status in ('queued','running') and completed_at is null)
  )
);

create index generation_attempts_org_created_idx
  on ai.generation_attempts(organization_id, created_at desc);
create index generation_attempts_request_idx
  on ai.generation_attempts(generation_request_id, attempt_number desc);
create index generation_attempts_status_idx
  on ai.generation_attempts(status, created_at)
  where status in ('queued','running');
create index generation_attempts_model_version_idx
  on ai.generation_attempts(model_version_id, created_at desc)
  where model_version_id is not null;
create index generation_attempts_deployment_idx
  on ai.generation_attempts(model_deployment_id, created_at desc)
  where model_deployment_id is not null;

alter table ai.generation_attempts enable row level security;

create policy generation_attempts_org_select
  on ai.generation_attempts
  for select
  to authenticated
  using (operations.is_org_member(organization_id));

revoke all on ai.generation_attempts from anon, authenticated;
grant select on ai.generation_attempts to authenticated;
grant all on ai.generation_attempts to service_role;
