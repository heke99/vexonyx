-- Complete the production domain/control-plane model required by VEXONYX v3.0.

do $$ begin
  create type security.approval_status as enum ('pending','approved','rejected','cancelled','expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type operations.job_status as enum ('queued','leased','running','succeeded','failed','cancelled','dead_letter');
exception when duplicate_object then null; end $$;

do $$ begin
  create type operations.data_classification as enum ('public','internal','confidential','restricted','secret');
exception when duplicate_object then null; end $$;

create or replace function security.normalize_scope_value(p_type security.scope_type, p_value text)
returns text language plpgsql immutable set search_path='' as $$
declare v text := btrim(p_value);
begin
  if v = '' then raise exception 'scope_value_required' using errcode='22023'; end if;
  case p_type
    when 'domain' then
      v := lower(trim(trailing '.' from v));
      if v !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$' then raise exception 'invalid_domain' using errcode='22023'; end if;
      return v;
    when 'subdomain' then
      v := lower(trim(trailing '.' from v));
      if v !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$' then raise exception 'invalid_subdomain' using errcode='22023'; end if;
      return v;
    when 'ip' then return host(v::inet);
    when 'cidr' then return v::cidr::text;
    else return v;
  end case;
end $$;

create or replace function security.normalize_scope_record()
returns trigger language plpgsql set search_path='' as $$
begin
  new.normalized_value := security.normalize_scope_value(new.type,new.value);
  return new;
end $$;

create trigger normalize_scope_record before insert or update of type,value on security.engagement_scope
for each row execute function security.normalize_scope_record();

update security.engagement_scope set normalized_value=security.normalize_scope_value(type,value) where normalized_value is distinct from security.normalize_scope_value(type,value);

create or replace function security.authorization_is_active(p_organization_id uuid,p_engagement_id uuid,p_at timestamptz default now())
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from security.authorization_records a
    where a.organization_id=p_organization_id and a.engagement_id=p_engagement_id and a.status='active'
      and (a.valid_from is null or a.valid_from<=p_at)
      and (a.valid_until is null or a.valid_until>p_at)
  )
$$;
revoke all on function security.authorization_is_active(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function security.authorization_is_active(uuid,uuid,timestamptz) to service_role;

create table security.approval_requests(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references app.organizations(id) on delete cascade,
  project_id uuid not null references app.projects(id) on delete cascade, engagement_id uuid references security.engagements(id) on delete cascade,
  agent_run_id uuid references ai.agent_runs(id) on delete cascade, tool_run_id uuid references ai.tool_runs(id) on delete cascade,
  operation_type text not null, reason text, payload jsonb not null default '{}'::jsonb,
  status security.approval_status not null default 'pending', requested_by uuid not null references auth.users(id), reviewed_by uuid references auth.users(id),
  requested_at timestamptz not null default now(), reviewed_at timestamptz, expires_at timestamptz, decision_note text,
  constraint approval_review_consistency check ((status='pending' and reviewed_at is null) or status<>'pending')
);
create index approval_requests_org_status_idx on security.approval_requests(organization_id,status,requested_at desc);
create index approval_requests_run_idx on security.approval_requests(agent_run_id) where agent_run_id is not null;
create index approval_requests_tool_idx on security.approval_requests(tool_run_id) where tool_run_id is not null;
create index approval_requests_requested_by_idx on security.approval_requests(requested_by);
create index approval_requests_reviewed_by_idx on security.approval_requests(reviewed_by) where reviewed_by is not null;

create table ai.model_capabilities(id uuid primary key default gen_random_uuid(),model_version_id uuid not null references ai.model_versions(id) on delete cascade,capability text not null,enabled boolean not null default true,metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),unique(model_version_id,capability));
create index model_capabilities_version_idx on ai.model_capabilities(model_version_id);
create table ai.model_evaluations(id uuid primary key default gen_random_uuid(),model_version_id uuid not null references ai.model_versions(id) on delete cascade,suite_id text not null,suite_version text not null,environment text not null default 'controlled_lab',status text not null check(status in ('queued','running','passed','failed','cancelled')),score numeric(10,4),metrics jsonb not null default '{}'::jsonb,artifact_ref text,started_at timestamptz,completed_at timestamptz,created_at timestamptz not null default now());
create index model_evaluations_version_suite_idx on ai.model_evaluations(model_version_id,suite_id,created_at desc);
create table ai.tool_definitions(id uuid primary key default gen_random_uuid(),name text not null,version text not null,category text not null,input_schema jsonb not null,output_schema jsonb not null,input_schema_version text not null,required_permissions text[] not null default '{}',requires_project boolean not null default true,requires_scope boolean not null default true,requires_approval boolean not null default false,execution_environment text not null default 'sandbox',timeout_seconds integer not null default 300 check(timeout_seconds between 1 and 3600),max_output_bytes bigint not null default 1048576 check(max_output_bytes>0),cost_class text not null default 'medium',enabled boolean not null default false,created_at timestamptz not null default now(),retired_at timestamptz,unique(name,version));
create index tool_definitions_enabled_idx on ai.tool_definitions(enabled,name);

