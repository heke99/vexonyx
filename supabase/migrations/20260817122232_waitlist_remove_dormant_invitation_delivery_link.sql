alter table launch.waitlist_email_deliveries
  drop column if exists invitation_id;

notify pgrst,'reload schema';