create table app.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  email_normalized text not null,
  role app.organization_role not null check (role <> 'organization_owner'),
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  token_hash text not null,
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_invitations_email_check check (email_normalized = lower(btrim(email_normalized)) and position('@' in email_normalized) > 1),
  constraint organization_invitations_token_hash_check check (length(token_hash)=64)
);
create unique index organization_invitations_pending_email_idx on app.organization_invitations(organization_id,email_normalized) where status='pending';
create index organization_invitations_org_created_idx on app.organization_invitations(organization_id,created_at desc);
create index organization_invitations_expiry_idx on app.organization_invitations(expires_at) where status='pending';
alter table app.organization_invitations enable row level security;
create policy organization_invitations_admin_select on app.organization_invitations for select to authenticated using (
  exists(select 1 from app.organization_members m where m.organization_id=organization_invitations.organization_id and m.user_id=(select auth.uid()) and m.role in ('organization_owner','organization_admin'))
);
revoke all on app.organization_invitations from anon,authenticated;
grant select on app.organization_invitations to authenticated;
grant all on app.organization_invitations to service_role;

create or replace function app.create_organization_invitation(
  p_organization_id uuid,
  p_email text,
  p_role app.organization_role
)
returns table(invitation_id uuid, raw_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(btrim(p_email));
  v_raw text;
  v_hash text;
  v_id uuid;
  v_expires timestamptz := now()+interval '7 days';
begin
  if v_user is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not exists(select 1 from app.organization_members m where m.organization_id=p_organization_id and m.user_id=v_user and m.role in ('organization_owner','organization_admin')) then raise exception 'admin_required' using errcode='42501'; end if;
  if p_role='organization_owner' then raise exception 'owner_invite_not_allowed' using errcode='22023'; end if;
  if v_email is null or length(v_email)>320 or position('@' in v_email)<=1 then raise exception 'invalid_email' using errcode='22023'; end if;
  if exists(select 1 from auth.users u join app.organization_members m on m.user_id=u.id where m.organization_id=p_organization_id and lower(u.email)=v_email) then raise exception 'already_member' using errcode='22023'; end if;
  update app.organization_invitations set status='expired',updated_at=now() where organization_id=p_organization_id and email_normalized=v_email and status='pending' and expires_at<=now();
  delete from app.organization_invitations where organization_id=p_organization_id and email_normalized=v_email and status='pending';
  v_raw := encode(extensions.gen_random_bytes(32),'hex');
  v_hash := encode(extensions.digest(convert_to(v_raw,'UTF8'),'sha256'),'hex');
  insert into app.organization_invitations(organization_id,email_normalized,role,status,token_hash,invited_by,expires_at)
  values(p_organization_id,v_email,p_role,'pending',v_hash,v_user,v_expires)
  returning id into v_id;
  return query select v_id,v_raw,v_expires;
end;
$$;

create or replace function app.accept_organization_invitation(
  p_invitation_id uuid,
  p_raw_token text
)
returns table(organization_id uuid, role app.organization_role)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_invite app.organization_invitations%rowtype;
  v_hash text;
begin
  if v_user is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if p_raw_token is null or length(p_raw_token)<>64 then raise exception 'invalid_token' using errcode='22023'; end if;
  v_hash := encode(extensions.digest(convert_to(p_raw_token,'UTF8'),'sha256'),'hex');
  select * into v_invite from app.organization_invitations i where i.id=p_invitation_id for update;
  if not found or v_invite.status<>'pending' or v_invite.expires_at<=now() or v_invite.token_hash<>v_hash then raise exception 'invalid_or_expired_invitation' using errcode='P0001'; end if;
  if v_email='' or v_email<>v_invite.email_normalized then raise exception 'invitation_email_mismatch' using errcode='42501'; end if;
  insert into app.organization_members(organization_id,user_id,role) values(v_invite.organization_id,v_user,v_invite.role) on conflict(organization_id,user_id) do nothing;
  update app.organization_invitations set status='accepted',accepted_by=v_user,accepted_at=now(),updated_at=now() where id=p_invitation_id;
  return query select v_invite.organization_id,v_invite.role;
end;
$$;

create or replace function app.revoke_organization_invitation(p_organization_id uuid,p_invitation_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();begin
  if v_user is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not exists(select 1 from app.organization_members m where m.organization_id=p_organization_id and m.user_id=v_user and m.role in ('organization_owner','organization_admin')) then raise exception 'admin_required' using errcode='42501'; end if;
  update app.organization_invitations set status='revoked',updated_at=now() where id=p_invitation_id and organization_id=p_organization_id and status='pending';
  return found;
end;$$;

revoke all on function app.create_organization_invitation(uuid,text,app.organization_role) from public,anon;
revoke all on function app.accept_organization_invitation(uuid,text) from public,anon;
revoke all on function app.revoke_organization_invitation(uuid,uuid) from public,anon;
grant execute on function app.create_organization_invitation(uuid,text,app.organization_role) to authenticated,service_role;
grant execute on function app.accept_organization_invitation(uuid,text) to authenticated,service_role;
grant execute on function app.revoke_organization_invitation(uuid,uuid) to authenticated,service_role;
