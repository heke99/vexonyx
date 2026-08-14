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
  v_snapshot jsonb;
  v_hash text;
  v_version_id uuid;
begin
  if v_user is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not operations.has_org_write(p_organization_id) then raise exception 'forbidden' using errcode='42501'; end if;

  select * into v_report
  from reports.reports r
  where r.id=p_report_id and r.organization_id=p_organization_id
  for update;
  if not found then raise exception 'report_not_found' using errcode='22023'; end if;

  select coalesce(max(rv.version),0)+1 into v_version
  from reports.report_versions rv
  where rv.report_id=p_report_id and rv.organization_id=p_organization_id;

  select jsonb_build_object(
    'report',jsonb_build_object(
      'id',v_report.id,
      'project_id',v_report.project_id,
      'engagement_id',v_report.engagement_id,
      'title',v_report.title,
      'status',v_report.status,
      'template_id',v_report.template_id
    ),
    'sections',coalesce(
      jsonb_agg(
        jsonb_build_object(
          'section_key',s.section_key,
          'title',s.title,
          'position',s.position,
          'content',s.content
        ) order by s.position,s.section_key
      ),
      '[]'::jsonb
    )
  ) into v_snapshot
  from reports.report_sections s
  where s.report_id=p_report_id and s.organization_id=p_organization_id;

  v_hash := encode(extensions.digest(convert_to(v_snapshot::text,'UTF8'),'sha256'),'hex');

  insert into reports.report_versions(organization_id,report_id,version,snapshot,content_hash,created_by)
  values(p_organization_id,p_report_id,v_version,v_snapshot,v_hash,v_user)
  returning id into v_version_id;

  update reports.reports
  set status='ready',updated_at=now()
  where id=p_report_id and organization_id=p_organization_id;

  return query select v_version_id,v_version,v_hash;
end;
$$;
