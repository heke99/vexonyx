-- VEXONYX platform commerce, entitlements, connectors and pre-GPU completion.
-- Provider-neutral product state; payment execution remains fail-closed until configured.

create schema if not exists integrations;
create schema if not exists marketing;
revoke all on schema marketing from public, anon, authenticated;

alter table billing.plans
  add column if not exists description text,
  add column if not exists display_order integer not null default 100,
  add column if not exists is_public boolean not null default false,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table billing.subscriptions
  add column if not exists provider text,
  add column if not exists provider_subscription_id text,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists cancelled_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;
create unique index if not exists subscriptions_provider_external_uidx
  on billing.subscriptions(provider, provider_subscription_id)
  where provider is not null and provider_subscription_id is not null;
create index if not exists subscriptions_status_period_idx on billing.subscriptions(status,current_period_end);

create table if not exists billing.plan_prices(
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references billing.plans(id) on delete cascade,
  billing_interval text not null check(billing_interval in ('month','year')),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  unit_amount_minor bigint not null check(unit_amount_minor >= 0),
  provider text not null default 'stripe',
  provider_price_id text,
  active boolean not null default false,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  unique(plan_id,billing_interval,currency,effective_from)
);
create unique index if not exists plan_prices_provider_uidx on billing.plan_prices(provider,provider_price_id) where provider_price_id is not null;
create index if not exists plan_prices_public_lookup_idx on billing.plan_prices(plan_id,active,billing_interval,currency,effective_from desc);

create table if not exists billing.plan_entitlements(
  plan_id uuid not null references billing.plans(id) on delete cascade,
  entitlement_key text not null,
  entitlement_value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(plan_id,entitlement_key)
);

create table if not exists billing.billing_customers(
  organization_id uuid primary key references app.organizations(id) on delete cascade,
  provider text not null default 'stripe',
  provider_customer_id text not null,
  billing_email text,
  tax_country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,provider_customer_id)
);