create table operations.jobs(id uuid primary key default gen_random_uuid(),organization_id uuid references app.organizations(id) on delete cascade,queue_name text not null check(queue_name in ('inference','file-processing','embedding','sandbox','reports','email','usage','maintenance')),priority smallint not null default 2 check(priority between 0 and 4),status operations.job_status not null default 'queued',payload jsonb not null default '{}'::jsonb,idempotency_key text not null,max_attempts integer not null default 5 check(max_attempts between 1 and 50),attempt_count integer not null default 0 check(attempt_count>=0),available_at timestamptz not null default now(),lease_owner text,lease_generation bigint not null default 0,lease_expires_at timestamptz,last_error jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),completed_at timestamptz,unique(queue_name,idempotency_key));
create index jobs_claim_idx on operations.jobs(queue_name,status,priority,available_at,created_at); create index jobs_lease_idx on operations.jobs(status,lease_expires_at) where status in ('leased','running'); create index jobs_org_idx on operations.jobs(organization_id,created_at desc) where organization_id is not null;
create table operations.job_attempts(id uuid primary key default gen_random_uuid(),job_id uuid not null references operations.jobs(id) on delete cascade,attempt integer not null check(attempt>0),lease_generation bigint not null,worker_id text not null,status text not null check(status in ('started','succeeded','failed','cancelled','lease_lost')),error jsonb,started_at timestamptz not null default now(),completed_at timestamptz,unique(job_id,attempt)); create index job_attempts_job_idx on operations.job_attempts(job_id,attempt desc);
create table operations.sandbox_jobs(id uuid primary key default gen_random_uuid(),organization_id uuid not null references app.organizations(id) on delete cascade,project_id uuid not null references app.projects(id) on delete cascade,engagement_id uuid not null references security.engagements(id) on delete cascade,tool_run_id uuid not null unique references ai.tool_runs(id) on delete cascade,status text not null default 'queued' check(status in ('queued','allocating','running','collecting','succeeded','failed','cancelled','destroyed')),sandbox_identity text,image_version text not null,image_digest text not null,cpu_limit_millis integer not null check(cpu_limit_millis>0),memory_limit_mb integer not null check(memory_limit_mb>0),disk_limit_mb integer not null check(disk_limit_mb>0),timeout_seconds integer not null check(timeout_seconds between 1 and 3600),egress_policy jsonb not null default '{}'::jsonb,started_at timestamptz,destroyed_at timestamptz,created_at timestamptz not null default now()); create index sandbox_jobs_status_idx on operations.sandbox_jobs(status,created_at); create index sandbox_jobs_org_idx on operations.sandbox_jobs(organization_id,created_at desc);
create table operations.network_logs(id uuid primary key default gen_random_uuid(),organization_id uuid not null references app.organizations(id) on delete cascade,tool_run_id uuid not null references ai.tool_runs(id) on delete cascade,requested_hostname text,resolved_address inet,destination_port integer check(destination_port between 1 and 65535),decision text not null check(decision in ('allowed','blocked')),reason text,created_at timestamptz not null default now()); create index network_logs_tool_idx on operations.network_logs(tool_run_id,created_at); create index network_logs_org_idx on operations.network_logs(organization_id,created_at desc);

