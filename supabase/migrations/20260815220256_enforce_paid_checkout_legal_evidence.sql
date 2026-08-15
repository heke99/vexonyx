create or replace function billing.enforce_paid_checkout_legal_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id text;
  v_catalog_id text;
  v_acceptance_id uuid;
  v_completed_at timestamptz;
begin
  if new.kind not in ('subscription', 'credit_pack') then
    return new;
  end if;

  v_session_id := nullif(new.metadata ->> 'checkout_session_id', '');
  v_catalog_id := nullif(new.metadata ->> 'catalog_id', '');

  if new.user_id is null
    or v_session_id is null
    or v_session_id !~ '^cs_[A-Za-z0-9_]+$'
    or v_catalog_id is null
  then
    raise exception 'checkout_legal_evidence_incomplete';
  end if;

  select acceptance.id, acceptance.completed_at
  into v_acceptance_id, v_completed_at
  from billing.legal_acceptances as acceptance
  where acceptance.organization_id = new.organization_id
    and acceptance.user_id = new.user_id
    and acceptance.checkout_kind = new.kind
    and acceptance.catalog_id::text = v_catalog_id
    and acceptance.provider_checkout_session_id = v_session_id
    and acceptance.terms_accepted
    and acceptance.refund_policy_accepted
    and acceptance.acceptable_use_accepted
    and acceptance.immediate_performance_requested
    and acceptance.professional_use_acknowledged
    and (new.kind <> 'subscription' or acceptance.auto_renewal_acknowledged)
  limit 1;

  if v_acceptance_id is null then
    raise exception 'checkout_legal_acceptance_missing';
  end if;

  if v_completed_at is null then
    update billing.legal_acceptances
    set completed_at = coalesce(new.occurred_at, now())
    where id = v_acceptance_id
      and completed_at is null;
  end if;

  return new;
end;
$$;

revoke all on function billing.enforce_paid_checkout_legal_evidence() from public, anon, authenticated;

drop trigger if exists enforce_paid_checkout_legal_evidence on billing.payment_transactions;
create trigger enforce_paid_checkout_legal_evidence
before insert or update of organization_id, user_id, kind, metadata, occurred_at
on billing.payment_transactions
for each row
execute function billing.enforce_paid_checkout_legal_evidence();
