-- Replace unavailable Vercel CRON_SECRET scheduling with an authenticated Supabase scheduler.
-- The raw 256-bit worker token lives only in Vault. Application/database authorization stores only its SHA-256 digest.

create extension if not exists pg_net;
create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create table if not exists security.worker_credentials(
  name text primary key,
  token_hash text not null check(token_hash ~ '^[0-9a-f]{64}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);
alter table security.worker_credentials enable row level security;
revoke all on security.worker_credentials from public,anon,authenticated;
grant select,insert,update,delete on security.worker_credentials to service_role;

create table if not exists security.worker_scheduler_config(
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  target_origin text not null default 'https://www.vexonyx.com' check(target_origin ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$'),
  updated_at timestamptz not null default now()
);
alter table security.worker_scheduler_config enable row level security;
revoke all on security.worker_scheduler_config from public,anon,authenticated;
grant select,insert,update,delete on security.worker_scheduler_config to service_role;
insert into security.worker_scheduler_config(singleton,enabled) values(true,false) on conflict(singleton) do nothing;

do $token$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='vexonyx_worker_scheduler_token'
  order by created_at desc
  limit 1;

  if v_secret is null then
    v_secret := encode(extensions.gen_random_bytes(32),'hex');
    perform vault.create_secret(v_secret,'vexonyx_worker_scheduler_token','VEXONYX internal worker scheduler bearer token');
  end if;

  insert into security.worker_credentials(name,token_hash,active)
  values('supabase-scheduler',encode(extensions.digest(v_secret,'sha256'),'hex'),true)
  on conflict(name) do update set token_hash=excluded.token_hash,active=true,rotated_at=now();
end
$token$;

create or replace function security.verify_worker_token(p_token text)
returns boolean
language sql stable security definer set search_path=''
as $$
  select coalesce(
    length(p_token)>=64
    and exists(
      select 1
      from security.worker_credentials c
      where c.active
        and c.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    ),
    false
  )
$$;
revoke all on function security.verify_worker_token(text) from public,anon,authenticated;
grant execute on function security.verify_worker_token(text) to service_role;

create or replace function security.invoke_worker(p_path text)
returns bigint
language plpgsql security definer set search_path=''
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
    '/api/internal/workers/marketing-exports'
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
    url => v_origin || p_path,
    headers => jsonb_build_object(
      'Authorization','Bearer ' || v_secret,
      'User-Agent','VEXONYX-Supabase-Scheduler/1'
    ),
    timeout_milliseconds => 290000
  ) into v_request_id;
  return v_request_id;
end
$$;
revoke all on function security.invoke_worker(text) from public,anon,authenticated,service_role;

-- Replace jobs by stable names so replay or forward upgrades never create duplicates.
do $schedule$
declare r record;
begin
  for r in select jobid from cron.job where jobname in (
    'vexonyx-file-processing',
    'vexonyx-isolated-parser',
    'vexonyx-render-reports',
    'vexonyx-marketing-exports'
  ) loop
    perform cron.unschedule(r.jobid);
  end loop;
end
$schedule$;

select cron.schedule('vexonyx-file-processing','* * * * *',$$select security.invoke_worker('/api/internal/workers/file-processing');$$);
select cron.schedule('vexonyx-isolated-parser','* * * * *',$$select security.invoke_worker('/api/internal/workers/isolated-parser');$$);
select cron.schedule('vexonyx-render-reports','*/5 * * * *',$$select security.invoke_worker('/api/internal/workers/render-reports');$$);
select cron.schedule('vexonyx-marketing-exports','*/10 * * * *',$$select security.invoke_worker('/api/internal/workers/marketing-exports');$$);
