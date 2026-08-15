-- Tenant-safe render requests and provider event deduplication.

create policy render_jobs_tenant_insert on reports.render_jobs
for insert to authenticated
with check (
  operations.has_org_write(organization_id)
  and requested_by = (select auth.uid())
  and exists (
    select 1 from reports.reports r
    where r.id = report_id and r.organization_id = organization_id
  )
);

grant insert on reports.render_jobs to authenticated;

create unique index if not exists subscription_history_provider_event_uidx
  on billing.subscription_history(provider_event_id)
  where provider_event_id is not null;
