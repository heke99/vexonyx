drop policy if exists messages_owner_select on app.messages;
drop policy if exists messages_insert_user_only on app.messages;
drop policy if exists messages_update_user_only on app.messages;
drop policy if exists messages_delete_user_only on app.messages;

create policy messages_owner_select on app.messages
for select to authenticated
using (
  exists (
    select 1 from app.conversations c
    where c.id = messages.conversation_id
      and c.organization_id = messages.organization_id
      and c.user_id = (select auth.uid())
  )
);

create policy messages_insert_user_only on app.messages
for insert to authenticated
with check (
  operations.has_org_write(organization_id)
  and role = 'user'
  and user_id = (select auth.uid())
  and exists (
    select 1 from app.conversations c
    where c.id = messages.conversation_id
      and c.organization_id = messages.organization_id
      and c.user_id = (select auth.uid())
  )
);

create policy messages_update_user_only on app.messages
for update to authenticated
using (
  operations.has_org_write(organization_id)
  and role = 'user'
  and user_id = (select auth.uid())
  and exists (
    select 1 from app.conversations c
    where c.id = messages.conversation_id
      and c.organization_id = messages.organization_id
      and c.user_id = (select auth.uid())
  )
)
with check (
  operations.has_org_write(organization_id)
  and role = 'user'
  and user_id = (select auth.uid())
  and exists (
    select 1 from app.conversations c
    where c.id = messages.conversation_id
      and c.organization_id = messages.organization_id
      and c.user_id = (select auth.uid())
  )
);

create policy messages_delete_user_only on app.messages
for delete to authenticated
using (
  operations.has_org_write(organization_id)
  and role = 'user'
  and user_id = (select auth.uid())
  and exists (
    select 1 from app.conversations c
    where c.id = messages.conversation_id
      and c.organization_id = messages.organization_id
      and c.user_id = (select auth.uid())
  )
);
