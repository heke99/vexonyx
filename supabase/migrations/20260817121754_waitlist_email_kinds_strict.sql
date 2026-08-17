alter table launch.waitlist_email_deliveries
  drop constraint if exists waitlist_email_deliveries_kind_check;

alter table launch.waitlist_email_deliveries
  add constraint waitlist_email_deliveries_kind_check
  check(kind in ('verification','confirmed'));

notify pgrst,'reload schema';