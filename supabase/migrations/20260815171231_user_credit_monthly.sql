create table if not exists usage.credit_user_monthly (
  organization_id uuid not null references app.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null,
  credits_consumed bigint not null default 0 check (credits_consumed >= 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id, month_start),
  constraint credit_user_monthly_month_start_check check (date_trunc('month', month_start::timestamptz)::date = month_start)
);

create index if not exists credit_user_monthly_user_month_idx
  on usage.credit_user_monthly (user_id, month_start desc);

alter table usage.credit_user_monthly enable row level security;

revoke all on usage.credit_user_monthly from anon, authenticated;
grant select on usage.credit_user_monthly to authenticated;
grant all on usage.credit_user_monthly to service_role;

drop policy if exists credit_user_monthly_self_select on usage.credit_user_monthly;
create policy credit_user_monthly_self_select
on usage.credit_user_monthly
for select
to authenticated
using (user_id = auth.uid() and operations.is_org_member(organization_id));

create or replace function usage.aggregate_user_credit_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null or new.entry_type <> 'usage' then
    return new;
  end if;

  insert into usage.credit_user_monthly (
    organization_id,
    user_id,
    month_start,
    credits_consumed,
    updated_at
  ) values (
    new.organization_id,
    new.user_id,
    date_trunc('month', new.created_at)::date,
    -new.amount,
    now()
  )
  on conflict (organization_id, user_id, month_start)
  do update set
    credits_consumed = usage.credit_user_monthly.credits_consumed + excluded.credits_consumed,
    updated_at = now();

  return new;
end;
$$;

revoke all on function usage.aggregate_user_credit_usage() from public, anon, authenticated;
grant execute on function usage.aggregate_user_credit_usage() to service_role;

drop trigger if exists credit_ledger_user_monthly_aggregate on billing.credit_ledger;
create trigger credit_ledger_user_monthly_aggregate
after insert on billing.credit_ledger
for each row
when (new.user_id is not null and new.entry_type = 'usage')
execute function usage.aggregate_user_credit_usage();

insert into usage.credit_user_monthly (organization_id,user_id,month_start,credits_consumed,updated_at)
select organization_id,user_id,date_trunc('month',created_at)::date,sum(-amount)::bigint,max(created_at)
from billing.credit_ledger
where user_id is not null and entry_type = 'usage'
group by organization_id,user_id,date_trunc('month',created_at)::date
on conflict (organization_id,user_id,month_start)
do update set credits_consumed=excluded.credits_consumed,updated_at=excluded.updated_at;
