-- Consistency hardening for commerce, audience and worker domains.

alter table billing.events
  add column if not exists processed_at timestamptz,
  add column if not exists processing_error text;
create index if not exists billing_events_unprocessed_idx on billing.events(created_at) where processed_at is null;

-- Cover the composite project/org FK in generation_requests and remove one exact duplicate index.
create index if not exists generation_requests_project_org_fk_idx on ai.generation_requests(project_id,organization_id) where project_id is not null;
drop index if exists ai.generation_requests_conversation_created_idx;

-- Explicit service-role privileges for all new server-managed domains.
grant all on billing.plan_prices,billing.plan_entitlements,billing.billing_customers,billing.credit_products,billing.credit_accounts,billing.credit_ledger,billing.payment_transactions,billing.subscription_history,billing.credit_rates to service_role;
grant all on reports.render_jobs,artifacts.parser_jobs to service_role;

-- Keep public catalog visibility limited to authenticated app users; the plan table itself remains service-managed.
create policy plans_authenticated_select on billing.plans for select to authenticated using(status in ('active','draft'));
grant select on billing.plans to authenticated;

-- A single normalized audience record follows waitlist lifecycle changes without assuming marketing consent.
create or replace function marketing.sync_waitlist_audience()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_stage text;
begin
  v_stage := case
    when new.converted_user_id is not null or new.status='converted' then 'customer'
    when new.status='invited' then 'invited'
    else 'waitlist'
  end;
  insert into marketing.audience_members(email_normalized,email,user_id,waitlist_entry_id,name,company,lifecycle_stage,marketing_consent,source,metadata,updated_at)
  values(new.email_normalized,new.email,new.converted_user_id,new.id,new.name,new.company,v_stage,false,new.source,jsonb_build_object('waitlist_status',new.status),now())
  on conflict(email_normalized) do update set
    email=excluded.email,
    user_id=coalesce(excluded.user_id,marketing.audience_members.user_id),
    waitlist_entry_id=excluded.waitlist_entry_id,
    name=coalesce(excluded.name,marketing.audience_members.name),
    company=coalesce(excluded.company,marketing.audience_members.company),
    lifecycle_stage=excluded.lifecycle_stage,
    source=coalesce(excluded.source,marketing.audience_members.source),
    metadata=marketing.audience_members.metadata || excluded.metadata,
    updated_at=now();
  return new;
end $$;
revoke all on function marketing.sync_waitlist_audience() from public,anon,authenticated;

drop trigger if exists sync_waitlist_audience on launch.waitlist_entries;
create trigger sync_waitlist_audience after insert or update of email,email_normalized,name,company,status,converted_user_id,source on launch.waitlist_entries for each row execute function marketing.sync_waitlist_audience();

insert into marketing.audience_members(email_normalized,email,user_id,waitlist_entry_id,name,company,lifecycle_stage,marketing_consent,source,metadata)
select w.email_normalized,w.email,w.converted_user_id,w.id,w.name,w.company,
  case when w.converted_user_id is not null or w.status='converted' then 'customer' when w.status='invited' then 'invited' else 'waitlist' end,
  false,w.source,jsonb_build_object('waitlist_status',w.status)
from launch.waitlist_entries w
on conflict(email_normalized) do update set
  email=excluded.email,
  user_id=coalesce(excluded.user_id,marketing.audience_members.user_id),
  waitlist_entry_id=excluded.waitlist_entry_id,
  name=coalesce(excluded.name,marketing.audience_members.name),
  company=coalesce(excluded.company,marketing.audience_members.company),
  lifecycle_stage=excluded.lifecycle_stage,
  source=coalesce(excluded.source,marketing.audience_members.source),
  metadata=marketing.audience_members.metadata || excluded.metadata,
  updated_at=now();

-- Map Stripe's broader state vocabulary into VEXONYX's stable lifecycle states in application code.
-- Preserve one active subscription per organization as the product source of truth.
create unique index if not exists subscriptions_org_uidx on billing.subscriptions(organization_id);

-- Useful Superadmin/customer dashboard access patterns.
create index if not exists subscriptions_org_status_idx on billing.subscriptions(organization_id,status,current_period_end desc);
create index if not exists payment_transactions_user_created_idx on billing.payment_transactions(user_id,created_at desc) where user_id is not null;
create index if not exists audience_user_idx on marketing.audience_members(user_id) where user_id is not null;
create index if not exists parser_jobs_file_status_idx on artifacts.parser_jobs(file_id,status,created_at desc);
create index if not exists render_jobs_org_status_idx on reports.render_jobs(organization_id,status,created_at desc);
