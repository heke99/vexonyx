drop policy if exists usage_user_monthly_self_select on usage.usage_user_monthly;
create policy usage_user_monthly_self_select
on usage.usage_user_monthly
for select
to authenticated
using (user_id = (select auth.uid()) and operations.is_org_member(organization_id));

drop policy if exists credit_user_monthly_self_select on usage.credit_user_monthly;
create policy credit_user_monthly_self_select
on usage.credit_user_monthly
for select
to authenticated
using (user_id = (select auth.uid()) and operations.is_org_member(organization_id));
