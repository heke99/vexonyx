-- Harden VEXONYX waitlist launch, email delivery, and verified-email account conversion.

create unique index if not exists waitlist_converted_user_unique_idx
  on launch.waitlist_entries(converted_user_id)
  where converted_user_id is not null;

create table if not exists launch.waitlist_email_deliveries(
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references launch.waitlist_entries(id) on delete cascade,
  invitation_id uuid references launch.waitlist_invitations(id) on delete cascade,
  kind text not null check(kind in ('verification','confirmed','access_invitation')),
  recipient text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check(status in ('queued','sending','sent','dead_letter')),
  provider text not null default 'resend',
  provider_message_id text,
  attempt_count integer not null default 0 check(attempt_count>=0),
  max_attempts integer not null default 5 check(max_attempts between 1 and 20),
  idempotency_key text not null unique,
  expires_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists waitlist_email_delivery_claim_idx
  on launch.waitlist_email_deliveries(status,created_at)
  where status in ('queued','sending');
create index if not exists waitlist_email_delivery_entry_idx
  on launch.waitlist_email_deliveries(entry_id,created_at desc);
alter table launch.waitlist_email_deliveries enable row level security;
revoke all on launch.waitlist_email_deliveries from public,anon,authenticated;
grant select,insert,update,delete on launch.waitlist_email_deliveries to service_role;

-- Browser traffic must pass through the server route so IP/email throttling cannot be bypassed by calling PostgREST directly.
revoke execute on function launch.join_waitlist(text,text,text,text,text,text,text,text) from anon,authenticated;
grant execute on function launch.join_waitlist(text,text,text,text,text,text,text,text) to service_role;

create or replace function launch.join_waitlist(
  p_email text,
  p_name text default null,
  p_company text default null,
  p_job_role text default null,
  p_country text default null,
  p_source text default 'website',
  p_referral_code text default null,
  p_idempotency_key text default null
)
returns table(entry_id uuid,referral_code text,status text)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_email text;
  v_referrer uuid;
  v_entry uuid;
  v_referral text;
  v_status text;
  v_existing_email text;
  v_inserted boolean := false;
begin
  v_email:=lower(btrim(coalesce(p_email,'')));
  if v_email='' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email)>320 then
    raise exception 'invalid_email' using errcode='22023';
  end if;

  if p_idempotency_key is not null then
    select w.id,w.email_normalized,w.referral_code,w.status
      into v_entry,v_existing_email,v_referral,v_status
    from launch.waitlist_entries w
    where w.idempotency_key=p_idempotency_key;
    if v_entry is not null then
      if v_existing_email<>v_email then
        raise exception 'idempotency_conflict' using errcode='22023';
      end if;
      return query select v_entry,v_referral,v_status;
      return;
    end if;
  end if;

  if p_referral_code is not null then
    select w.id into v_referrer
    from launch.waitlist_entries w
    where w.referral_code=upper(btrim(p_referral_code))
      and w.status in ('verified','invited','converted');
  end if;

  loop
    v_referral:=upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,10));
    exit when not exists(select 1 from launch.waitlist_entries w where w.referral_code=v_referral);
  end loop;

  insert into launch.waitlist_entries(
    email,email_normalized,name,company,job_role,country,source,referrer_entry_id,referral_code,idempotency_key
  ) values(
    v_email,v_email,nullif(btrim(p_name),''),nullif(btrim(p_company),''),nullif(btrim(p_job_role),''),
    nullif(btrim(p_country),''),coalesce(nullif(btrim(p_source),''),'website'),v_referrer,v_referral,p_idempotency_key
  )
  on conflict(email_normalized) do nothing
  returning id,waitlist_entries.status into v_entry,v_status;

  if v_entry is not null then
    v_inserted:=true;
  else
    select w.id,w.referral_code,w.status into v_entry,v_referral,v_status
    from launch.waitlist_entries w
    where w.email_normalized=v_email;
  end if;

  if v_entry is null then
    raise exception 'waitlist_insert_failed' using errcode='P0001';
  end if;

  if v_inserted and v_referrer is not null then
    insert into launch.waitlist_referral_events(referrer_entry_id,referred_entry_id,source)
    values(v_referrer,v_entry,'waitlist')
    on conflict do nothing;
  end if;

  return query select v_entry,v_referral,v_status;
