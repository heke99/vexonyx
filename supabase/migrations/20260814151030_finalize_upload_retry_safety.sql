create or replace function artifacts.finalize_upload(
  p_organization_id uuid,
  p_project_id uuid,
  p_file_id uuid
)
returns table(file_id uuid, job_id uuid, file_status artifacts.file_status)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_file artifacts.files%rowtype;
  v_job_id uuid;
  v_idempotency text := 'file-process:'||p_file_id::text;
begin
  if v_user is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not operations.has_org_write(p_organization_id) then raise exception 'forbidden' using errcode='42501'; end if;

  select * into v_file
  from artifacts.files f
  where f.id=p_file_id
    and f.organization_id=p_organization_id
    and f.project_id=p_project_id
    and f.deleted_at is null
  for update;

  if not found then raise exception 'file_not_found' using errcode='22023'; end if;

  select j.id into v_job_id
  from operations.jobs j
  where j.queue_name='file-processing' and j.idempotency_key=v_idempotency;
  if v_job_id is not null then
    return query select p_file_id,v_job_id,v_file.status;
    return;
  end if;

  if v_file.status <> 'quarantined' then raise exception 'file_not_quarantined' using errcode='22023'; end if;

  insert into operations.jobs(organization_id,queue_name,priority,status,payload,idempotency_key,max_attempts)
  values(
    p_organization_id,
    'file-processing',
    3,
    'queued',
    jsonb_build_object('fileId',p_file_id,'organizationId',p_organization_id,'projectId',p_project_id),
    v_idempotency,
    5
  )
  on conflict (queue_name,idempotency_key) do update set updated_at=now()
  returning id into v_job_id;

  update artifacts.files set updated_at=now() where id=p_file_id;
  return query select p_file_id,v_job_id,v_file.status;
end;
$$;
