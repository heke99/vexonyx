alter table app.messages add column idempotency_key text;
create unique index messages_conversation_idempotency_idx on app.messages(conversation_id,idempotency_key) where idempotency_key is not null;
create index messages_user_created_idx on app.messages(user_id,created_at desc) where user_id is not null;
