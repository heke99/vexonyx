create policy report_sections_delete_member on reports.report_sections for delete to authenticated using (operations.has_org_write(organization_id));

create or replace function reports.snapshot_report(
  p_organization_id uuid,
  p_report_id uuid
)
returns table(report_version_id uuid, version integer, content_hash text)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_report reports.reports%rowtype;
  v_version integer;
  v_content jsonb;
  v_hash text;
  v_version_id uuid;
begin
  if v_user is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not operations.has_org_write(p_organization_id) then raise exception 'forbidden' using errcode='42501'; end if;
  select * into v_report from reports.reports r where r.id=p_report_id and r.organization_id=p_organization_id for update;
  if not found then raise exception 'report_not_found' using errcode='22023'; end if;
  select coalesce(max(rv.version),0)+1 into v_version from reports.report_versions rv where rv.report_id=p_report_id and rv.organization_id=p_organization_id;
  select jsonb_build_object(
    'report',jsonb_build_object('id',v_report.id,'project_id',v_report.project_id,'engagement_id',v_report.engagement_id,'title',v_report.title,'status',v_report.status,'template_id',v_report.template_id),
    'sections',coalesce(jsonb_agg(jsonb_build_object('section_key',s.section_key,'title',s.title,'position',s.position,'content',s.content) order by s.position,s.section_key),'[]'::jsonb)
  ) into v_content from reports.report_sections s where s.report_id=p_report_id and s.organization_id=p_organization_id;
  v_hash := encode(extensions.digest(convert_to(v_content::text,'UTF8'),'sha256'),'hex');
  insert into reports.report_versions(organization_id,report_id,version,content,content_hash,created_by)
  values(p_organization_id,p_report_id,v_version,v_content,v_hash,v_user)
  returning id into v_version_id;
  update reports.reports set status='ready',updated_at=now() where id=p_report_id and organization_id=p_organization_id;
  return query select v_version_id,v_version,v_hash;
end;
$$;

create or replace function reports.request_report_export(
  p_organization_id uuid,
  p_report_id uuid,
  p_report_version_id uuid,
  p_format text,
  p_idempotency_key text
)
returns table(export_id uuid, job_id uuid, export_status text)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_export_id uuid;
  v_job_id uuid;
  v_status text;
  v_job_key text;
begin
  if v_user is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not operations.has_org_write(p_organization_id) then raise exception 'forbidden' using errcode='42501'; end if;
  if p_format not in ('pdf','docx','markdown','json') then raise exception 'invalid_format' using errcode='22023'; end if;
  if p_idempotency_key is null or length(p_idempotency_key)<8 or length(p_idempotency_key)>160 then raise exception 'invalid_idempotency_key' using errcode='22023'; end if;
  if not exists(select 1 from reports.report_versions rv where rv.id=p_report_version_id and rv.report_id=p_report_id and rv.organization_id=p_organization_id) then raise exception 'report_version_not_found' using errcode='22023'; end if;
  select e.id,e.status into v_export_id,v_status from reports.report_exports e where e.organization_id=p_organization_id and e.idempotency_key=p_idempotency_key;
  if v_export_id is null then
    insert into reports.report_exports(organization_id,report_id,report_version_id,format,status,requested_by,idempotency_key)
    values(p_organization_id,p_report_id,p_report_version_id,p_format,'queued',v_user,p_idempotency_key)
    returning id,status into v_export_id,v_status;
  end if;
  v_job_key := 'report-export:'||v_export_id::text;
  insert into operations.jobs(organization_id,queue_name,priority,status,payload,idempotency_key,max_attempts)
  values(p_organization_id,'reports',3,'queued',jsonb_build_object('exportId',v_export_id,'reportId',p_report_id,'reportVersionId',p_report_version_id,'format',p_format,'organizationId',p_organization_id),v_job_key,5)
  on conflict(queue_name,idempotency_key) do update set updated_at=now()
  returning id into v_job_id;
  return query select v_export_id,v_job_id,v_status;
end;
$$;

revoke all on function reports.snapshot_report(uuid,uuid) from public,anon;
revoke all on function reports.request_report_export(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function reports.snapshot_report(uuid,uuid) to authenticated,service_role;
grant execute on function reports.request_report_export(uuid,uuid,uuid,text,text) to authenticated,service_role;