end;
$$;
revoke all on function launch.join_waitlist(text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function launch.join_waitlist(text,text,text,text,text,text,text,text) to service_role;

create or replace function launch.check_waitlist_rate_limit(p_ip_hash text,p_email_hash text)
returns table(ip_limited boolean,email_limited boolean,retry_after_seconds integer)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_ip_key text;
  v_email_key text;
  v_ip_count integer;
  v_email_count integer;
  v_retry integer:=0;
  v_candidate integer;
begin
  if p_ip_hash !~ '^[0-9a-f]{64}$' or p_email_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_rate_limit_hash' using errcode='22023';
  end if;
  v_ip_key:='ip:'||p_ip_hash;
  v_email_key:='email:'||p_email_hash;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_ip_key,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email_key,0));

  select count(*) into v_ip_count
  from launch.waitlist_rate_limits
  where actor_hash=v_ip_key and created_at>now()-interval '10 minutes';

  select count(*) into v_email_count
  from launch.waitlist_rate_limits
  where actor_hash=v_email_key and created_at>now()-interval '1 hour';

  ip_limited:=v_ip_count>=60;
  email_limited:=v_email_count>=5;

  if ip_limited then
    select greatest(1,ceil(extract(epoch from (min(created_at)+interval '10 minutes'-now())))::integer)
      into v_candidate
    from launch.waitlist_rate_limits
    where actor_hash=v_ip_key and created_at>now()-interval '10 minutes';
    v_retry:=greatest(v_retry,coalesce(v_candidate,60));
  else
    insert into launch.waitlist_rate_limits(actor_hash) values(v_ip_key);
  end if;

  if email_limited then
    select greatest(1,ceil(extract(epoch from (min(created_at)+interval '1 hour'-now())))::integer)
      into v_candidate
    from launch.waitlist_rate_limits
    where actor_hash=v_email_key and created_at>now()-interval '1 hour';
    v_retry:=greatest(v_retry,coalesce(v_candidate,300));
  else
    insert into launch.waitlist_rate_limits(actor_hash) values(v_email_key);
  end if;

  retry_after_seconds:=v_retry;
  return next;
end;
$$;
revoke all on function launch.check_waitlist_rate_limit(text,text) from public,anon,authenticated;
grant execute on function launch.check_waitlist_rate_limit(text,text) to service_role;

