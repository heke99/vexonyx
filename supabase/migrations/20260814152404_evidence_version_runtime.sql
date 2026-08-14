create or replace function security.create_finding_evidence(
  p_organization_id uuid,
  p_project_id uuid,
  p_finding_id uuid,
  p_evidence_type text,
  p_content jsonb,
  p_source_file_id uuid default null
)
returns table(evidence_id uuid, version integer, content_hash text)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_evidence_id uuid;
  v_hash text;
begin
  if v_user is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not operations.has_org_write(p_organization_id) then raise exception 'forbidden' using errcode='42501'; end if;
  if p_evidence_type not in ('screenshot','log','source_code_reference','request_response','file','agent_observation','text','image') then raise exception 'invalid_evidence_type' using errcode='22023'; end if;
  if p_content is null or jsonb_typeof(p_content) is null then raise exception 'content_required' using errcode='22023'; end if;
  if not exists(select 1 from security.findings f where f.id=p_finding_id and f.organization_id=p_organization_id and f.project_id=p_project_id and f.deleted_at is null) then raise exception 'finding_not_found' using errcode='22023'; end if;
  if p_source_file_id is not null and not exists(select 1 from artifacts.files f where f.id=p_source_file_id and f.organization_id=p_organization_id and f.project_id=p_project_id and f.deleted_at is null) then raise exception 'source_file_not_found' using errcode='22023'; end if;

  v_hash := encode(extensions.digest(convert_to(p_content::text,'UTF8'),'sha256'),'hex');
  insert into security.finding_evidence(organization_id,project_id,finding_id,evidence_type,source_file_id,content_hash,current_version,classification,processing_version)
  values(p_organization_id,p_project_id,p_finding_id,p_evidence_type,p_source_file_id,v_hash,1,'confidential','manual-v1')
  returning id into v_evidence_id;
  insert into security.finding_evidence_versions(organization_id,evidence_id,version,content,content_hash,created_by)
  values(p_organization_id,v_evidence_id,1,p_content,v_hash,v_user);
  return query select v_evidence_id,1,v_hash;
end;
$$;

create or replace function security.append_finding_evidence_version(
  p_organization_id uuid,
  p_evidence_id uuid,
  p_content jsonb
)
returns table(evidence_id uuid, version integer, content_hash text)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_current integer;
  v_next integer;
  v_hash text;
begin
  if v_user is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not operations.has_org_write(p_organization_id) then raise exception 'forbidden' using errcode='42501'; end if;
  if p_content is null or jsonb_typeof(p_content) is null then raise exception 'content_required' using errcode='22023'; end if;

  select e.current_version into v_current from security.finding_evidence e where e.id=p_evidence_id and e.organization_id=p_organization_id for update;
  if v_current is null then raise exception 'evidence_not_found' using errcode='22023'; end if;
  v_next := v_current + 1;
  v_hash := encode(extensions.digest(convert_to(p_content::text,'UTF8'),'sha256'),'hex');
  insert into security.finding_evidence_versions(organization_id,evidence_id,version,content,content_hash,created_by)
  values(p_organization_id,p_evidence_id,v_next,p_content,v_hash,v_user);
  update security.finding_evidence set current_version=v_next,content_hash=v_hash,processing_version='manual-v1' where id=p_evidence_id and organization_id=p_organization_id;
  return query select p_evidence_id,v_next,v_hash;
end;
$$;

revoke all on function security.create_finding_evidence(uuid,uuid,uuid,text,jsonb,uuid) from public,anon;
revoke all on function security.append_finding_evidence_version(uuid,uuid,jsonb) from public,anon;
grant execute on function security.create_finding_evidence(uuid,uuid,uuid,text,jsonb,uuid) to authenticated,service_role;
grant execute on function security.append_finding_evidence_version(uuid,uuid,jsonb) to authenticated,service_role;
