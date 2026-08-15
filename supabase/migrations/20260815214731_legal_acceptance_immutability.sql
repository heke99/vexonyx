alter table billing.legal_acceptances
  add constraint legal_acceptances_provider_session_format_chk
  check (provider_checkout_session_id is null or provider_checkout_session_id ~ '^cs_[A-Za-z0-9_]+$') not valid;

alter table billing.legal_acceptances validate constraint legal_acceptances_provider_session_format_chk;

alter table billing.legal_acceptances
  add constraint legal_acceptances_completed_after_acceptance_chk
  check (completed_at is null or completed_at >= accepted_at) not valid;

alter table billing.legal_acceptances validate constraint legal_acceptances_completed_after_acceptance_chk;

create or replace function billing.guard_legal_acceptance_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.user_id is distinct from old.user_id
    or new.checkout_kind is distinct from old.checkout_kind
    or new.catalog_id is distinct from old.catalog_id
    or new.terms_version is distinct from old.terms_version
    or new.refund_policy_version is distinct from old.refund_policy_version
    or new.acceptable_use_version is distinct from old.acceptable_use_version
    or new.terms_accepted is distinct from old.terms_accepted
    or new.refund_policy_accepted is distinct from old.refund_policy_accepted
    or new.acceptable_use_accepted is distinct from old.acceptable_use_accepted
    or new.immediate_performance_requested is distinct from old.immediate_performance_requested
    or new.professional_use_acknowledged is distinct from old.professional_use_acknowledged
    or new.auto_renewal_acknowledged is distinct from old.auto_renewal_acknowledged
    or new.policy_snapshot is distinct from old.policy_snapshot
    or new.user_agent is distinct from old.user_agent
    or new.accepted_at is distinct from old.accepted_at
    or new.retention_until is distinct from old.retention_until
    or new.metadata is distinct from old.metadata
  then
    raise exception 'legal_acceptance_immutable';
  end if;

  if old.provider_checkout_session_id is not null
    and new.provider_checkout_session_id is distinct from old.provider_checkout_session_id
  then
    raise exception 'legal_acceptance_session_immutable';
  end if;

  if old.completed_at is not null
    and new.completed_at is distinct from old.completed_at
  then
    raise exception 'legal_acceptance_completion_immutable';
  end if;

  return new;
end;
$$;

revoke all on function billing.guard_legal_acceptance_immutable() from public, anon, authenticated;

drop trigger if exists guard_legal_acceptance_immutable on billing.legal_acceptances;
create trigger guard_legal_acceptance_immutable
before update on billing.legal_acceptances
for each row
execute function billing.guard_legal_acceptance_immutable();
