drop policy if exists conversations_tenant_select on app.conversations;
create policy conversations_owner_select on app.conversations for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists messages_tenant_select on app.messages;
drop policy if exists messages_insert_user_only on app.messages;
drop policy if exists messages_update_user_only on app.messages;
drop policy if exists messages_delete_user_only on app.messages;

create policy messages_owner_select on app.messages for select to authenticated using (
  exists (
    select 1 from app.conversations c
    where c.id = conversation_id
      and c.organization_id = organization_id
      and c.user_id = (select auth.uid())
  )
);
create policy messages_insert_user_only on app.messages for insert to authenticated with check (
  operations.has_org_write(organization_id)
  and role = 'user'
  and user_id = (select auth.uid())
  and exists (
    select 1 from app.conversations c
    where c.id = conversation_id
      and c.organization_id = organization_id
      and c.user_id = (select auth.uid())
  )
);
create policy messages_update_user_only on app.messages for update to authenticated using (
  operations.has_org_write(organization_id)
  and role = 'user'
  and user_id = (select auth.uid())
  and exists (
    select 1 from app.conversations c
    where c.id = conversation_id
      and c.organization_id = organization_id
      and c.user_id = (select auth.uid())
  )
) with check (
  operations.has_org_write(organization_id)
  and role = 'user'
  and user_id = (select auth.uid())
  and exists (
    select 1 from app.conversations c
    where c.id = conversation_id
      and c.organization_id = organization_id
      and c.user_id = (select auth.uid())
  )
);
create policy messages_delete_user_only on app.messages for delete to authenticated using (
  operations.has_org_write(organization_id)
  and role = 'user'
  and user_id = (select auth.uid())
  and exists (
    select 1 from app.conversations c
    where c.id = conversation_id
      and c.organization_id = organization_id
      and c.user_id = (select auth.uid())
  )
);

alter table ai.generation_requests
  add column project_id uuid,
  add column task_type text not null default 'general_chat',
  add column chosen_model_alias text,
  add column routing_reason text,
  add column fallback_model_alias text,
  add column escalation_model_alias text,
  add column idempotency_key text;

alter table ai.generation_requests
  add constraint generation_project_org_fk foreign key (project_id, organization_id)
    references app.projects(id, organization_id) on delete set null (project_id),
  add constraint generation_model_alias_check check (chosen_model_alias is null or chosen_model_alias in ('vexonyx-small','vexonyx-general','vexonyx-security','vexonyx-reasoning','vexonyx-embedding')),
  add constraint generation_fallback_alias_check check (fallback_model_alias is null or fallback_model_alias in ('vexonyx-small','vexonyx-general','vexonyx-security','vexonyx-reasoning')),
  add constraint generation_escalation_alias_check check (escalation_model_alias is null or escalation_model_alias in ('vexonyx-small','vexonyx-general','vexonyx-security','vexonyx-reasoning'));

create unique index generation_requests_org_idempotency_idx on ai.generation_requests(organization_id,idempotency_key) where idempotency_key is not null;
create index generation_requests_project_created_idx on ai.generation_requests(project_id,created_at desc) where project_id is not null;
create index generation_requests_conversation_created_idx on ai.generation_requests(conversation_id,created_at desc) where conversation_id is not null;
