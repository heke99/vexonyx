create table if not exists usage.usage_user_monthly (
  organization_id uuid not null references app.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null,
  metric text not null,
  quantity numeric not null default 0,
  cost numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id, month_start, metric),
  constraint usage_user_monthly_month_start_check check (date_trunc('month', month_start::timestamptz)::date = month_start)
);

create index if not exists usage_user_monthly_user_month_idx
  on usage.usage_user_monthly (user_id, month_start desc, metric);

create index if not exists credit_ledger_org_user_usage_created_idx
  on billing.credit_ledger (organization_id, user_id, created_at desc)
  where user_id is not null and entry_type = 'usage';

alter table usage.usage_user_monthly enable row level security;

revoke all on usage.usage_user_monthly from anon, authenticated;
grant select on usage.usage_user_monthly to authenticated;
grant all on usage.usage_user_monthly to service_role;

drop policy if exists usage_user_monthly_self_select on usage.usage_user_monthly;
create policy usage_user_monthly_self_select
on usage.usage_user_monthly
for select
to authenticated
using (user_id = auth.uid() and operations.is_org_member(organization_id));

create or replace function usage.aggregate_user_usage_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null then
    return new;
  end if;

  insert into usage.usage_user_monthly (
    organization_id,
    user_id,
    month_start,
    metric,
    quantity,
    cost,
    updated_at
  ) values (
    new.organization_id,
    new.user_id,
    date_trunc('month', new.created_at)::date,
    new.event_type,
    new.quantity,
    new.cost,
    now()
  )
  on conflict (organization_id, user_id, month_start, metric)
  do update set
    quantity = usage.usage_user_monthly.quantity + excluded.quantity,
    cost = usage.usage_user_monthly.cost + excluded.cost,
    updated_at = now();

  return new;
end;
$$;

revoke all on function usage.aggregate_user_usage_event() from public, anon, authenticated;
grant execute on function usage.aggregate_user_usage_event() to service_role;

drop trigger if exists usage_events_user_monthly_aggregate on usage.usage_events;
create trigger usage_events_user_monthly_aggregate
after insert on usage.usage_events
for each row
execute function usage.aggregate_user_usage_event();

insert into usage.usage_user_monthly (organization_id,user_id,month_start,metric,quantity,cost,updated_at)
select organization_id,user_id,date_trunc('month',created_at)::date,event_type,sum(quantity),sum(cost),max(created_at)
from usage.usage_events
where user_id is not null
group by organization_id,user_id,date_trunc('month',created_at)::date,event_type
on conflict (organization_id,user_id,month_start,metric)
do update set quantity=excluded.quantity,cost=excluded.cost,updated_at=excluded.updated_at;
