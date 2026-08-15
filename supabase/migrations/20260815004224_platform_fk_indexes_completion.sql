-- Cover foreign keys introduced by the commerce, integrations, marketing and worker domains.
create index if not exists parser_jobs_requested_by_idx on artifacts.parser_jobs(requested_by) where requested_by is not null;
create index if not exists credit_ledger_user_id_idx on billing.credit_ledger(user_id) where user_id is not null;
create index if not exists subscription_history_plan_id_idx on billing.subscription_history(plan_id) where plan_id is not null;
create index if not exists subscription_history_subscription_id_idx on billing.subscription_history(subscription_id) where subscription_id is not null;
create index if not exists installations_catalog_id_idx on integrations.installations(catalog_id);
create index if not exists installations_installed_by_idx on integrations.installations(installed_by);
create index if not exists audience_waitlist_entry_id_idx on marketing.audience_members(waitlist_entry_id) where waitlist_entry_id is not null;
create index if not exists broadcasts_created_by_idx on marketing.broadcasts(created_by) where created_by is not null;
create index if not exists marketing_exports_requested_by_idx on marketing.exports(requested_by) where requested_by is not null;
create index if not exists render_jobs_requested_by_idx on reports.render_jobs(requested_by) where requested_by is not null;
