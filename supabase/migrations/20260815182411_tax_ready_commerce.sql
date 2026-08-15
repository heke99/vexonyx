alter table billing.plans
  add column if not exists tax_code text,
  add column if not exists tax_code_candidate text,
  add column if not exists tax_classification_status text not null default 'pending_confirmation';

alter table billing.plans
  drop constraint if exists plans_tax_classification_status_check;
alter table billing.plans
  add constraint plans_tax_classification_status_check
  check (tax_classification_status in ('pending_confirmation','confirmed','rejected'));

alter table billing.plan_prices
  add column if not exists tax_behavior text not null default 'exclusive';
alter table billing.plan_prices
  drop constraint if exists plan_prices_tax_behavior_check;
alter table billing.plan_prices
  add constraint plan_prices_tax_behavior_check
  check (tax_behavior in ('exclusive','inclusive'));

alter table billing.credit_products
  add column if not exists tax_code text,
  add column if not exists tax_code_candidate text,
  add column if not exists tax_classification_status text not null default 'prepaid_usage_review',
  add column if not exists tax_behavior text not null default 'exclusive';

alter table billing.credit_products
  drop constraint if exists credit_products_tax_classification_status_check;
alter table billing.credit_products
  add constraint credit_products_tax_classification_status_check
  check (tax_classification_status in ('prepaid_usage_review','pending_confirmation','confirmed','rejected'));
alter table billing.credit_products
  drop constraint if exists credit_products_tax_behavior_check;
alter table billing.credit_products
  add constraint credit_products_tax_behavior_check
  check (tax_behavior in ('exclusive','inclusive'));

update billing.plans
set tax_code_candidate = 'txcd_10105002',
    tax_classification_status = case when tax_code is not null then 'confirmed' else 'pending_confirmation' end,
    updated_at = now()
where provider = 'stripe';

update billing.plan_prices
set tax_behavior = 'exclusive'
where provider = 'stripe';

update billing.credit_products
set tax_code_candidate = 'txcd_10105002',
    tax_classification_status = case when tax_code is not null then 'confirmed' else 'prepaid_usage_review' end,
    tax_behavior = 'exclusive',
    updated_at = now()
where provider = 'stripe';

create table if not exists billing.tax_settings (
  provider text primary key,
  head_office jsonb not null default '{}'::jsonb,
  default_tax_behavior text not null default 'exclusive',
  automatic_collection_enabled boolean not null default false,
  active_registration_count integer not null default 0,
  last_registration_check_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tax_settings_behavior_check check (default_tax_behavior in ('exclusive','inclusive')),
  constraint tax_settings_registration_count_check check (active_registration_count >= 0)
);

alter table billing.tax_settings enable row level security;
revoke all on billing.tax_settings from public, anon, authenticated;
grant all on billing.tax_settings to service_role;

insert into billing.tax_settings (
  provider,
  head_office,
  default_tax_behavior,
  automatic_collection_enabled,
  active_registration_count,
  last_registration_check_at,
  metadata,
  updated_at
) values (
  'stripe',
  '{"line1":"30 North Gould Street","city":"Sheridan","state":"WY","postal_code":"82801","country":"US"}'::jsonb,
  'exclusive',
  false,
  0,
  now(),
  '{"subscription_tax_code_candidate":"txcd_10105002","credit_pack_tax_code_candidate":"txcd_10105002","collection_policy":"off_until_confirmed_registration_and_tax_classification"}'::jsonb,
  now()
)
on conflict (provider) do update set
  head_office = excluded.head_office,
  default_tax_behavior = excluded.default_tax_behavior,
  automatic_collection_enabled = false,
  active_registration_count = 0,
  last_registration_check_at = excluded.last_registration_check_at,
  metadata = billing.tax_settings.metadata || excluded.metadata,
  updated_at = now();

alter table billing.billing_customers
  add column if not exists billing_name text,
  add column if not exists billing_address jsonb not null default '{}'::jsonb,
  add column if not exists tax_ids jsonb not null default '[]'::jsonb,
  add column if not exists tax_exempt text,
  add column if not exists tax_location_source text,
  add column if not exists tax_updated_at timestamptz;

alter table billing.payment_transactions
  add column if not exists subtotal_minor bigint,
  add column if not exists tax_minor bigint not null default 0,
  add column if not exists total_minor bigint,
  add column if not exists tax_status text not null default 'not_calculated',
  add column if not exists tax_country text,
  add column if not exists tax_state text,
  add column if not exists tax_postal_code text,
  add column if not exists tax_details jsonb not null default '{}'::jsonb;

alter table billing.payment_transactions
  drop constraint if exists payment_transactions_tax_minor_check;
alter table billing.payment_transactions
  add constraint payment_transactions_tax_minor_check check (tax_minor >= 0);
alter table billing.payment_transactions
  drop constraint if exists payment_transactions_subtotal_minor_check;
alter table billing.payment_transactions
  add constraint payment_transactions_subtotal_minor_check check (subtotal_minor is null or subtotal_minor >= 0);
alter table billing.payment_transactions
  drop constraint if exists payment_transactions_total_minor_check;
alter table billing.payment_transactions
  add constraint payment_transactions_total_minor_check check (total_minor is null or total_minor >= 0);

update billing.payment_transactions
set subtotal_minor = coalesce(subtotal_minor, amount_minor),
    total_minor = coalesce(total_minor, amount_minor),
    tax_minor = coalesce(tax_minor, 0),
    tax_status = case when tax_status = 'not_calculated' then 'legacy_unclassified' else tax_status end
where subtotal_minor is null or total_minor is null or tax_status = 'not_calculated';

create index if not exists payment_transactions_tax_country_occurred_idx
  on billing.payment_transactions (tax_country, occurred_at desc)
  where tax_country is not null;

alter table billing.subscriptions
  add column if not exists automatic_tax_enabled boolean not null default false,
  add column if not exists tax_details jsonb not null default '{}'::jsonb;
