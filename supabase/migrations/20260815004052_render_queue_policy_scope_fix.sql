-- Fix correlated report-render authorization so the report must belong to the same organization as the queued render job.
drop policy if exists render_jobs_tenant_insert on reports.render_jobs;
create policy render_jobs_tenant_insert on reports.render_jobs
for insert to authenticated
with check (
  operations.has_org_write(reports.render_jobs.organization_id)
  and reports.render_jobs.requested_by = (select auth.uid())
  and exists (
    select 1
    from reports.reports r
    where r.id = reports.render_jobs.report_id
      and r.organization_id = reports.render_jobs.organization_id
  )
);
