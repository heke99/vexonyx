-- Complete waitlist verification before private beta launch.

create index if not exists waitlist_verification_active_idx
  on launch.waitlist_verification_tokens(entry_id, expires_at desc)
  where consumed_at is null;

create or replace function launch.verify_waitlist(
  p_entry_id uuid,
  p_token_hash text
)
returns table(referral_code text, status text)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_token_id uuid;
  v_referral text;
  v_status text;
begin
  if p_entry_id is null or p_token_hash is null or length(p_token_hash) <> 64 then
    raise exception 'invalid_verification' using errcode='22023';
  end if;

  select t.id into v_token_id
  from launch.waitlist_verification_tokens t
  where t.entry_id = p_entry_id
    and t.token_hash = p_token_hash
    and t.consumed_at is null
    and t.expires_at > now()
  for update;

  if v_token_id is null then
    raise exception 'invalid_or_expired_verification' using errcode='P0001';
  end if;

  update launch.waitlist_verification_tokens
  set consumed_at = now()
  where id = v_token_id;

  update launch.waitlist_entries w
  set status = case when w.status = 'pending_verification' then 'verified' else w.status end,
      email_verified_at = coalesce(w.email_verified_at, now()),
      updated_at = now()
  where w.id = p_entry_id
    and w.status <> 'blocked'
  returning w.referral_code, w.status into v_referral, v_status;

  if v_referral is null then
    raise exception 'waitlist_entry_unavailable' using errcode='P0001';
  end if;

  update launch.waitlist_verification_tokens
  set consumed_at = coalesce(consumed_at, now())
  where entry_id = p_entry_id
    and id <> v_token_id
    and consumed_at is null;

  return query select v_referral, v_status;
end;
$$;

revoke all on function launch.verify_waitlist(uuid,text) from public,anon,authenticated;
grant execute on function launch.verify_waitlist(uuid,text) to service_role;
