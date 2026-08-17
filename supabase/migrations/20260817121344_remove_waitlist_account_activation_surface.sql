-- Remove all waitlist account-activation capability while VEXONYX is waitlist-only.

drop trigger if exists vexonyx_waitlist_convert_auth_user on auth.users;
drop function if exists launch.handle_waitlist_auth_conversion();
drop function if exists launch.inspect_waitlist_invitation(uuid,text);
drop function if exists launch.issue_waitlist_invitation(uuid,text,text);
drop function if exists launch.waitlist_auth_creation_allowed(text,text,text);

revoke all on launch.waitlist_invitations from anon,authenticated;

notify pgrst,'reload schema';