create table reports.report_templates(id uuid primary key default gen_random_uuid(),organization_id uuid not null references app.organizations(id) on delete cascade,name text not null,description text,definition jsonb not null,is_default boolean not null default false,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,name)); create index report_templates_org_idx on reports.report_templates(organization_id,updated_at desc);
create table reports.report_exports(id uuid primary key default gen_random_uuid(),organization_id uuid not null references app.organizations(id) on delete cascade,report_id uuid not null references reports.reports(id) on delete cascade,report_version_id uuid references reports.report_versions(id) on delete set null,format text not null check(format in ('pdf','docx','markdown','json')),status text not null default 'queued' check(status in ('queued','processing','ready','failed','expired')),storage_file_id uuid references artifacts.files(id) on delete set null,idempotency_key text not null,requested_by uuid not null references auth.users(id),created_at timestamptz not null default now(),completed_at timestamptz,unique(organization_id,idempotency_key)); create index report_exports_report_idx on reports.report_exports(report_id,created_at desc); create index report_exports_org_status_idx on reports.report_exports(organization_id,status,created_at desc);
alter table reports.reports drop column if exists template_id; alter table reports.reports add column template_id uuid references reports.report_templates(id) on delete set null; create index reports_template_idx on reports.reports(template_id) where template_id is not null;

create table usage.usage_monthly(organization_id uuid not null references app.organizations(id) on delete cascade,month_start date not null check(date_trunc('month',month_start)::date=month_start),metric text not null,quantity numeric(24,6) not null default 0,cost numeric(24,8) not null default 0,updated_at timestamptz not null default now(),primary key(organization_id,month_start,metric));
create table billing.entitlements(id uuid primary key default gen_random_uuid(),organization_id uuid not null references app.organizations(id) on delete cascade,key text not null,value jsonb not null,source text not null default 'plan',starts_at timestamptz,ends_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,key)); create index entitlements_org_idx on billing.entitlements(organization_id,key);
create table billing.events(id uuid primary key default gen_random_uuid(),organization_id uuid not null references app.organizations(id) on delete cascade,event_type text not null,external_id text,payload jsonb not null default '{}'::jsonb,occurred_at timestamptz not null default now(),created_at timestamptz not null default now(),unique(event_type,external_id)); create index billing_events_org_idx on billing.events(organization_id,occurred_at desc);

create table app.api_clients(id uuid primary key default gen_random_uuid(),organization_id uuid not null references app.organizations(id) on delete cascade,name text not null,created_by uuid not null references auth.users(id),status text not null default 'active' check(status in ('active','disabled','revoked')),scopes text[] not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now()); create index api_clients_org_idx on app.api_clients(organization_id,created_at desc);
create table app.api_keys(id uuid primary key default gen_random_uuid(),organization_id uuid not null references app.organizations(id) on delete cascade,client_id uuid not null references app.api_clients(id) on delete cascade,key_prefix text not null,key_hash text not null unique,created_by uuid not null references auth.users(id),last_used_at timestamptz,expires_at timestamptz,revoked_at timestamptz,created_at timestamptz not null default now()); create index api_keys_client_idx on app.api_keys(client_id,created_at desc); create index api_keys_org_idx on app.api_keys(organization_id,created_at desc);
create table launch.waitlist_verification_tokens(id uuid primary key default gen_random_uuid(),entry_id uuid not null references launch.waitlist_entries(id) on delete cascade,token_hash text not null unique,expires_at timestamptz not null,consumed_at timestamptz,created_at timestamptz not null default now()); create index waitlist_verification_entry_idx on launch.waitlist_verification_tokens(entry_id,created_at desc);

