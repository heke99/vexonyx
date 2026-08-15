create or replace function billing.sync_event_organization_from_payment_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id text;
begin
  v_event_id := nullif(new.metadata ->> 'event_id', '');
  if v_event_id is null then
    return new;
  end if;

  update billing.events
  set organization_id = new.organization_id
  where external_id = v_event_id
    and organization_id is null;

  return new;
end;
$$;

revoke all on function billing.sync_event_organization_from_payment_transaction() from public, anon, authenticated;
grant execute on function billing.sync_event_organization_from_payment_transaction() to service_role;

drop trigger if exists sync_event_organization_from_payment_transaction on billing.payment_transactions;
create trigger sync_event_organization_from_payment_transaction
after insert or update of organization_id, metadata on billing.payment_transactions
for each row
execute function billing.sync_event_organization_from_payment_transaction();

update billing.events as event
set organization_id = transaction.organization_id
from billing.payment_transactions as transaction
where event.organization_id is null
  and nullif(transaction.metadata ->> 'event_id', '') = event.external_id;