create or replace function launch.prepare_waitlist_verification_email(
  p_entry_id uuid,
  p_token_hash text,
  p_verification_url text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_entry launch.waitlist_entries%rowtype;
  v_delivery_id uuid;
  v_expires timestamptz:=now()+interval '30 minutes';
begin
  if p_entry_id is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_verification_url is null or length(p_verification_url)>2048 or p_verification_url !~ '^https?://' then
    raise exception 'invalid_verification_email' using errcode='22023';
  end if;

  select * into v_entry from launch.waitlist_entries where id=p_entry_id for update;
  if not found or v_entry.status<>'pending_verification' then return false; end if;

  if exists(
    select 1 from launch.waitlist_verification_tokens t
    where t.entry_id=p_entry_id and t.consumed_at is null and t.expires_at>now() and t.created_at>now()-interval '5 minutes'
  ) then
    return false;
  end if;

  insert into launch.waitlist_verification_tokens(entry_id,token_hash,expires_at)
  values(p_entry_id,p_token_hash,v_expires);

  insert into launch.waitlist_email_deliveries(
    entry_id,kind,recipient,payload,idempotency_key,expires_at
  ) values(
    p_entry_id,'verification',v_entry.email,
    jsonb_build_object('verificationUrl',p_verification_url,'name',v_entry.name),
    'waitlist-verification:'||p_entry_id::text||':'||p_token_hash,
    v_expires
  ) returning id into v_delivery_id;

  insert into operations.jobs(queue_name,organization_id,priority,status,payload,idempotency_key,max_attempts,available_at)
  values('email',null,1,'queued',jsonb_build_object('job_type','waitlist_email','delivery_id',v_delivery_id),'waitlist-email:'||v_delivery_id::text,5,now());

  return true;
end;
$$;
revoke all on function launch.prepare_waitlist_verification_email(uuid,text,text) from public,anon,authenticated;
grant execute on function launch.prepare_waitlist_verification_email(uuid,text,text) to service_role;

create or replace function launch.enqueue_waitlist_confirmation(p_entry_id uuid,p_referral_url text default null)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_entry launch.waitlist_entries%rowtype;
  v_delivery_id uuid;
begin
  select * into v_entry from launch.waitlist_entries where id=p_entry_id for update;
  if not found or v_entry.status not in ('verified','invited','converted') or v_entry.email_verified_at is null then return false; end if;
  if p_referral_url is not null and (length(p_referral_url)>2048 or p_referral_url !~ '^https?://') then
    raise exception 'invalid_referral_url' using errcode='22023';
  end if;

  insert into launch.waitlist_email_deliveries(entry_id,kind,recipient,payload,idempotency_key)
  values(
    p_entry_id,'confirmed',v_entry.email,
    jsonb_build_object('name',v_entry.name,'referralUrl',p_referral_url),
    'waitlist-confirmed:'||p_entry_id::text
  )
  on conflict(idempotency_key) do nothing
  returning id into v_delivery_id;

  if v_delivery_id is null then return false; end if;

  insert into operations.jobs(queue_name,organization_id,priority,status,payload,idempotency_key,max_attempts,available_at)
  values('email',null,2,'queued',jsonb_build_object('job_type','waitlist_email','delivery_id',v_delivery_id),'waitlist-email:'||v_delivery_id::text,5,now())
  on conflict(queue_name,idempotency_key) do nothing;

  return true;
end;
$$;
revoke all on function launch.enqueue_waitlist_confirmation(uuid,text) from public,anon,authenticated;
grant execute on function launch.enqueue_waitlist_confirmation(uuid,text) to service_role;

create or replace function launch.issue_waitlist_invitation(
  p_entry_id uuid,
  p_token_hash text,
  p_invitation_url text
)
returns table(invitation_id uuid,queued boolean)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_entry launch.waitlist_entries%rowtype;
  v_invitation_id uuid;
  v_delivery_id uuid;
  v_existing_user uuid;
begin
  if p_entry_id is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_invitation_url is null or length(p_invitation_url)>2048 or p_invitation_url !~ '^https?://' then
    raise exception 'invalid_waitlist_invitation' using errcode='22023';
  end if;

  select * into v_entry from launch.waitlist_entries where id=p_entry_id for update;
  if not found or v_entry.status not in ('verified','invited') or v_entry.email_verified_at is null or v_entry.converted_user_id is not null then
    raise exception 'waitlist_entry_not_invitable' using errcode='P0001';
  end if;

  select u.id into v_existing_user from auth.users u where lower(coalesce(u.email,''))=v_entry.email_normalized limit 1;
  if v_existing_user is not null then
    raise exception 'auth_user_already_exists' using errcode='P0001';
  end if;

  update launch.waitlist_invitations
  set status='revoked'
  where entry_id=p_entry_id and status in ('created','sent');

  insert into launch.waitlist_invitations(entry_id,token_hash,status,expires_at)
  values(p_entry_id,p_token_hash,'created',now()+interval '7 days')
  returning id into v_invitation_id;

  update launch.waitlist_entries
  set status='invited',invited_at=now(),updated_at=now()
  where id=p_entry_id;

  insert into launch.waitlist_email_deliveries(
    entry_id,invitation_id,kind,recipient,payload,idempotency_key,expires_at
  ) values(
    p_entry_id,v_invitation_id,'access_invitation',v_entry.email,
    jsonb_build_object('name',v_entry.name,'invitationUrl',p_invitation_url),
    'waitlist-access-invitation:'||v_invitation_id::text,
    now()+interval '7 days'
  ) returning id into v_delivery_id;

  insert into operations.jobs(queue_name,organization_id,priority,status,payload,idempotency_key,max_attempts,available_at)
  values('email',null,1,'queued',jsonb_build_object('job_type','waitlist_email','delivery_id',v_delivery_id),'waitlist-email:'||v_delivery_id::text,5,now());

  return query select v_invitation_id,true;
end;
$$;
revoke all on function launch.issue_waitlist_invitation(uuid,text,text) from public,anon,authenticated;
grant execute on function launch.issue_waitlist_invitation(uuid,text,text) to service_role;

create or replace function launch.inspect_waitlist_invitation(p_entry_id uuid,p_token_hash text)
returns table(invitation_id uuid,email text,name text,company text)
language sql
stable
security definer
set search_path=''
as $$
  select i.id,w.email,w.name,w.company
  from launch.waitlist_invitations i
  join launch.waitlist_entries w on w.id=i.entry_id
  where i.entry_id=p_entry_id
    and i.token_hash=p_token_hash
    and i.status in ('created','sent')
    and i.expires_at>now()
    and w.status='invited'
    and w.email_verified_at is not null
    and w.converted_user_id is null
$$;
revoke all on function launch.inspect_waitlist_invitation(uuid,text) from public,anon,authenticated;
grant execute on function launch.inspect_waitlist_invitation(uuid,text) to service_role;

create or replace function launch.waitlist_auth_creation_allowed(p_email text,p_entry_id text,p_invitation_id text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_entry uuid;
  v_invitation uuid;
begin
  begin v_entry:=p_entry_id::uuid; exception when others then return false; end;
  begin v_invitation:=p_invitation_id::uuid; exception when others then return false; end;
  return exists(
    select 1
    from launch.waitlist_entries w
    join launch.waitlist_invitations i on i.entry_id=w.id
    where w.id=v_entry
      and i.id=v_invitation
      and i.status in ('created','sent')
      and i.expires_at>now()
      and w.status='invited'
      and w.email_verified_at is not null
      and w.converted_user_id is null
      and w.email_normalized=lower(btrim(coalesce(p_email,'')))
  );
end;
$$;
revoke all on function launch.waitlist_auth_creation_allowed(text,text,text) from public,anon,authenticated,service_role;
grant usage on schema launch to supabase_auth_admin;
grant execute on function launch.waitlist_auth_creation_allowed(text,text,text) to supabase_auth_admin;

create or replace function public.vexonyx_block_auth_user_creation_waitlist()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if current_user='postgres' then
    return new;
  end if;

  if current_user='supabase_auth_admin' and lower(coalesce(new.email,''))='info@vexonyx.com' then
    return new;
  end if;

  if current_user='supabase_auth_admin'
     and lower(coalesce(new.email,''))='demo@vexonyx.com'
     and security.consume_demo_auth_creation_token(new.raw_user_meta_data ->> 'vexonyx_demo_provisioning_token') then
    new.raw_user_meta_data:=coalesce(new.raw_user_meta_data,'{}'::jsonb)-'vexonyx_demo_provisioning_token';
    return new;
  end if;

  if current_user='supabase_auth_admin'
     and coalesce(new.raw_app_meta_data ->> 'vexonyx_internal_provisioning','')='waitlist'
     and launch.waitlist_auth_creation_allowed(
       new.email,
       new.raw_app_meta_data ->> 'waitlist_entry_id',
       new.raw_app_meta_data ->> 'waitlist_invitation_id'
     ) then
    return new;
  end if;

  raise exception using
    errcode='42501',
    message='VEXONYX account creation is disabled while the platform is waitlist-only.';
end;
$$;
revoke all on function public.vexonyx_block_auth_user_creation_waitlist() from public,anon,authenticated;

create or replace function launch.handle_waitlist_auth_conversion()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_entry_id uuid;
  v_invitation_id uuid;
  v_entry launch.waitlist_entries%rowtype;
  v_invitation launch.waitlist_invitations%rowtype;
  v_org_name text;
  v_slug_base text;
  v_slug text;
begin
  if coalesce(new.raw_app_meta_data ->> 'vexonyx_internal_provisioning','')<>'waitlist' then
    return new;
  end if;

  begin v_entry_id:=(new.raw_app_meta_data ->> 'waitlist_entry_id')::uuid;
  exception when others then raise exception 'invalid_waitlist_entry_binding' using errcode='42501'; end;
  begin v_invitation_id:=(new.raw_app_meta_data ->> 'waitlist_invitation_id')::uuid;
  exception when others then raise exception 'invalid_waitlist_invitation_binding' using errcode='42501'; end;

  select * into v_entry from launch.waitlist_entries where id=v_entry_id for update;
  select * into v_invitation from launch.waitlist_invitations where id=v_invitation_id and entry_id=v_entry_id for update;

  if v_entry.id is null
     or v_invitation.id is null
     or v_entry.status<>'invited'
     or v_entry.email_verified_at is null
     or v_entry.converted_user_id is not null
     or v_entry.email_normalized<>lower(btrim(coalesce(new.email,'')))
     or v_invitation.status not in ('created','sent')
     or v_invitation.expires_at<=now() then
    raise exception 'waitlist_conversion_not_allowed' using errcode='42501';
  end if;

  update launch.waitlist_invitations set status='accepted' where id=v_invitation_id;
  update launch.waitlist_entries
  set status='converted',converted_user_id=new.id,updated_at=now()
  where id=v_entry_id;

  v_org_name:=left(coalesce(nullif(btrim(v_entry.company),''),nullif(btrim(v_entry.name),''),'VEXONYX Workspace'),120);
  if length(v_org_name)<2 then v_org_name:='VEXONYX Workspace'; end if;
  v_slug_base:=left(trim(both '-' from regexp_replace(lower(v_org_name),'[^a-z0-9]+','-','g')),48);
  if length(v_slug_base)<2 then v_slug_base:='workspace'; end if;
  v_slug:=v_slug_base||'-'||substr(replace(new.id::text,'-',''),1,8);

  insert into app.organizations(name,slug,created_by,metadata)
  values(v_org_name,v_slug,new.id,jsonb_build_object('provisioned_from','waitlist','waitlist_entry_id',v_entry_id));

  insert into audit.audit_logs(actor_user_id,actor_type,action,resource_type,resource_id,metadata)
  values(new.id,'system','waitlist.converted','waitlist_entry',v_entry_id,jsonb_build_object('invitation_id',v_invitation_id));

  return new;
end;
$$;
revoke all on function launch.handle_waitlist_auth_conversion() from public,anon,authenticated,service_role;
drop trigger if exists vexonyx_waitlist_convert_auth_user on auth.users;
create trigger vexonyx_waitlist_convert_auth_user
after insert on auth.users
for each row execute function launch.handle_waitlist_auth_conversion();

create or replace function launch.prune_waitlist_operational_data()
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  delete from launch.waitlist_rate_limits where created_at<now()-interval '2 days';
  delete from launch.waitlist_verification_tokens where expires_at<now()-interval '7 days';
  update launch.waitlist_invitations set status='expired'
    where status in ('created','sent') and expires_at<=now();
end;
$$;
revoke all on function launch.prune_waitlist_operational_data() from public,anon,authenticated,service_role;

create or replace function security.invoke_worker(p_path text)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_enabled boolean;
  v_origin text;
  v_secret text;
  v_request_id bigint;
begin
  if p_path not in (
    '/api/internal/workers/file-processing',
    '/api/internal/workers/isolated-parser',
    '/api/internal/workers/render-reports',
    '/api/internal/workers/marketing-exports',
    '/api/internal/workers/waitlist-email'
  ) then
    raise exception 'invalid_worker_path' using errcode='22023';
  end if;

  select c.enabled,c.target_origin into v_enabled,v_origin
  from security.worker_scheduler_config c
  where c.singleton=true;
  if not coalesce(v_enabled,false) then return null; end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='vexonyx_worker_scheduler_token'
  order by created_at desc
  limit 1;
  if v_secret is null or length(v_secret)<64 then
    raise exception 'worker_scheduler_secret_unavailable' using errcode='P0001';
  end if;

  select net.http_get(
    url=>v_origin||p_path,
    headers=>jsonb_build_object('Authorization','Bearer '||v_secret,'User-Agent','VEXONYX-Supabase-Scheduler/1'),
    timeout_milliseconds=>290000
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function security.invoke_worker(text) from public,anon,authenticated,service_role;

do $schedule$
declare r record;
begin
  for r in select jobid from cron.job where jobname in ('vexonyx-waitlist-email','vexonyx-waitlist-prune') loop
    perform cron.unschedule(r.jobid);
  end loop;
end
$schedule$;
select cron.schedule('vexonyx-waitlist-email','* * * * *',$$select security.invoke_worker('/api/internal/workers/waitlist-email');$$);
select cron.schedule('vexonyx-waitlist-prune','17 3 * * *',$$select launch.prune_waitlist_operational_data();$$);

notify pgrst,'reload schema';