alter table artifacts.files add column if not exists classification operations.data_classification not null default 'confidential'; alter table security.authorization_records add column if not exists classification operations.data_classification not null default 'restricted'; alter table security.finding_evidence add column if not exists classification operations.data_classification not null default 'confidential'; alter table ai.memory_items add column if not exists classification operations.data_classification not null default 'confidential';

do $tenant$ declare r record;begin for r in select * from (values ('security','approval_requests'),('reports','report_templates'),('reports','report_exports'),('usage','usage_monthly'),('billing','entitlements'),('billing','events'),('app','api_clients'),('app','api_keys')) as t(s,n) loop execute format('alter table %I.%I enable row level security',r.s,r.n); execute format('create policy %I on %I.%I for select to authenticated using (operations.is_org_member(organization_id))',r.n||'_tenant_select',r.s,r.n); end loop;end $tenant$;
create policy approval_insert_member on security.approval_requests for insert to authenticated with check(operations.has_org_write(organization_id) and requested_by=(select auth.uid()) and status='pending'); create policy approval_update_admin on security.approval_requests for update to authenticated using(operations.has_org_admin(organization_id)) with check(operations.has_org_admin(organization_id));
create policy templates_insert_member on reports.report_templates for insert to authenticated with check(operations.has_org_write(organization_id) and created_by=(select auth.uid())); create policy templates_update_member on reports.report_templates for update to authenticated using(operations.has_org_write(organization_id)) with check(operations.has_org_write(organization_id)); create policy templates_delete_admin on reports.report_templates for delete to authenticated using(operations.has_org_admin(organization_id));
create policy exports_insert_member on reports.report_exports for insert to authenticated with check(operations.has_org_write(organization_id) and requested_by=(select auth.uid()) and status='queued');
create policy api_clients_insert_admin on app.api_clients for insert to authenticated with check(operations.has_org_admin(organization_id) and created_by=(select auth.uid())); create policy api_clients_update_admin on app.api_clients for update to authenticated using(operations.has_org_admin(organization_id)) with check(operations.has_org_admin(organization_id)); create policy api_clients_delete_admin on app.api_clients for delete to authenticated using(operations.has_org_admin(organization_id));
alter table ai.model_capabilities enable row level security; alter table ai.model_evaluations enable row level security; alter table ai.tool_definitions enable row level security; alter table operations.jobs enable row level security; alter table operations.job_attempts enable row level security; alter table operations.sandbox_jobs enable row level security; alter table operations.network_logs enable row level security; alter table launch.waitlist_verification_tokens enable row level security;
revoke all on ai.model_capabilities,ai.model_evaluations,ai.tool_definitions from anon,authenticated; revoke all on operations.jobs,operations.job_attempts,operations.sandbox_jobs,operations.network_logs from anon,authenticated; revoke all on launch.waitlist_verification_tokens from anon,authenticated;
grant select,insert,update on security.approval_requests to authenticated; grant select,insert,update,delete on reports.report_templates to authenticated; grant select,insert on reports.report_exports to authenticated; grant select on usage.usage_monthly,billing.entitlements,billing.events to authenticated; grant select,insert,update,delete on app.api_clients to authenticated; grant select(id,organization_id,client_id,key_prefix,created_by,last_used_at,expires_at,revoked_at,created_at) on app.api_keys to authenticated;
grant all on ai.model_capabilities,ai.model_evaluations,ai.tool_definitions to service_role; grant all on operations.jobs,operations.job_attempts,operations.sandbox_jobs,operations.network_logs to service_role; grant all on launch.waitlist_verification_tokens to service_role; grant all on security.approval_requests,reports.report_templates,reports.report_exports,usage.usage_monthly,billing.entitlements,billing.events,app.api_clients,app.api_keys to service_role;
create trigger touch_updated_at before update on operations.jobs for each row execute function operations.touch_updated_at(); create trigger touch_updated_at before update on reports.report_templates for each row execute function operations.touch_updated_at(); create trigger touch_updated_at before update on billing.entitlements for each row execute function operations.touch_updated_at(); create trigger touch_updated_at before update on app.api_clients for each row execute function operations.touch_updated_at();
notify pgrst,'reload schema';