create table if not exists billing.credit_products(
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  credits bigint not null check(credits > 0),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  unit_amount_minor bigint not null check(unit_amount_minor > 0),
  provider text not null default 'stripe',
  provider_price_id text,
  active boolean not null default false,
  display_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists credit_products_provider_uidx on billing.credit_products(provider,provider_price_id) where provider_price_id is not null;

create table if not exists billing.credit_accounts(
  organization_id uuid primary key references app.organizations(id) on delete cascade,
  balance bigint not null default 0 check(balance >= 0),
  lifetime_purchased bigint not null default 0 check(lifetime_purchased >= 0),
  lifetime_granted bigint not null default 0 check(lifetime_granted >= 0),
  lifetime_consumed bigint not null default 0 check(lifetime_consumed >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists billing.credit_ledger(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  entry_type text not null check(entry_type in ('purchase','plan_grant','usage','admin_adjustment','refund','expiry','reversal')),
  amount bigint not null check(amount <> 0),
  balance_after bigint not null check(balance_after >= 0),
  idempotency_key text not null,
  external_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(organization_id,idempotency_key)
);
create index if not exists credit_ledger_org_created_idx on billing.credit_ledger(organization_id,created_at desc,id desc);

create table if not exists billing.payment_transactions(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  provider text not null,
  provider_transaction_id text not null,
  kind text not null check(kind in ('subscription','credit_pack','invoice','refund','adjustment')),
  status text not null check(status in ('pending','succeeded','failed','refunded','partially_refunded','cancelled')),
  amount_minor bigint not null default 0,
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  credits bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(provider,provider_transaction_id)
);
create index if not exists payment_transactions_org_created_idx on billing.payment_transactions(organization_id,created_at desc);
create index if not exists payment_transactions_status_idx on billing.payment_transactions(status,created_at desc);

create table if not exists billing.subscription_history(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  subscription_id uuid references billing.subscriptions(id) on delete set null,
  plan_id uuid references billing.plans(id) on delete set null,
  event_type text not null,
  previous_status text,
  new_status text,
  provider_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists subscription_history_org_created_idx on billing.subscription_history(organization_id,created_at desc);

create table if not exists integrations.catalog(
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check(slug ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  kind text not null check(kind in ('connector','plugin')),
  name text not null,
  description text,
  auth_type text not null check(auth_type in ('oauth2','api_key','service_account','none')),
  capabilities text[] not null default '{}',
  required_scopes text[] not null default '{}',
  status text not null default 'planned' check(status in ('planned','private_beta','active','deprecated','disabled')),
  icon_key text,
  config_schema jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists integrations.installations(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  catalog_id uuid not null references integrations.catalog(id) on delete restrict,
  installed_by uuid not null references auth.users(id),
  status text not null default 'pending' check(status in ('pending','connected','disabled','error','revoked')),
  display_name text,
  provider_account_ref text,
  granted_scopes text[] not null default '{}',
  config jsonb not null default '{}'::jsonb,
  last_success_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,catalog_id,provider_account_ref)
);
create index if not exists installations_org_status_idx on integrations.installations(organization_id,status,updated_at desc);

create table if not exists integrations.secret_refs(
  installation_id uuid primary key references integrations.installations(id) on delete cascade,
  secret_backend text not null default 'supabase_vault',
  secret_reference text not null,
  rotated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
revoke all on integrations.secret_refs from public,anon,authenticated;

create table if not exists marketing.audience_members(
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null unique,
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  waitlist_entry_id uuid references launch.waitlist_entries(id) on delete set null,
  name text,
  company text,
  lifecycle_stage text not null default 'lead' check(lifecycle_stage in ('lead','waitlist','invited','customer','churned','blocked')),
  transactional_allowed boolean not null default true,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  unsubscribed_at timestamptz,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists audience_stage_created_idx on marketing.audience_members(lifecycle_stage,created_at desc);
create index if not exists audience_marketing_idx on marketing.audience_members(marketing_consent,unsubscribed_at) where marketing_consent;

create table if not exists marketing.exports(
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete set null,
  export_type text not null check(export_type in ('waitlist','users','customers','audience')),
  filters jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check(status in ('queued','running','ready','failed','expired')),
  storage_path text,
  row_count integer,
  expires_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists marketing_exports_status_idx on marketing.exports(status,created_at desc);

create table if not exists marketing.broadcasts(
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  provider text not null default 'resend',
  audience_filter jsonb not null default '{}'::jsonb,
  subject text not null,
  template_key text,
  status text not null default 'draft' check(status in ('draft','scheduled','sending','sent','cancelled','failed')),
  scheduled_at timestamptz,
  provider_broadcast_id text,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists broadcasts_status_scheduled_idx on marketing.broadcasts(status,scheduled_at);

create table if not exists reports.render_jobs(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  report_id uuid not null references reports.reports(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  format text not null check(format in ('pdf','docx')),
  renderer_version text not null,
  status text not null default 'queued' check(status in ('queued','leased','rendering','ready','failed','dead_letter')),
  input_snapshot jsonb not null,
  output_storage_path text,
  sha256 text,
  attempt_count integer not null default 0 check(attempt_count >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists render_jobs_queue_idx on reports.render_jobs(status,created_at) where status in ('queued','failed');
create index if not exists render_jobs_report_idx on reports.render_jobs(report_id,created_at desc);

create table if not exists artifacts.parser_jobs(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  file_id uuid not null references artifacts.files(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  parser_profile text not null,
  parser_version text not null,
  status text not null default 'queued' check(status in ('queued','leased','parsing','ready','blocked','failed','dead_letter')),
  network_policy text not null default 'deny_all' check(network_policy in ('deny_all')),
  max_cpu_seconds integer not null default 30 check(max_cpu_seconds between 1 and 300),
  max_memory_mb integer not null default 512 check(max_memory_mb between 64 and 4096),
  max_output_bytes bigint not null default 10485760 check(max_output_bytes between 1024 and 104857600),
  attempt_count integer not null default 0 check(attempt_count >= 0),
  output_metadata jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(file_id,parser_version)
);
create index if not exists parser_jobs_queue_idx on artifacts.parser_jobs(status,created_at) where status in ('queued','failed');
create index if not exists parser_jobs_org_created_idx on artifacts.parser_jobs(organization_id,created_at desc);

create or replace function billing.apply_credit_entry(
  p_organization_id uuid,
  p_user_id uuid,
  p_entry_type text,
  p_amount bigint,
  p_idempotency_key text,
  p_external_reference text default null,
  p_metadata jsonb default '{}'::jsonb
) returns table(ledger_id uuid,balance bigint)
language plpgsql security definer set search_path=''
as $$
declare v_account billing.credit_accounts%rowtype; v_id uuid;
begin
  if p_amount = 0 or p_entry_type not in ('purchase','plan_grant','usage','admin_adjustment','refund','expiry','reversal') then
    raise exception 'invalid_credit_entry' using errcode='22023';
  end if;
  select l.id,l.balance_after into v_id,balance from billing.credit_ledger l
    where l.organization_id=p_organization_id and l.idempotency_key=p_idempotency_key;
  if v_id is not null then ledger_id:=v_id; return next; return; end if;
  insert into billing.credit_accounts(organization_id) values(p_organization_id) on conflict do nothing;
  select * into v_account from billing.credit_accounts where organization_id=p_organization_id for update;
  if v_account.balance + p_amount < 0 then raise exception 'insufficient_credits' using errcode='P0001'; end if;
  update billing.credit_accounts set
    balance=balance+p_amount,
    lifetime_purchased=lifetime_purchased + case when p_entry_type='purchase' and p_amount>0 then p_amount else 0 end,
    lifetime_granted=lifetime_granted + case when p_entry_type in ('plan_grant','admin_adjustment') and p_amount>0 then p_amount else 0 end,
    lifetime_consumed=lifetime_consumed + case when p_entry_type='usage' and p_amount<0 then -p_amount else 0 end,
    updated_at=now()
    where organization_id=p_organization_id returning billing.credit_accounts.balance into balance;
  insert into billing.credit_ledger(organization_id,user_id,entry_type,amount,balance_after,idempotency_key,external_reference,metadata)
    values(p_organization_id,p_user_id,p_entry_type,p_amount,balance,p_idempotency_key,p_external_reference,coalesce(p_metadata,'{}'::jsonb)) returning id into ledger_id;
  return next;
end $$;
revoke all on function billing.apply_credit_entry(uuid,uuid,text,bigint,text,text,jsonb) from public,anon,authenticated;
grant execute on function billing.apply_credit_entry(uuid,uuid,text,bigint,text,text,jsonb) to service_role;

-- Seed safe catalog definitions only. Credentials and execution remain disabled.
insert into integrations.catalog(slug,kind,name,description,auth_type,capabilities,status)
values
 ('github','connector','GitHub','Repository and pull-request context for authorized code review.','oauth2',array['repositories','pull_requests','issues'],'planned'),
 ('google-drive','connector','Google Drive','Attach authorized Drive files as project context.','oauth2',array['files','search'],'planned'),
 ('slack','connector','Slack','Read approved workspace channels as project context.','oauth2',array['channels','messages'],'planned'),
 ('custom-mcp','plugin','Custom MCP','Organization-managed MCP/plugin endpoint with explicit scopes.','api_key',array['tools'],'planned')
on conflict(slug) do update set name=excluded.name,description=excluded.description,capabilities=excluded.capabilities;

-- RLS: tenant data is readable only by organization members; product catalogs are read-only.
do $rls$ declare r record; begin
  for r in select * from (values
    ('billing','billing_customers'),('billing','credit_accounts'),('billing','credit_ledger'),('billing','payment_transactions'),('billing','subscription_history'),
    ('integrations','installations'),('reports','render_jobs'),('artifacts','parser_jobs')
  ) as t(s,n) loop
    execute format('alter table %I.%I enable row level security',r.s,r.n);
    execute format('create policy %I on %I.%I for select to authenticated using (operations.is_org_member(organization_id))',r.n||'_tenant_select',r.s,r.n);
  end loop;
end $rls$;

alter table billing.plan_prices enable row level security;
alter table billing.plan_entitlements enable row level security;
alter table billing.credit_products enable row level security;
alter table integrations.catalog enable row level security;
alter table integrations.secret_refs enable row level security;
alter table marketing.audience_members enable row level security;
alter table marketing.exports enable row level security;
alter table marketing.broadcasts enable row level security;
create policy plan_prices_authenticated_select on billing.plan_prices for select to authenticated using(true);
create policy plan_entitlements_authenticated_select on billing.plan_entitlements for select to authenticated using(true);
create policy credit_products_authenticated_select on billing.credit_products for select to authenticated using(active);
create policy integrations_catalog_authenticated_select on integrations.catalog for select to authenticated using(status in ('private_beta','active','planned'));

revoke all on all tables in schema integrations from anon,authenticated;
grant usage on schema integrations to authenticated;
grant select on integrations.catalog,integrations.installations to authenticated;
grant select on billing.plan_prices,billing.plan_entitlements,billing.credit_products,billing.credit_accounts,billing.credit_ledger,billing.payment_transactions,billing.subscription_history,billing.billing_customers to authenticated;
grant select on reports.render_jobs,artifacts.parser_jobs to authenticated;

grant usage on schema integrations,marketing to service_role;
grant all on all tables in schema integrations,marketing to service_role;
grant all on all sequences in schema integrations,marketing to service_role;

-- Service-only admin/product tables. Superadmin UI accesses these via the server service-role client after step-up verification.
revoke all on all tables in schema marketing from anon,authenticated;

-- Keep generated user-facing records fast at expected scale.
create index if not exists generation_requests_org_user_created_idx on ai.generation_requests(organization_id,user_id,created_at desc);
create index if not exists agent_runs_org_user_created_idx on ai.agent_runs(organization_id,user_id,created_at desc);
create index if not exists usage_events_org_user_created_idx on usage.usage_events(organization_id,user_id,created_at desc);
create index if not exists organization_invitations_accepted_by_idx on app.organization_invitations(accepted_by) where accepted_by is not null;
create index if not exists organization_invitations_invited_by_idx on app.organization_invitations(invited_by) where invited_by is not null;

-- Updated-at triggers.
do $touch$ declare r record; begin
  for r in select * from (values
    ('billing','plan_entitlements'),('billing','billing_customers'),('billing','credit_products'),('billing','credit_accounts'),
    ('integrations','catalog'),('integrations','installations'),('integrations','secret_refs'),
    ('marketing','audience_members'),('marketing','broadcasts'),('reports','render_jobs'),('artifacts','parser_jobs')
  ) as t(s,n) loop
    execute format('create trigger touch_updated_at before update on %I.%I for each row execute function operations.touch_updated_at()',r.s,r.n);
  end loop;
end $touch$;

alter role authenticator set pgrst.db_schemas='public,app,launch,ai,security,artifacts,reports,usage,billing,integrations';
notify pgrst,'reload config';
