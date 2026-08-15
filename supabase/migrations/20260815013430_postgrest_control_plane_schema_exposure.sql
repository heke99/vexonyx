-- Restore PostgREST visibility for server-side control-plane schemas.
-- Exposure does not grant table/function privileges; audit and marketing remain service-role only.
alter role authenticator set pgrst.db_schemas='public,app,launch,ai,security,artifacts,reports,usage,billing,integrations,operations,audit,marketing';

grant usage on schema operations,audit,marketing to service_role;
revoke all on schema audit,marketing from public,anon,authenticated;

notify pgrst,'reload config';
