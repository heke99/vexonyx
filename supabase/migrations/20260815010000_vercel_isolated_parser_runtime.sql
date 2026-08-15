-- Real isolated-parser runtime controls for Vercel Sandbox.
-- Vercel Sandbox minimum memory is 2 GiB; the database contract must not claim a lower enforced limit.

alter table artifacts.parser_jobs
  add column if not exists lease_owner text,
  add column if not exists lease_generation bigint not null default 0,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists max_wall_seconds integer not null default 30,
  add column if not exists sandbox_session_id text,
  add column if not exists sandbox_runtime text,
  add column if not exists sandbox_region text;

alter table artifacts.parser_jobs alter column max_memory_mb set default 2048;
update artifacts.parser_jobs set max_memory_mb=2048 where max_memory_mb<2048;
alter table artifacts.parser_jobs drop constraint if exists parser_jobs_max_memory_mb_check;
alter table artifacts.parser_jobs add constraint parser_jobs_max_memory_mb_check check(max_memory_mb between 2048 and 4096);
alter table artifacts.parser_jobs drop constraint if exists parser_jobs_max_wall_seconds_check;
alter table artifacts.parser_jobs add constraint parser_jobs_max_wall_seconds_check check(max_wall_seconds between 5 and 300);

create index if not exists parser_jobs_claim_idx
  on artifacts.parser_jobs(status,created_at)
  where status in ('queued','failed');
create index if not exists parser_jobs_lease_idx
  on artifacts.parser_jobs(lease_expires_at)
  where status in ('leased','parsing');

create or replace function artifacts.claim_parser_jobs(
  p_worker_id text,
  p_limit integer default 1,
  p_lease_seconds integer default 120
) returns table(
  job_id uuid,
  organization_id uuid,
  file_id uuid,
  parser_profile text,
  parser_version text,
  max_cpu_seconds integer,
  max_memory_mb integer,
  max_wall_seconds integer,
  max_output_bytes bigint,
  lease_generation bigint,
  attempt integer
)
language plpgsql security definer set search_path=''
as $$
begin
  if p_worker_id is null or length(btrim(p_worker_id))<3 then
    raise exception 'invalid_worker' using errcode='22023';
  end if;
  if p_limit<1 or p_limit>10 or p_lease_seconds<30 or p_lease_seconds>600 then
    raise exception 'invalid_lease_parameters' using errcode='22023';
  end if;

  return query
  with candidates as (
    select j.id
    from artifacts.parser_jobs j
    where j.status in ('queued','failed')
      and j.attempt_count<5
      and (j.lease_expires_at is null or j.lease_expires_at<=now())
    order by j.created_at asc
    for update skip locked
    limit p_limit
  ), claimed as (
    update artifacts.parser_jobs j
    set status='leased',
        lease_owner=p_worker_id,
        lease_generation=j.lease_generation+1,
        lease_expires_at=now()+make_interval(secs=>p_lease_seconds),
        attempt_count=j.attempt_count+1,
        error_code=null,
        updated_at=now()
    from candidates c
    where j.id=c.id
    returning j.id,j.organization_id,j.file_id,j.parser_profile,j.parser_version,
      j.max_cpu_seconds,j.max_memory_mb,j.max_wall_seconds,j.max_output_bytes,
      j.lease_generation,j.attempt_count
  )
  select c.id,c.organization_id,c.file_id,c.parser_profile,c.parser_version,
    c.max_cpu_seconds,c.max_memory_mb,c.max_wall_seconds,c.max_output_bytes,
    c.lease_generation,c.attempt_count
  from claimed c;
end $$;

create or replace function artifacts.start_parser_job(
  p_job_id uuid,
  p_worker_id text,
  p_lease_generation bigint,
  p_sandbox_session_id text,
  p_sandbox_runtime text,
  p_sandbox_region text default null
) returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_count integer;
begin
  update artifacts.parser_jobs j
  set status='parsing',
      sandbox_session_id=p_sandbox_session_id,
      sandbox_runtime=p_sandbox_runtime,
      sandbox_region=p_sandbox_region,
      updated_at=now()
  where j.id=p_job_id
    and j.status='leased'
    and j.lease_owner=p_worker_id
    and j.lease_generation=p_lease_generation
    and j.lease_expires_at>now();
  get diagnostics v_count=row_count;
  return v_count=1;
