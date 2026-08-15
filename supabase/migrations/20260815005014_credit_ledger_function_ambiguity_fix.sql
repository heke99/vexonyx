-- Disambiguate PL/pgSQL output parameter `balance` from billing.credit_accounts.balance.
create or replace function billing.apply_credit_entry(
  p_organization_id uuid,
  p_user_id uuid,
  p_entry_type text,
  p_amount bigint,
  p_idempotency_key text,
  p_external_reference text default null,
  p_metadata jsonb default '{}'::jsonb
) returns table(ledger_id uuid,balance bigint)
language plpgsql security definer set search_path=''
as $$
declare
  v_account billing.credit_accounts%rowtype;
  v_id uuid;
begin
  if p_amount = 0 or p_entry_type not in ('purchase','plan_grant','usage','admin_adjustment','refund','expiry','reversal') then
    raise exception 'invalid_credit_entry' using errcode='22023';
  end if;

  select l.id,l.balance_after into v_id,balance
  from billing.credit_ledger l
  where l.organization_id=p_organization_id and l.idempotency_key=p_idempotency_key;
  if v_id is not null then
    ledger_id:=v_id;
    return next;
    return;
  end if;

  insert into billing.credit_accounts(organization_id)
  values(p_organization_id)
  on conflict do nothing;

  select * into v_account
  from billing.credit_accounts a
  where a.organization_id=p_organization_id
  for update;

  if v_account.balance + p_amount < 0 then
    raise exception 'insufficient_credits' using errcode='P0001';
  end if;

  update billing.credit_accounts a set
    balance=a.balance+p_amount,
    lifetime_purchased=a.lifetime_purchased + case when p_entry_type='purchase' and p_amount>0 then p_amount else 0 end,
    lifetime_granted=a.lifetime_granted + case when p_entry_type in ('plan_grant','admin_adjustment') and p_amount>0 then p_amount else 0 end,
    lifetime_consumed=a.lifetime_consumed + case when p_entry_type='usage' and p_amount<0 then -p_amount else 0 end,
    updated_at=now()
  where a.organization_id=p_organization_id
  returning a.balance into balance;

  insert into billing.credit_ledger(organization_id,user_id,entry_type,amount,balance_after,idempotency_key,external_reference,metadata)
  values(p_organization_id,p_user_id,p_entry_type,p_amount,balance,p_idempotency_key,p_external_reference,coalesce(p_metadata,'{}'::jsonb))
  returning id into ledger_id;

  return next;
end $$;

revoke all on function billing.apply_credit_entry(uuid,uuid,text,bigint,text,text,jsonb) from public,anon,authenticated;
grant execute on function billing.apply_credit_entry(uuid,uuid,text,bigint,text,text,jsonb) to service_role;
