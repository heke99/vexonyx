alter table artifacts.files add column if not exists upload_idempotency_key text;
create unique index if not exists files_upload_idempotency_idx on artifacts.files(organization_id,upload_idempotency_key) where upload_idempotency_key is not null;

create or replace function artifacts.create_upload_record(
  p_organization_id uuid,p_project_id uuid,p_original_name text,p_declared_mime_type text,p_size_bytes bigint,p_idempotency_key text
)
returns table(file_id uuid,storage_bucket text,storage_path text,status artifacts.file_status)
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_name text;v_existing artifacts.files%rowtype;v_id uuid:=gen_random_uuid();v_path text;
begin
  if v_user is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not operations.has_org_write(p_organization_id) then raise exception 'forbidden' using errcode='42501'; end if;
  if not exists(select 1 from app.projects p where p.id=p_project_id and p.organization_id=p_organization_id and p.deleted_at is null) then raise exception 'project_not_found' using errcode='22023'; end if;
  if p_size_bytes is null or p_size_bytes<=0 or p_size_bytes>104857600 then raise exception 'invalid_file_size' using errcode='22023'; end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key))<8 or length(p_idempotency_key)>160 then raise exception 'invalid_idempotency_key' using errcode='22023'; end if;
  select * into v_existing from artifacts.files f where f.organization_id=p_organization_id and f.upload_idempotency_key=p_idempotency_key;
  if found then return query select v_existing.id,v_existing.storage_bucket,v_existing.storage_path,v_existing.status; return; end if;
  v_name:=regexp_replace(btrim(coalesce(p_original_name,'file')),'[^A-Za-z0-9._ -]+','_','g');v_name:=left(coalesce(nullif(v_name,''),'file'),180);
  v_path:=p_organization_id::text||'/'||p_project_id::text||'/'||v_id::text||'/'||v_name;
  insert into artifacts.files(id,organization_id,project_id,uploaded_by,storage_bucket,storage_path,original_name,declared_mime_type,size_bytes,status,upload_idempotency_key,classification)
  values(v_id,p_organization_id,p_project_id,v_user,'project-artifacts',v_path,v_name,nullif(left(btrim(coalesce(p_declared_mime_type,'')),255),''),p_size_bytes,'quarantined',p_idempotency_key,'confidential');
  return query select v_id,'project-artifacts'::text,v_path,'quarantined'::artifacts.file_status;
end$$;
revoke all on function artifacts.create_upload_record(uuid,uuid,text,text,bigint,text) from public,anon;
grant execute on function artifacts.create_upload_record(uuid,uuid,text,text,bigint,text) to authenticated,service_role;
create policy engagements_activate_admin on security.engagements for update to authenticated using(operations.has_org_admin(organization_id)) with check(operations.has_org_admin(organization_id));
notify pgrst,'reload schema';
