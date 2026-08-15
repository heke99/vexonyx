create table if not exists billing.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  checkout_kind text not null check (checkout_kind in ('subscription','credit_pack')),
  catalog_id uuid not null,
  terms_version text not null,
  refund_policy_version text not null,
  acceptable_use_version text not null,
  terms_accepted boolean not null,
  refund_policy_accepted boolean not null,
  acceptable_use_accepted boolean not null,
  immediate_performance_requested boolean not null,
  professional_use_acknowledged boolean not null,
  auto_renewal_acknowledged boolean not null default false,
  policy_snapshot jsonb not null default '{}'::jsonb,
  user_agent text,
  provider_checkout_session_id text,
  accepted_at timestamptz not null default now(),
  completed_at timestamptz,
  retention_until timestamptz not null default (now() + interval '7 years'),
  metadata jsonb not null default '{}'::jsonb
);

comment on table billing.legal_acceptances is
  'Server-written evidence of checkout policy acceptance. Organization/user UUIDs intentionally have no cascading foreign keys so contractual evidence survives ordinary account deletion for the configured legal-retention period.';

create unique index if not exists legal_acceptances_provider_checkout_session_uidx
  on billing.legal_acceptances(provider_checkout_session_id)
  where provider_checkout_session_id is not null;

create index if not exists legal_acceptances_org_accepted_idx
  on billing.legal_acceptances(organization_id, accepted_at desc);

create index if not exists legal_acceptances_user_accepted_idx
  on billing.legal_acceptances(user_id, accepted_at desc);

alter table billing.legal_acceptances enable row level security;
revoke all on table billing.legal_acceptances from public, anon, authenticated;
grant select, insert, update on table billing.legal_acceptances to service_role;