end $$;

create or replace function artifacts.apply_file_inspection_result(
  p_file_id uuid,
  p_organization_id uuid,
  p_decision text,
  p_reason text,
  p_content_hash text,
  p_detected_mime_type text,
  p_mode text,
  p_chunks jsonb,
  p_parser_version text,
  p_requested_by uuid
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_file artifacts.files%rowtype;
  v_parser_job uuid;
  v_chunk jsonb;
begin
  select * into v_file
  from artifacts.files f
  where f.id=p_file_id and f.organization_id=p_organization_id and f.deleted_at is null
  for update;
  if not found then raise exception 'file_not_found' using errcode='22023'; end if;

  if p_decision='blocked' then
    delete from artifacts.file_chunks c where c.file_id=p_file_id;
    update artifacts.files f set
      status='blocked',content_hash=p_content_hash,detected_mime_type=p_detected_mime_type,
      blocked_reason=left(coalesce(p_reason,'blocked'),200),processing_version='file-inspection-v1',updated_at=now()
    where f.id=p_file_id;
    return null;
  elsif p_decision='ready_text' then
    if jsonb_typeof(coalesce(p_chunks,'[]'::jsonb)) <> 'array' then raise exception 'invalid_chunks' using errcode='22023'; end if;
    delete from artifacts.file_chunks c where c.file_id=p_file_id;
    for v_chunk in select value from jsonb_array_elements(coalesce(p_chunks,'[]'::jsonb)) loop
      insert into artifacts.file_chunks(organization_id,project_id,file_id,chunk_index,content,content_hash,metadata)
      values(p_organization_id,v_file.project_id,p_file_id,(v_chunk->>'index')::integer,v_chunk->>'content',v_chunk->>'contentHash',jsonb_build_object('source','file-inspection-v1'));
    end loop;
    update artifacts.files f set
      status='ready',content_hash=p_content_hash,detected_mime_type=p_detected_mime_type,
      blocked_reason=null,processing_version='file-inspection-v1',updated_at=now()
    where f.id=p_file_id;
    return null;
  elsif p_decision='safe_nontext' then
    update artifacts.files f set
      status='safe_for_processing',content_hash=p_content_hash,detected_mime_type=p_detected_mime_type,
      blocked_reason=null,processing_version='file-inspection-v1',updated_at=now()
    where f.id=p_file_id;
    return null;
  elsif p_decision='isolated_parser' then
    insert into artifacts.parser_jobs(
      organization_id,file_id,requested_by,parser_profile,parser_version,status,
      network_policy,max_cpu_seconds,max_memory_mb,max_wall_seconds,max_output_bytes
    ) values(
      p_organization_id,p_file_id,p_requested_by,'bounded-document-parser',p_parser_version,'queued',
      'deny_all',30,2048,30,10485760
    )
    on conflict(file_id,parser_version) do update set
      status=case when artifacts.parser_jobs.status in ('ready','blocked','parsing','leased') then artifacts.parser_jobs.status else 'queued' end,
      requested_by=coalesce(excluded.requested_by,artifacts.parser_jobs.requested_by),
      updated_at=now(),
      error_code=case when artifacts.parser_jobs.status in ('ready','blocked') then artifacts.parser_jobs.error_code else null end
    returning id into v_parser_job;
    update artifacts.files f set
      status='safe_for_processing',content_hash=p_content_hash,detected_mime_type=p_detected_mime_type,
      blocked_reason=null,processing_version='file-inspection-v1',parser_version=p_parser_version,updated_at=now()
    where f.id=p_file_id;
    return v_parser_job;
  else
    raise exception 'invalid_inspection_decision' using errcode='22023';
  end if;
end $$;

create or replace function artifacts.complete_parser_job(
  p_job_id uuid,
  p_worker_id text,
  p_lease_generation bigint,
  p_outcome text,
  p_error_code text,
  p_output_metadata jsonb,
  p_chunks jsonb
) returns text
language plpgsql security definer set search_path=''
as $$
declare
  v_job artifacts.parser_jobs%rowtype;
  v_file artifacts.files%rowtype;
  v_chunk jsonb;
  v_final_status text;
begin
  select * into v_job
  from artifacts.parser_jobs j
  where j.id=p_job_id
    and j.lease_owner=p_worker_id
    and j.lease_generation=p_lease_generation
    and j.status in ('leased','parsing')
    and j.lease_expires_at>now()
  for update;
  if not found then raise exception 'parser_lease_lost' using errcode='P0001'; end if;

  select * into v_file from artifacts.files f where f.id=v_job.file_id for update;
  if not found then raise exception 'file_not_found' using errcode='P0001'; end if;

  if p_outcome='ready' then
    if jsonb_typeof(coalesce(p_chunks,'[]'::jsonb)) <> 'array' then raise exception 'invalid_chunks' using errcode='22023'; end if;
    delete from artifacts.file_chunks c where c.file_id=v_file.id;
    for v_chunk in select value from jsonb_array_elements(coalesce(p_chunks,'[]'::jsonb)) loop
      insert into artifacts.file_chunks(organization_id,project_id,file_id,chunk_index,content,content_hash,metadata)
      values(v_file.organization_id,v_file.project_id,v_file.id,(v_chunk->>'index')::integer,v_chunk->>'content',v_chunk->>'contentHash',jsonb_build_object('source','isolated-parser','parser_version',v_job.parser_version));
    end loop;
    update artifacts.files f set status='ready',blocked_reason=null,parser_version=v_job.parser_version,
      metadata=f.metadata||jsonb_build_object('isolated_parser',coalesce(p_output_metadata,'{}'::jsonb)),updated_at=now()
    where f.id=v_file.id;
    v_final_status:='ready';
  elsif p_outcome='blocked' then
    delete from artifacts.file_chunks c where c.file_id=v_file.id;
    update artifacts.files f set status='blocked',blocked_reason=left(coalesce(p_error_code,'parser_blocked'),200),parser_version=v_job.parser_version,
      metadata=f.metadata||jsonb_build_object('isolated_parser',coalesce(p_output_metadata,'{}'::jsonb)),updated_at=now()
    where f.id=v_file.id;
    v_final_status:='blocked';
  elsif p_outcome='failed' then
    v_final_status:=case when v_job.attempt_count>=5 then 'dead_letter' else 'failed' end;
    if v_final_status='dead_letter' then
      update artifacts.files f set status='failed',blocked_reason=left(coalesce(p_error_code,'parser_failed'),200),updated_at=now() where f.id=v_file.id;
    end if;
  else
    raise exception 'invalid_parser_outcome' using errcode='22023';
  end if;

  update artifacts.parser_jobs j set
    status=v_final_status,
    output_metadata=coalesce(p_output_metadata,'{}'::jsonb),
    error_code=case when v_final_status='ready' then null else left(coalesce(p_error_code,v_final_status),200) end,
    completed_at=case when v_final_status in ('ready','blocked','dead_letter') then now() else null end,
    lease_owner=null,lease_expires_at=null,updated_at=now()
  where j.id=p_job_id;
  return v_final_status;
end $$;

revoke all on function artifacts.claim_parser_jobs(text,integer,integer) from public,anon,authenticated;
revoke all on function artifacts.start_parser_job(uuid,text,bigint,text,text,text) from public,anon,authenticated;
revoke all on function artifacts.apply_file_inspection_result(uuid,uuid,text,text,text,text,text,jsonb,text,uuid) from public,anon,authenticated;
revoke all on function artifacts.complete_parser_job(uuid,text,bigint,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function artifacts.claim_parser_jobs(text,integer,integer) to service_role;
grant execute on function artifacts.start_parser_job(uuid,text,bigint,text,text,text) to service_role;
grant execute on function artifacts.apply_file_inspection_result(uuid,uuid,text,text,text,text,text,jsonb,text,uuid) to service_role;
grant execute on function artifacts.complete_parser_job(uuid,text,bigint,text,text,text,jsonb,jsonb) to service_role;
